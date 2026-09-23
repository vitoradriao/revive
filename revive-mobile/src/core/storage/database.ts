import * as SQLite from 'expo-sqlite';
import * as Crypto from 'expo-crypto';
import type { BootstrapData, QueueOperationType } from '@/domain/types';
import { decodePayload, encodePayload, validBootstrap } from './envelopes';
import { migrateDatabase } from './migrations';
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
    `SELECT * FROM mutation_queue_v1
     WHERE user_id = ? AND status IN ('pending', 'failed', 'syncing')
     ORDER BY rowid ASC`,
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
    for (const id of ids) await db.runAsync('DELETE FROM mutation_queue_v1 WHERE user_id = ? AND id = ?', userId, id);
  });
};

export const retryUserMutation = async (userId: string, id: string) => {
  const db = await getDatabase();
  await db.runAsync("UPDATE mutation_queue_v1 SET status = 'pending', next_retry_at = ? WHERE user_id = ? AND id = ? AND status = 'failed'", new Date().toISOString(), userId, id);
};

export const discardUserMutation = async (userId: string, id: string) => {
  const db = await getDatabase();
  await db.runAsync("DELETE FROM mutation_queue_v1 WHERE user_id = ? AND id = ? AND status != 'syncing'", userId, id);
};

export const clearUserData = async (userId: string) => {
  const db = await getDatabase();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM bootstrap_cache_v1 WHERE user_id = ?', userId);
    await db.runAsync('DELETE FROM mutation_queue_v1 WHERE user_id = ?', userId);
  });
};
