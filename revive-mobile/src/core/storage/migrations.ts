import type * as SQLite from 'expo-sqlite';
import { decodePayload, encodePayload } from './envelopes';

export const DATABASE_VERSION = 3;

type Database = SQLite.SQLiteDatabase;

type LegacyRow = { id: string; payload: string };

/** Every schema and payload change commits with user_version or rolls back together. */
export async function migrateDatabase(db: Database) {
  const current = (await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version'))?.user_version ?? 0;
  if (current > DATABASE_VERSION) throw new Error('Dados locais criados por uma versão mais recente do aplicativo. Atualize o aplicativo para continuar.');
  if (current === 0) {
    await db.withExclusiveTransactionAsync(async (tx) => {
      const version = (await tx.getFirstAsync<{ user_version: number }>('PRAGMA user_version'))?.user_version ?? 0;
      if (version !== 0) throw new Error('Versão local alterada durante a migração.');
      await tx.execAsync(`
        CREATE TABLE IF NOT EXISTS bootstrap_cache (
          user_id TEXT PRIMARY KEY NOT NULL, payload TEXT NOT NULL, updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS mutation_queue (
          id TEXT PRIMARY KEY NOT NULL, user_id TEXT NOT NULL, type TEXT NOT NULL,
          payload TEXT NOT NULL, occurred_at TEXT NOT NULL,
          attempts INTEGER NOT NULL DEFAULT 0, next_retry_at TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending', last_error TEXT
        );
        CREATE INDEX IF NOT EXISTS mutation_queue_user_status
          ON mutation_queue(user_id, status, occurred_at);
      `);
      await tx.execAsync('ALTER TABLE bootstrap_cache ADD COLUMN payload_version INTEGER NOT NULL DEFAULT 0');
      await tx.execAsync('ALTER TABLE mutation_queue ADD COLUMN payload_version INTEGER NOT NULL DEFAULT 0');

      for (const row of await tx.getAllAsync<LegacyRow>('SELECT user_id AS id, payload FROM bootstrap_cache')) {
        let encoded: string;
        try { encoded = encodePayload(decodePayload(row.payload, 0)); }
        catch { continue; } // Keep malformed source bytes for recovery.
        await tx.runAsync('UPDATE bootstrap_cache SET payload = ?, payload_version = 1 WHERE user_id = ?', encoded, row.id);
      }
      for (const row of await tx.getAllAsync<LegacyRow>('SELECT id, payload FROM mutation_queue')) {
        let encoded: string;
        try { encoded = encodePayload(decodePayload(row.payload, 0)); }
        catch { continue; } // Keep malformed source bytes for recovery.
        await tx.runAsync('UPDATE mutation_queue SET payload = ?, payload_version = 1 WHERE id = ?', encoded, row.id);
      }
      // Legacy binaries keep using the old names. Read-only views make their
      // startup/reset writes fail instead of modifying a schema they cannot decode.
      await tx.execAsync(`
        ALTER TABLE bootstrap_cache RENAME TO bootstrap_cache_v1;
        ALTER TABLE mutation_queue RENAME TO mutation_queue_v1;
        CREATE VIEW bootstrap_cache AS SELECT user_id, payload, updated_at FROM bootstrap_cache_v1;
        CREATE VIEW mutation_queue AS SELECT id, user_id, type, payload, occurred_at,
          attempts, next_retry_at, status, last_error FROM mutation_queue_v1;
      `);
      await tx.execAsync('PRAGMA user_version = 1');
    });
  }

  const migratedVersion = (await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version'))?.user_version ?? 0;
  if (migratedVersion >= 2) { await migrateDiaryPages(db); return; }
  if (migratedVersion !== 1) throw new Error('Versão local não suportada para a migração de eventos.');
  await db.withExclusiveTransactionAsync(async (tx) => {
    const version = (await tx.getFirstAsync<{ user_version: number }>('PRAGMA user_version'))?.user_version ?? 0;
    if (version !== 1) throw new Error('Versão local alterada durante a migração.');
    await tx.execAsync(`
      CREATE TABLE urge_event_pages_v1 (
        user_id TEXT NOT NULL,
        query_key TEXT NOT NULL,
        payload TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        payload_version INTEGER NOT NULL CHECK (payload_version = 1),
        PRIMARY KEY (user_id, query_key)
      );
      CREATE INDEX urge_event_pages_user_updated
        ON urge_event_pages_v1(user_id, updated_at);
      PRAGMA user_version = 2;
    `);
  });
  await migrateDiaryPages(db);
}

async function migrateDiaryPages(db: Database) {
  const version = (await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version'))?.user_version;
  if (version === 3) return;
  await db.withExclusiveTransactionAsync(async tx => {
    const lockedVersion = (await tx.getFirstAsync<{ user_version: number }>('PRAGMA user_version'))?.user_version;
    if (lockedVersion !== 2) throw new Error('Versao local alterada durante a migracao do diario.');
    await tx.execAsync(`CREATE TABLE diary_pages_v1 (user_id TEXT NOT NULL, query_key TEXT NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(user_id, query_key)); CREATE TABLE diary_record_ids_v1 (user_id TEXT NOT NULL, local_id TEXT NOT NULL, server_id TEXT NOT NULL, PRIMARY KEY(user_id, local_id)); PRAGMA user_version = 3;`);
  });
}
