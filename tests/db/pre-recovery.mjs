import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import http from 'node:http';
import { createRequire } from 'node:module';
import pg from 'pg';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import express from 'express';
import { createClient } from '@supabase/supabase-js';

const require = createRequire(import.meta.url);
const databaseUrl = process.env.REVIVE_TEST_DATABASE_URL || 'postgres://postgres:revive_ci_only@127.0.0.1:55432/revive_fixture';
const postgrestUrl = new URL(process.env.REVIVE_TEST_POSTGREST_URL || 'http://127.0.0.1:55433');
const databaseSecret = 'revive-ci-only-jwt-secret-at-least-32-characters';
const appSecret = 'revive-ci-only-app-jwt-secret';
const serviceToken = jwt.sign({ role: 'service_role' }, databaseSecret, { expiresIn: '5m' });
const proxy = http.createServer((incoming, outgoing) => {
  const target = new URL(incoming.url.replace(/^\/rest\/v1(?=\/|\?|$)/, '') || '/', postgrestUrl);
  const upstream = http.request(target, { method: incoming.method, headers: { ...incoming.headers, host: postgrestUrl.host } }, response => {
    outgoing.writeHead(response.statusCode, response.headers); response.pipe(outgoing);
  });
  upstream.on('error', () => { outgoing.writeHead(502); outgoing.end(); });
  incoming.pipe(upstream);
});
const sql = new pg.Client({ connectionString: databaseUrl });
const email = `ci-pre-recovery-${randomUUID()}@example.invalid`;
const mobileEmail = `ci-pre-mobile-${randomUUID()}@example.invalid`;
const password = 'Synthetic!12345';
const expectStatus = (response, status) => { assert.equal(response.status, status); return response.body; };
try {
  await sql.connect();
  assert.equal((await sql.query("select count(*)::int as n from information_schema.columns where table_schema='public' and table_name='usuarios' and column_name='credential_version'")).rows[0].n, 0);
  await new Promise(resolve => proxy.listen(0, '127.0.0.1', resolve));
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(postgrestUrl)).ok) { ready = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  assert.equal(ready, true);
  process.env.NODE_ENV = 'test';
  process.env.SUPABASE_URL = `http://127.0.0.1:${proxy.address().port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = serviceToken;
  process.env.JWT_SECRET = appSecret;
  process.env.PASSWORD_RECOVERY_ENABLED = 'false';
  const { app } = require('../../index.js');
  const registered = expectStatus(await request(app).post('/api/v2/auth/cadastro').send({ nome: 'Synthetic rollout', email, senha: password }), 201);
  assert.equal(jwt.verify(registered.access_token, appSecret).cv, 0);
  const web = expectStatus(await request(app).post('/api/v2/auth/login').send({ email, senha: password }), 200);
  assert.equal(jwt.verify(web.access_token, appSecret).cv, 0);
  for (const token of [registered.access_token, web.access_token, jwt.sign({ id: registered.usuario.id }, appSecret, { expiresIn: '5m' })]) {
    expectStatus(await request(app).get('/api/me').set('Authorization', `Bearer ${token}`), 200);
  }
  const mobile = expectStatus(await request(app).post('/api/v2/auth/login').send({ email, senha: password }), 200);
  assert.equal(jwt.verify(mobile.access_token, appSecret).cv, 0);
  expectStatus(await request(app).get('/api/v2/bootstrap').set('Authorization', `Bearer ${mobile.access_token}`), 200);
  expectStatus(await request(app).get('/api/me').set('Authorization', `Bearer ${mobile.access_token}`), 200);
  const refreshed = expectStatus(await request(app).post('/api/v2/auth/refresh').send({ refresh_token: mobile.refresh_token }), 200);
  assert.equal(jwt.verify(refreshed.access_token, appSecret).cv, 0);
  expectStatus(await request(app).get('/api/me').set('Authorization', `Bearer ${mobile.access_token}`), 401);
  expectStatus(await request(app).post('/api/v2/auth/logout').set('Authorization', `Bearer ${refreshed.access_token}`), 204);
  expectStatus(await request(app).get('/api/me').set('Authorization', `Bearer ${refreshed.access_token}`), 401);
  const mobileRegistration = expectStatus(await request(app).post('/api/v2/auth/cadastro')
    .send({ nome: 'Synthetic mobile rollout', email: mobileEmail, senha: password }), 201);
  assert.equal(jwt.verify(mobileRegistration.access_token, appSecret).cv, 0);
  expectStatus(await request(app).get('/api/v2/bootstrap').set('Authorization', `Bearer ${mobileRegistration.access_token}`), 200);
  expectStatus(await request(app).post('/api/v2/auth/password-recovery/request').send({ email }), 202);
  const client = createClient(process.env.SUPABASE_URL, serviceToken, { auth: { persistSession: false } });
  const { createCredentialAuth } = require('../../credential-auth');
  const protectedApp = express();
  protectedApp.get('/', createCredentialAuth({ supabase: client, jwtSecret: appSecret, recoveryEnabled: true }), (_, res) => res.sendStatus(200));
  expectStatus(await request(protectedApp).get('/').set('Authorization', `Bearer ${web.access_token}`), 503);
  console.log('Pre-recovery PostgreSQL: web/mobile login, refresh, revocation and disabled recovery passed.');
} finally {
  await sql.query('delete from public.usuarios where email=any($1::text[])', [[email, mobileEmail]]).catch(() => {});
  await sql.end();
  if (proxy.listening) await new Promise(resolve => proxy.close(resolve));
}
