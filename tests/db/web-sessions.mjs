import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import request from 'supertest';
import jwt from 'jsonwebtoken';

const post = (app, operation, body = {}, cookie) => {
  const req = request(app).post('/api/v2/web-auth/' + operation)
    .set('Host', 'web.example.invalid').set('Origin', 'http://web.example.invalid').set('X-Forwarded-For', '192.0.2.57');
  if (cookie) req.set('Cookie', cookie);
  return req.send(body);
};
const cookieOf = response => response.headers['set-cookie'][0].split(';')[0];

export async function verifyWebSessions(app, sql, secret, second) {
  const email = `web-ci-${randomUUID()}@example.invalid`;
  const created = await post(app, 'cadastro', { nome: 'Synthetic browser', email, senha: 'Synthetic!12345' });
  assert.equal(created.status, 201);
  const id = created.body.usuario.id;
  try {
    assert.equal(created.body.refresh_token, undefined);
    const claims = jwt.verify(created.body.access_token, secret);
    const cookie = cookieOf(created), raw = cookie.slice(cookie.indexOf('=') + 1);
    const row = (await sql.query('select refresh_token_hash from public.app_sessions where id=$1', [claims.sid])).rows[0];
    assert.equal(row.refresh_token_hash, createHash('sha256').update(raw).digest('hex'));
    assert.notEqual(row.refresh_token_hash, raw);
    assert.equal((await request(app).get('/api/me').set('Authorization', 'Bearer ' + created.body.access_token)).status, 200);
    const refreshed = await post(app, 'refresh', {}, cookie);
    assert.equal(refreshed.status, 200);
    assert.equal(refreshed.body.refresh_token, undefined);
    assert.equal((await request(app).get('/api/me').set('Authorization', 'Bearer ' + created.body.access_token)).status, 401);
    assert.equal((await request(app).get('/api/v2/bootstrap').set('Authorization', 'Bearer ' + refreshed.body.access_token)).status, 200);
    // A stale tab can log out the family through an old cookie without rotating it.
    assert.equal((await post(app, 'logout', {}, cookie)).status, 204);
    assert.equal((await post(app, 'refresh', {}, cookieOf(refreshed))).status, 401);
    assert.equal(Number((await sql.query('select count(*) as n from public.app_sessions where usuario_id=$1 and revoked_at is null', [id])).rows[0].n), 0);
    const rejected = await request(app).post('/api/v2/web-auth/login')
      .set('Host', 'web.example.invalid').set('Origin', 'https://hostile.example.invalid')
      .send({ email, senha: 'Synthetic!12345' });
    assert.equal(rejected.status, 403);
    assert.equal(rejected.headers['set-cookie'], undefined);

    assert.equal((await sql.query("select has_function_privilege('anon','public.revoke_mobile_session_family(text)','EXECUTE') as allowed")).rows[0].allowed, false);
    assert.equal((await sql.query("select has_function_privilege('authenticated','public.revoke_mobile_session_family(text)','EXECUTE') as allowed")).rows[0].allowed, false);
    async function waitForLock() {
      for (let n = 0; n < 100; n++) {
        const row = (await sql.query('select wait_event_type from pg_stat_activity where pid=$1', [second.processID])).rows[0];
        if (row?.wait_event_type === 'Lock') return;
        await new Promise(done => setTimeout(done, 10));
      }
      assert.fail('session operation must wait for the account lock');
    }
    for (const firstOperation of ['refresh', 'logout']) {
      const login = await post(app, 'login', { email, senha: 'Synthetic!12345' });
      assert.equal(login.status, 200);
      const cookieValue = cookieOf(login).split('=')[1];
      const hash = createHash('sha256').update(cookieValue).digest('hex');
      const args = [hash, randomUUID(), createHash('sha256').update(randomUUID()).digest('hex'), null];
      await sql.query('begin');
      let pending;
      try {
        if (firstOperation === 'refresh') {
          assert.equal((await sql.query('select public.rotate_mobile_session($1,$2,$3,$4) as result', args)).rows[0].result.status, 'rotated');
          pending = second.query('select public.revoke_mobile_session_family($1) as result', [hash]);
        } else {
          assert.equal((await sql.query('select public.revoke_mobile_session_family($1) as result', [hash])).rows[0].result.status, 'revoked');
          pending = second.query('select public.rotate_mobile_session($1,$2,$3,$4) as result', args);
        }
        await waitForLock();
        await sql.query('commit');
        const result = (await pending).rows[0].result;
        assert.equal(result.status, firstOperation === 'refresh' ? 'revoked' : 'invalid');
        assert.equal(Number((await sql.query('select count(*) as n from public.app_sessions where usuario_id=$1 and revoked_at is null', [id])).rows[0].n), 0);
      } catch (error) {
        await sql.query('rollback');
        if (pending) await pending.catch(() => {});
        throw error;
      }
    }
  } finally {
    await sql.query('delete from public.usuarios where id=$1', [id]);
  }
}
