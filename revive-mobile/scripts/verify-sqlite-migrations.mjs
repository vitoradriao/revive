import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import Module, { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const originalLoader = Module._extensions['.ts'];
Module._extensions['.ts'] = (module, filename) => {
  const source = require('node:fs').readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  module._compile(output, filename);
};
const { migrateDatabase } = require('../src/core/storage/migrations.ts');
const { decodePayload, validMutation } = require('../src/core/storage/envelopes.ts');
Module._extensions['.ts'] = originalLoader;

const dir = mkdtempSync(join(tmpdir(), 'revive-sqlite-'));
const open = (name, failOn = '') => {
  const sqlite = new DatabaseSync(join(dir, name));
  const adapter = {
    execAsync: async (sql) => sqlite.exec(sql),
    getFirstAsync: async (sql, ...params) => sqlite.prepare(sql).get(...params) ?? null,
    getAllAsync: async (sql, ...params) => sqlite.prepare(sql).all(...params),
    runAsync: async (sql, ...params) => {
      if (failOn && sql.includes(failOn)) throw new Error('Injected migration failure');
      return sqlite.prepare(sql).run(...params);
    },
    withExclusiveTransactionAsync: async (task) => {
      sqlite.exec('BEGIN IMMEDIATE');
      try { await task(adapter); sqlite.exec('COMMIT'); }
      catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    },
  };
  return { sqlite, adapter };
};

try {
  const clean = open('clean.db');
  await migrateDatabase(clean.adapter);
  await migrateDatabase(clean.adapter);
  assert.equal(clean.sqlite.prepare('PRAGMA user_version').get().user_version, 1);
  assert.equal(clean.sqlite.prepare('SELECT COUNT(*) AS n FROM mutation_queue_v1').get().n, 0);
  clean.sqlite.close();

  const legacy = open('legacy.db', 'UPDATE mutation_queue SET payload');
  legacy.sqlite.exec(`
    CREATE TABLE bootstrap_cache (user_id TEXT PRIMARY KEY NOT NULL, payload TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE mutation_queue (id TEXT PRIMARY KEY NOT NULL, user_id TEXT NOT NULL, type TEXT NOT NULL,
      payload TEXT NOT NULL, occurred_at TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
      next_retry_at TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', last_error TEXT);
  `);
  const snapshot = (id) => JSON.stringify({ usuario: { id }, server_time: '', vicios: [], registros: [], recaidas: [], metas: [], mensagem: null });
  for (const id of ['a', 'b']) legacy.sqlite.prepare('INSERT INTO bootstrap_cache VALUES (?, ?, ?)').run(id, snapshot(id), '2026-01-01');
  const events = [
    ['record-id', 'a', 'record.create', { vicio_id: 'habit', humor: 'Bem' }, 'pending'],
    ['relapse-id', 'a', 'relapse.create', { addictionId: 'habit', resetarContador: true }, 'failed'],
    ['goal-id', 'b', 'goal.create', { vicio_id: 'habit', descricao_meta: 'Teste' }, 'pending'],
    ['complete-id', 'b', 'goal.complete', { goalId: 'goal-id' }, 'syncing'],
    ['unknown-id', 'a', 'new.operation', { sample: true }, 'pending'],
  ];
  const insert = legacy.sqlite.prepare('INSERT INTO mutation_queue VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
  for (let index = 0; index < events.length; index++) {
    const [id, user, type, payload, status] = events[index];
    insert.run(id, user, type, JSON.stringify(payload), `2026-01-0${index + 1}`, index, '2026-02-01', status, null);
  }
  insert.run('corrupt-id', 'a', 'record.create', '{broken', '2026-01-06', 6, '2026-02-01', 'pending', null);
  await assert.rejects(migrateDatabase(legacy.adapter), /Injected migration failure/);
  assert.equal(legacy.sqlite.prepare('PRAGMA user_version').get().user_version, 0);
  assert.equal(legacy.sqlite.prepare('PRAGMA table_info(mutation_queue)').all().some((column) => column.name === 'payload_version'), false);
  assert.equal(legacy.sqlite.prepare('SELECT payload FROM mutation_queue WHERE id = ?').get('record-id').payload, JSON.stringify(events[0][3]));
  legacy.sqlite.close();

  const recovered = open('legacy.db');
  await migrateDatabase(recovered.adapter);
  const rows = recovered.sqlite.prepare('SELECT * FROM mutation_queue_v1 ORDER BY occurred_at, rowid').all();
  assert.deepEqual(rows.map((row) => row.id), [...events.map((event) => event[0]), 'corrupt-id']);
  assert.deepEqual(rows.map((row) => row.user_id), ['a', 'a', 'b', 'b', 'a', 'a']);
  assert.deepEqual(rows.map((row) => row.status), ['pending', 'failed', 'pending', 'syncing', 'pending', 'pending']);
  assert.deepEqual(rows.map((row) => row.attempts), [0, 1, 2, 3, 4, 6]);
  for (let index = 0; index < events.length; index++) {
    assert.equal(rows[index].payload_version, 1);
    assert.deepEqual(decodePayload(rows[index].payload, 1), events[index][3]);
    if (index < 4) assert.equal(validMutation(rows[index].type, decodePayload(rows[index].payload, 1)), true);
  }
  assert.equal(validMutation(rows[4].type, decodePayload(rows[4].payload, 1)), false);
  assert.equal(rows[5].payload, '{broken');
  assert.equal(rows[5].payload_version, 0);
  assert.deepEqual(recovered.sqlite.prepare('SELECT user_id FROM bootstrap_cache_v1 ORDER BY user_id').all().map((row) => row.user_id), ['a', 'b']);
  await migrateDatabase(recovered.adapter);
  assert.equal(recovered.sqlite.prepare('SELECT COUNT(*) AS n FROM mutation_queue_v1').get().n, 6);
  assert.throws(() => recovered.sqlite.prepare("UPDATE mutation_queue SET status = 'pending'").run(), /view/);
  assert.throws(() => recovered.sqlite.prepare("INSERT INTO mutation_queue(id, user_id, type, payload, occurred_at, next_retry_at) VALUES ('old', 'a', 'goal.complete', '{}', 'now', 'now')").run(), /view/);
  recovered.sqlite.close();

  const future = open('future.db');
  future.sqlite.exec('PRAGMA user_version = 99');
  await assert.rejects(migrateDatabase(future.adapter), /versão mais recente/);
  assert.equal(future.sqlite.prepare('PRAGMA user_version').get().user_version, 99);
  future.sqlite.close();
  process.stdout.write('SQLite: clean install, idempotence, legacy queue, rollback/reopen and future version passed.\n');
} finally {
  if (resolve(dir).startsWith(`${resolve(tmpdir())}${sep}`)) rmSync(dir, { recursive: true, force: true });
}
