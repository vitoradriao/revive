import * as SQLite from 'expo-sqlite';
import * as Crypto from 'expo-crypto';
import type { BootstrapData, QueueOperationType, UrgeEventPage } from '@/domain/types';
import { decodePayload, encodePayload, validBootstrap, validUrgeEventPage } from './envelopes';
import { migrateDatabase } from './migrations';
import { withPendingMutations } from '@/domain/pending-snapshot';
import { mapQueueRow } from './queue-row';

let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;

const getDatabase = async () => {
  if (!databasePromise) {
    databasePromise = SQLite.openDatabaseAsync('revive.db').then(async (db) => {
      try {
        await migrateDatabase(db);
        await db.execAsync("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; UPDATE mutation_queue_v1 SET status = 'pending' WHERE status = 'syncing'");
        return db;
      } catch (error) {
        await db.closeAsync();
        throw error;
      }
    }).catch((error) => {
      databasePromise = null; // An interrupted migration can be retried on the next open.
      throw error;
    });
  }
  return databasePromise;
};

export const cacheBootstrap = async (userId: string, data: BootstrapData) => {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO bootstrap_cache_v1(user_id, payload, updated_at, payload_version)
     VALUES (?, ?, ?, 1)
     ON CONFLICT(user_id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at, payload_version = 1`,
    userId,
    encodePayload(data),
    new Date().toISOString(),
  );
};

export const cacheUrgeEventPage = async (userId: string, queryKey: string, page: UrgeEventPage) => {
  if (!queryKey || queryKey.length > 500 || !validUrgeEventPage(page, userId)) {
    throw new Error('Resposta local de vontades inválida.');
  }
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO urge_event_pages_v1(user_id, query_key, payload, updated_at, payload_version)
     VALUES (?, ?, ?, ?, 1)
     ON CONFLICT(user_id, query_key) DO UPDATE SET
       payload = excluded.payload, updated_at = excluded.updated_at, payload_version = 1`,
    userId,
    queryKey,
    encodePayload(page),
    new Date().toISOString(),
  );
};

export const getCachedUrgeEventPage = async (userId: string, queryKey: string) => {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ payload: string; payload_version: number; updated_at: string }>(
    'SELECT payload, payload_version, updated_at FROM urge_event_pages_v1 WHERE user_id = ? AND query_key = ?',
    userId,
    queryKey,
  );
  if (!row) return null;
  try {
    const page = decodePayload(row.payload, row.payload_version);
    return validUrgeEventPage(page, userId) ? { page, updatedAt: row.updated_at } : null;
  } catch {
    return null;
  }
};

export const getCachedBootstrap = async (userId: string) => {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ payload: string; payload_version: number }>(
    'SELECT payload, payload_version FROM bootstrap_cache_v1 WHERE user_id = ?',
    userId,
  );
  if (!row) return null;
  try {
    const data = decodePayload(row.payload, row.payload_version);
    return validBootstrap(data, userId) ? data : null;
  } catch {
    return null;
  }
};

export const enqueueMutation = async (
  userId: string,
  type: QueueOperationType,
  payload: Record<string, unknown>,
  occurredAt = new Date().toISOString(),
  id = Crypto.randomUUID(),
) => {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO mutation_queue_v1
      (id, user_id, type, payload, occurred_at, attempts, next_retry_at, status, payload_version)
     VALUES (?, ?, ?, ?, ?, 0, ?, 'pending', 1)`,
    id,
    userId,
    type,
    encodePayload(payload),
    occurredAt,
    occurredAt,
  );
  return id;
};

export const getPendingMutations = async (userId: string) => {
  const db = await getDatabase();
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT q.*, m.server_id AS resolved_record_id FROM mutation_queue_v1 q
     LEFT JOIN diary_record_ids_v1 m ON m.user_id=q.user_id AND m.local_id=q.id
     WHERE q.user_id = ? AND q.status IN ('pending', 'failed', 'syncing')
     ORDER BY q.rowid ASC`,
    userId,
  );
  return rows.map(mapQueueRow);
};

export const countPendingMutations = async (userId: string) => {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ total: number }>(
    `SELECT COUNT(*) AS total FROM mutation_queue_v1
     WHERE user_id = ? AND status IN ('pending', 'failed', 'syncing')`,
    userId,
  );
  return row?.total ?? 0;
};

export const markMutationSyncing = async (id: string) => {
  const db = await getDatabase();
  await db.runAsync(`UPDATE mutation_queue_v1 SET status = 'syncing' WHERE id = ?`, id);
};

export const markMutationFailed = async (id: string, attempts: number, error: string, retryable: boolean) => {
  const db = await getDatabase();
  const delayMs = retryable ? Math.min(60_000, 1_000 * 2 ** Math.min(attempts, 6)) : 31_536_000_000;
  await db.runAsync(
    `UPDATE mutation_queue_v1
     SET status = 'failed', attempts = ?, next_retry_at = ?, last_error = ?
     WHERE id = ?`,
    attempts,
    new Date(Date.now() + delayMs).toISOString(),
    error.slice(0, 500),
    id,
  );
};

export const removeMutation = async (id: string) => {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM mutation_queue_v1 WHERE id = ?', id);
};

/** Commit the canonical server snapshot and remove its acknowledged event together. */
export const reconcileMutations = async (userId: string, ids: string[], data: BootstrapData) => {
  if (!validBootstrap(data, userId)) throw new Error('Resposta de sincronização inválida.');
  const db = await getDatabase();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO bootstrap_cache_v1(user_id, payload, updated_at, payload_version)
       VALUES (?, ?, ?, 1)
       ON CONFLICT(user_id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at, payload_version = 1`,
      userId,
      encodePayload(data),
      new Date().toISOString(),
    );
    // Keep previously paged history canonical after a confirmed correction.
    const records = new Map(data.registros.map(record => [record.id, record]));
    for (const row of await db.getAllAsync<{ query_key: string; payload: string }>('SELECT query_key,payload FROM diary_pages_v1 WHERE user_id=?', userId)) {
      try {
        const page = decodePayload(row.payload, 1) as import('@/domain/types').RecordPage;
        if (!Array.isArray(page.registros)) continue;
        page.registros = page.registros.map(record => records.get(record.id) || record);
        await db.runAsync('UPDATE diary_pages_v1 SET payload=? WHERE user_id=? AND query_key=?', encodePayload(page), userId, row.query_key);
      } catch { /* Preserve malformed cache bytes for recovery. */ }
    }
    for (const id of ids) await db.runAsync('DELETE FROM mutation_queue_v1 WHERE user_id = ? AND id = ?', userId, id);
  });
};

export const retryUserMutation = async (userId: string, id: string) => {
  const db = await getDatabase();
  await db.runAsync("UPDATE mutation_queue_v1 SET status = 'pending', next_retry_at = ? WHERE user_id = ? AND id = ? AND status = 'failed'", new Date().toISOString(), userId, id);
};

export const discardUserMutation = async (userId: string, id: string) => {
  const db = await getDatabase();
  await db.withTransactionAsync(async () => {
    const pending = await getPendingMutations(userId);
    if (pending.some(m => m.type === 'record.update' && m.payload.dependsOn === id)) throw new Error('Este registro tem uma correção dependente. Resolva ou descarte a correção antes da criação.');
    await db.runAsync("DELETE FROM mutation_queue_v1 WHERE user_id = ? AND id = ? AND status != 'syncing'", userId, id);
  });
};

export const clearUserData = async (userId: string) => {
  const db = await getDatabase();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM diary_record_ids_v1 WHERE user_id = ?', userId);
    await db.runAsync('DELETE FROM diary_pages_v1 WHERE user_id = ?', userId);
    await db.runAsync('DELETE FROM urge_event_pages_v1 WHERE user_id = ?', userId);
    await db.runAsync('DELETE FROM bootstrap_cache_v1 WHERE user_id = ?', userId);
    await db.runAsync('DELETE FROM mutation_queue_v1 WHERE user_id = ?', userId);
  });
};

export const cacheRecordPage = async (userId: string, key: string, page: import('@/domain/types').RecordPage) => {
  const db = await getDatabase();
  await db.runAsync('INSERT INTO diary_pages_v1 VALUES(?,?,?) ON CONFLICT(user_id,query_key) DO UPDATE SET payload=excluded.payload', userId, key, encodePayload(page));
};
export const getCachedRecordPage = async (userId: string, key: string): Promise<import('@/domain/types').RecordPage | null> => {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ payload: string }>('SELECT payload FROM diary_pages_v1 WHERE user_id=? AND query_key=?', userId, key);
  if (!row) return null;
  try {
    const page = decodePayload(row.payload, 1) as import('@/domain/types').RecordPage;
    return Array.isArray(page.registros) && page.registros.every(r => typeof r.id === 'string' && typeof r.vicio_id === 'string' && typeof r.data_registro === 'string') && (page.next_cursor === null || typeof page.next_cursor === 'string') ? page : null;
  } catch { return null; }
};
/** Rebind dependent edits durably before they can replay, including after a crash. */
export const bindRecordEdits = async (userId: string, creationId: string, record: import('@/domain/types').DailyRecord) => {
  const db = await getDatabase();
  await db.withTransactionAsync(async () => {
    await db.runAsync('INSERT INTO diary_record_ids_v1 VALUES(?,?,?) ON CONFLICT(user_id,local_id) DO UPDATE SET server_id=excluded.server_id', userId, creationId, record.id);
    const pending = await getPendingMutations(userId);
    for (const item of pending.filter(m => m.type === 'record.update' && m.payload.dependsOn === creationId)) {
      const { dependsOn: _dependency, ...payload } = item.payload;
      await db.runAsync('UPDATE mutation_queue_v1 SET payload=? WHERE user_id=? AND id=?', encodePayload({ ...payload, recordId: record.id, expected_version: record.revision ?? 1 }), userId, item.id);
    }
  });
};
export const replaceFailedRecordEdit = async (userId: string, oldId: string, id: string, payload: Record<string, unknown>) => {
  const db = await getDatabase();
  await db.withTransactionAsync(async () => {
    const old = (await getPendingMutations(userId)).find(m => m.id === oldId && m.type === 'record.update' && m.status === 'failed');
    if (!old) throw new Error('A alteração já mudou. Atualize o diário.');
    await enqueueMutation(userId, 'record.update', payload, new Date().toISOString(), id);
    await db.runAsync('DELETE FROM mutation_queue_v1 WHERE user_id=? AND id=?', userId, oldId);
  });
};

export const getCachedDiaryRecord = async (userId: string, id: string) => {
  const bootstrap = await getCachedBootstrap(userId);
  let record = bootstrap?.registros.find(r => r.id === id) || null;
  const db = await getDatabase();
  for (const row of await db.getAllAsync<{ payload: string }>('SELECT payload FROM diary_pages_v1 WHERE user_id=?', userId)) {
    try {
      const page = decodePayload(row.payload, 1) as import('@/domain/types').RecordPage;
      const candidate = page.registros?.find(r => r.id === id);
      if (candidate && (!record || (candidate.revision ?? 0) > (record.revision ?? 0))) record = candidate;
    } catch { /* Preserve corrupt bytes; never expose another account's cache. */ }
  }
  const pending = await getPendingMutations(userId);
  const localSnapshot = { usuario: { id: userId, nome: '', email: '' }, registros: record ? [record] : [], vicios: [], recaidas: [], metas: [], server_time: '', mensagem: null } as BootstrapData;
  return withPendingMutations(localSnapshot, pending).registros.find(item => item.id === id) || record;
};

export const resolveDiaryRecordId = async (userId: string, id: string) => {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ server_id: string }>('SELECT server_id FROM diary_record_ids_v1 WHERE user_id=? AND local_id=?',userId,id);
  return row?.server_id || id;
};
