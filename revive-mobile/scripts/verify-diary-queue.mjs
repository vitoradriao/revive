import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import Module, { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const src = resolve('src');
const directory = mkdtempSync(join(tmpdir(), 'revive-diary-'));
const filename = join(directory, 'diary.db');
const originalLoad = Module._load, originalResolve = Module._resolveFilename, originalTs = Module._extensions['.ts'];
let sqlite, db, online = false, generation = 1, currentUser = 'a', failSnapshot = false;
const urges = new Map();
const server = new Map(), receipts = new Map(), calls = [];
const snapshot = () => ({ usuario: { id: 'a', nome: 'Synthetic', email: 'synthetic@example.invalid' }, server_time: '', vicios: [], registros: [...server.values()], recaidas: [], metas: [], mensagem: null });
let ApiError;
const api = {
  async createRecord(input, key) {
    assert.equal(online, true);
    calls.push(['create', key]);
    if (!receipts.has(key)) { const record = { ...input, id: randomUUID(), revision: 1 }; server.set(record.id, record); receipts.set(key, { registro: record }); }
    return receipts.get(key);
  },
  async updateRecord(id, input, key) {
    assert.equal(online, true); calls.push(['update', key]);
    if (receipts.has(key)) return receipts.get(key);
    const record = server.get(id);
    if (record.revision !== input.expected_version) throw new ApiError('Remote changed', 409, 'REVISAO_CONFLITO');
    const { expected_version: _version, ...patch } = input;
    const updated = { ...record, ...patch, revision: record.revision + 1 };
    server.set(id, updated); receipts.set(key, { registro: updated }); return receipts.get(key);
  },
  async createUrgeEvent(input, key) {
    assert.equal(online,true); calls.push(['urge',key]);
    if (!receipts.has(key)) {
      const event = { ...input, id:randomUUID(), usuario_id:'a', created_at:new Date().toISOString(), updated_at:new Date().toISOString() };
      urges.set(event.id,event); receipts.set(key,{vontade:event});
    }
    return receipts.get(key);
  },
  async bootstrap() { if (failSnapshot) throw new ApiError('Snapshot unavailable', 503); return snapshot(); },
};
const open = async () => {
  sqlite = new DatabaseSync(filename);
  const adapter = {
    getFirstAsync: async (sql,...args) => sqlite.prepare(sql).get(...args) || null,
    getAllAsync: async (sql,...args) => sqlite.prepare(sql).all(...args),
    runAsync: async (sql,...args) => sqlite.prepare(sql).run(...args),
    execAsync: async sql => sqlite.exec(sql),
    closeAsync: async () => sqlite.close(),
    withTransactionAsync: async task => { sqlite.exec('BEGIN'); try { await task(); sqlite.exec('COMMIT'); } catch(e) { sqlite.exec('ROLLBACK'); throw e; } },
    withExclusiveTransactionAsync: async task => { sqlite.exec('BEGIN IMMEDIATE'); try { await task(adapter); sqlite.exec('COMMIT'); } catch(e) { sqlite.exec('ROLLBACK'); throw e; } },
  };
  Module._load = function(name, parent, main) {
    if (name === 'expo-sqlite') return { openDatabaseAsync: async () => adapter };
    if (name === 'expo-crypto') return { randomUUID };
    if (name === '@/core/auth/token-store') return { tokenStore: { getGeneration: () => generation, isCurrent: expected => expected === generation, getUser: async () => ({ id: currentUser }) } };
    if (name === '@/core/api/repositories') return { reviveApi: api };
    return originalLoad.call(this, name, parent, main);
  };
  Module._resolveFilename = function(name, parent, ...rest) { return originalResolve.call(this, name.startsWith('@/') ? join(src, name.slice(2)) : name, parent, ...rest); };
  Module._extensions['.ts'] = (module, path) => module._compile(ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, path);
  for (const key of Object.keys(require.cache).filter(key => key.startsWith(src))) delete require.cache[key];
  db = require('../src/core/storage/database.ts');
  ApiError = require('../src/core/api/errors.ts').ApiError;
  return require('../src/core/sync/sync-engine.ts').syncPendingMutations;
};
try {
  let sync = await open();
  await db.cacheBootstrap('a', snapshot());
  const create = randomUUID(), edit = randomUUID();
  await db.enqueueMutation('a', 'record.create', { vicio_id: 'habit', data_registro: '2026-10-04', humor: 'Original', gatilhos: 'Keep' }, undefined, create);
  await db.enqueueMutation('a', 'record.update', { recordId: create, dependsOn: create, expected_version: 1, observacoes: 'Offline corrected' }, undefined, edit);
  await assert.rejects(db.discardUserMutation('a',create), /dependente/);
  await db.cacheRecordPage('a', 'filter-a', { registros: [], next_cursor: null });
  assert.equal(await db.getCachedRecordPage('b', 'filter-a'), null);
  sqlite.close();
  sync = await open();
  assert.equal((await db.getPendingMutations('a')).length, 2);
  assert.deepEqual(await db.getPendingMutations('b'), []);
  assert.equal((await db.getCachedRecordPage('a', 'filter-a')).registros.length, 0);
  online = true; failSnapshot = true;
  assert.equal(await sync('a'), 0); // Both HTTP commits stay replayable until their canonical snapshot is durable.
  assert.equal(server.size, 1);
  assert.equal([...server.values()][0].observacoes, 'Offline corrected');
  const bound = (await db.getPendingMutations('a')).find(m => m.id === edit);
  assert.equal(bound.payload.recordId, [...server.keys()][0]);
  assert.equal(bound.payload.dependsOn, undefined);
  sqlite.close();
  sync = await open(); failSnapshot = false;
  const reboundId = await db.resolveDiaryRecordId('a',create);
  assert.equal((await db.getCachedDiaryRecord('a',reboundId)).observacoes,'Offline corrected');
  for (const m of await db.getPendingMutations('a')) await db.retryUserMutation('a', m.id);
  assert.equal(await sync('a'), 2);
  assert.equal(server.size, 1);
  const record = (await db.getCachedBootstrap('a')).registros[0];
  assert.equal(await db.resolveDiaryRecordId('a',create),record.id);
  assert.equal(await db.resolveDiaryRecordId('b',create),create);
  assert.equal(record.revision, 2); assert.equal(record.gatilhos, 'Keep'); assert.equal(record.observacoes, 'Offline corrected');
  assert.equal((await db.getPendingMutations('a')).length, 0);
  await db.cacheRecordPage('a','history',{registros:[record],next_cursor:null});
  const conflict = randomUUID();
  await db.enqueueMutation('a','record.update',{recordId: record.id,expected_version: 1, observacoes:'Local conflict text'},undefined,conflict);
  assert.equal(await sync('a'),0);
  sqlite.close(); sync = await open();
  const failed = (await db.getPendingMutations('a'))[0];
  assert.equal(failed.status,'failed'); assert.match(failed.lastError,/REVISAO_CONFLITO/); assert.equal(failed.payload.observacoes,'Local conflict text');
  const replacement=randomUUID();
  await db.replaceFailedRecordEdit('a',conflict,replacement,{recordId:record.id,expected_version:2,observacoes:failed.payload.observacoes});
  assert.equal(await sync('a'),1); assert.equal(server.get(record.id).observacoes,'Local conflict text');
  assert.equal((await db.getCachedRecordPage('a','history')).registros[0].observacoes,'Local conflict text');
  // The real local database must retain accepted urge history outside bootstrap.
  const urgeKey=randomUUID();
  const urgePayload={vicio_id:'habit',occurred_at:'2026-10-12T22:00:00.000Z',timezone:'America/Sao_Paulo',intensidade:0,gatilhos:['estresse'],nota:'Synthetic retrospective',acao_realizada:null,resultado:null};
  online=false;
  await db.enqueueMutation('a','urge.create',urgePayload,urgePayload.occurred_at,urgeKey);
  assert.equal(urges.size,0);
  sqlite.close(); sync=await open();
  const unsent=(await db.getPendingMutations('a')).find(m=>m.id===urgeKey);
  assert.deepEqual(unsent.payload,urgePayload); assert.equal(unsent.occurredAt,urgePayload.occurred_at);
  const before=JSON.stringify(snapshot());
  online=true; failSnapshot=true;
  assert.equal(await sync('a'),0); assert.equal(urges.size,1);
  assert.equal(JSON.stringify(snapshot()),before,'urge does not change records/counters in bootstrap');
  const urgeId=[...urges.keys()][0];
  assert.equal((await db.getLocalUrgeEvents('a'))[0].id,urgeId);
  const accepted=(await db.getPendingMutations('a')).find(m=>m.id===urgeKey);
  assert.equal(accepted.resolvedUrgeEvent.id,urgeId);
  const project=require('../src/domain/pending-snapshot.ts').withPendingMutations;
  assert.equal(project({...snapshot(),vontades:[...urges.values()]},[accepted]).vontades.length,1);
  sqlite.close(); sync=await open(); failSnapshot=false;
  await db.retryUserMutation('a',urgeKey);
  assert.equal(await sync('a'),1); assert.equal(urges.size,1);
  assert.equal((await db.getPendingMutations('a')).length,0);
  assert.equal((await db.getLocalUrgeEvents('a'))[0].intensidade,0);
  assert.equal((await db.getUrgeReceipt('a',urgeKey)).id,urgeId);
  assert.equal(await db.getUrgeReceipt('b',urgeKey),null);
  assert.deepEqual(await db.getLocalUrgeEvents('b'),[]);
  assert.deepEqual(calls.filter(call=>call[0]==='urge').map(call=>call[1]),[urgeKey,urgeKey]);
  await assert.rejects(db.cacheUrgeEventPage('b','bad-owner',{vontades:[...urges.values()],next_cursor:null,cobertura:{total:1,retornados:1,tem_mais:false},atualizado_em:urgePayload.occurred_at}),/inválida/);
  console.log('Urge SQLite: offline/reopen, durable receipt before snapshot, original-key replay, unique canonical ID, historical moment and account isolation passed.');
  currentUser='b'; generation++;
  await db.enqueueMutation('a','record.update',{recordId:record.id,expected_version:3,humor:'a only'});
  const callCount=calls.length; assert.equal(await sync('a'),0); assert.equal(calls.length,callCount);
  await db.clearUserData('a'); assert.deepEqual(await db.getLocalUrgeEvents('a'),[]); assert.equal(await db.getCachedRecordPage('a','filter-a'),null);
  console.log('Diary SQLite: offline create/edit, reopen, ID rebind, repeated receipts, conflict preservation/manual reapply and account/cache isolation passed.');
} finally {
  try { sqlite?.close(); } catch {}
  Module._load=originalLoad; Module._resolveFilename=originalResolve; Module._extensions['.ts']=originalTs;
  if(resolve(directory).startsWith(`${resolve(tmpdir())}${sep}`)) rmSync(directory,{recursive:true,force:true});
}
