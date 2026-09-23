import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import http from 'node:http';
import { createRequire } from 'node:module';
import pg from 'pg';
import request from 'supertest';
import jwt from 'jsonwebtoken';

const require = createRequire(import.meta.url);
const jwtSecret = 'revive-ci-only-jwt-secret-at-least-32-characters';
const databaseUrl = 'postgres://postgres:revive_ci_only@127.0.0.1:55432/revive_fixture';
const postgrestUrl = new URL('http://127.0.0.1:55433');

function bodyAt(response, status, label) {
  if (response.status !== status) {
    throw new Error(`${label}: expected HTTP ${status}, received ${response.status} (${response.body?.codigo || response.body?.erro || 'unknown'})`);
  }
  return response.body;
}

async function startProxy() {
  const server = http.createServer((incoming, outgoing) => {
    const path = incoming.url.replace(/^\/rest\/v1(?=\/|\?|$)/, '');
    const target = new URL(path || '/', postgrestUrl);
    const upstream = http.request(target, {
      method: incoming.method,
      headers: { ...incoming.headers, host: postgrestUrl.host },
    }, response => {
      outgoing.writeHead(response.statusCode, response.headers);
      response.pipe(outgoing);
    });
    upstream.on('error', () => { outgoing.writeHead(502); outgoing.end(); });
    incoming.pipe(upstream);
  });
  await new Promise(resolve => server.listen(55434, '127.0.0.1', resolve));
  return server;
}

async function verifyConnections(a, b) {
  assert.notEqual(a.processID, b.processID);
  await a.query('begin');
  try {
    await a.query('select pg_advisory_xact_lock(120006)');
    const blocked = await b.query('select pg_try_advisory_xact_lock(120006) as acquired');
    assert.equal(blocked.rows[0].acquired, false);
  } finally {
    await a.query('rollback');
  }
  const released = await b.query('select pg_try_advisory_xact_lock(120006) as acquired');
  assert.equal(released.rows[0].acquired, true);
  await b.query('select pg_advisory_unlock(120006)');

  const id = randomUUID();
  await a.query('begin');
  try {
    await a.query('insert into public.usuarios (id, nome, email, senha_hash) values ($1,$2,$3,$4)',
      [id, 'Synthetic transaction', `${id}@example.invalid`, 'synthetic-hash']);
    assert.equal((await b.query('select id from public.usuarios where id=$1', [id])).rowCount, 0);
    await a.query('commit');
  } catch (error) {
    await a.query('rollback');
    throw error;
  }
  assert.equal((await b.query('select id from public.usuarios where id=$1', [id])).rowCount, 1);
  await b.query('delete from public.usuarios where id=$1', [id]);
}

async function verifyApi(app, sql) {
  const suffix = randomUUID();
  const password = 'Senha!12345';
  const users = [];
  for (const label of ['a', 'b']) {
    const email = `ci-${label}-${suffix}@example.invalid`;
    const registered = await request(app).post('/api/auth/cadastro')
      .send({ nome: `Synthetic ${label}`, email, senha: password });
    const body = bodyAt(registered, 201, `register ${label}`);
    users.push({ id: body.usuario.id, email, legacyToken: body.token });
  }
  const [a, b] = users;
  for (const user of users) {
    const login = await request(app).post('/api/v2/auth/login').send({ email: user.email, senha: password });
    user.mobileToken = bodyAt(login, 200, 'mobile login').access_token;
    assert.ok(user.mobileToken);
  }

  const habit = await request(app).post('/api/vicios')
    .set('Authorization', `Bearer ${a.legacyToken}`)
    .send({ nome_vicio: 'Synthetic habit', data_inicio: '2026-09-01T00:00:00Z' });
  const habitId = bodyAt(habit, 201, 'create habit').vicio.id;
  bodyAt(await request(app).get(`/api/vicios/${habitId}`)
    .set('Authorization', `Bearer ${a.legacyToken}`), 200, 'owner reads habit');
  bodyAt(await request(app).get(`/api/vicios/${habitId}`)
    .set('Authorization', `Bearer ${b.legacyToken}`), 404, 'other user cannot read habit');

  const bootstrap = bodyAt(await request(app).get('/api/v2/bootstrap')
    .set('Authorization', `Bearer ${b.mobileToken}`), 200, 'other user bootstrap');
  assert.equal(bootstrap.vicios.length, 0);

  bodyAt(await request(app).post('/api/v2/registros')
    .set('Authorization', `Bearer ${b.mobileToken}`)
    .set('Idempotency-Key', randomUUID())
    .send({ vicio_id: habitId, data_registro: '2026-09-01' }), 404, 'foreign record denied');
  bodyAt(await request(app).post('/api/v2/registros')
    .set('Authorization', `Bearer ${a.mobileToken}`)
    .set('Idempotency-Key', randomUUID())
    .send({ vicio_id: habitId, data_registro: '2026-09-01', humor: 'synthetic' }), 201, 'record');
  bodyAt(await request(app).post('/api/v2/metas')
    .set('Authorization', `Bearer ${a.mobileToken}`)
    .set('Idempotency-Key', randomUUID())
    .send({ vicio_id: habitId, descricao_meta: 'Synthetic goal', dias_objetivo: 7 }), 201, 'goal');
  bodyAt(await request(app).post(`/api/v2/vicios/${habitId}/recaida`)
    .set('Authorization', `Bearer ${a.mobileToken}`)
    .set('Idempotency-Key', randomUUID())
    .send({ occurred_at: '2026-09-02T00:00:00Z', motivo: 'synthetic' }), 201, 'relapse');

  bodyAt(await request(app).delete('/api/v2/account')
    .set('Authorization', `Bearer ${a.mobileToken}`), 204, 'account deletion');
  const gone = await sql.query(`select
    (select count(*) from public.usuarios where id=$1) as users,
    (select count(*) from public.vicios where usuario_id=$1) as habits,
    (select count(*) from public.registros_diarios where vicio_id=$2) as records,
    (select count(*) from public.historico_recaidas where vicio_id=$2) as relapses,
    (select count(*) from public.metas where usuario_id=$1) as goals,
    (select count(*) from public.app_sessions where usuario_id=$1) as sessions,
    (select count(*) from public.api_idempotency where usuario_id=$1) as idempotency`, [a.id, habitId]);
  for (const [table, count] of Object.entries(gone.rows[0])) {
    assert.equal(Number(count), 0, `${table} must be removed`);
  }
  assert.equal(Number((await sql.query('select count(*) from public.usuarios where id=$1', [b.id])).rows[0].count), 1);
  await sql.query('delete from public.usuarios where id=$1', [b.id]);
}

async function verifyPublicRoles() {
  for (const role of ['anon', 'authenticated']) {
    const token = jwt.sign({ role }, jwtSecret, { algorithm: 'HS256', expiresIn: '5m' });
    const response = await fetch('http://127.0.0.1:55434/rest/v1/usuarios?select=id', {
      headers: { Authorization: `Bearer ${token}`, apikey: token },
    });
    assert.ok([401, 403, 404].includes(response.status), `${role} must not read private users`);
  }
}

const proxy = await startProxy();
const first = new pg.Client({ connectionString: databaseUrl });
const second = new pg.Client({ connectionString: databaseUrl });
try {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      await fetch(postgrestUrl);
      ready = true;
      break;
    } catch {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  assert.equal(ready, true, 'PostgREST must start');
  await Promise.all([first.connect(), second.connect()]);
  await verifyConnections(first, second);
  process.env.NODE_ENV = 'test';
  process.env.SUPABASE_URL = 'http://127.0.0.1:55434';
  process.env.SUPABASE_SERVICE_ROLE_KEY = jwt.sign({ role: 'service_role' }, jwtSecret,
    { algorithm: 'HS256', expiresIn: '5m' });
  process.env.JWT_SECRET = 'revive-ci-only-app-jwt-secret';
  const { app } = require('../../index.js');
  await verifyApi(app, first);
  await verifyPublicRoles();
  console.log('Two SQL connections, API ownership, cascade and role denial passed.');
} finally {
  await Promise.allSettled([first.end(), second.end()]);
  await new Promise(resolve => proxy.close(resolve));
}
