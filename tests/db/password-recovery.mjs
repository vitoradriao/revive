import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { digest } = require('../../password-recovery');
const prefix = '/api/v2/auth/password-recovery';
const inbox = 'http://127.0.0.1:55435';

async function waitForAccountLock(sql, second) {
  for (let n = 0; n < 100; n++) {
    const { rows } = await sql.query("select wait_event_type from pg_stat_activity where pid=$1", [second.processID]);
    if (rows[0]?.wait_event_type === 'Lock') return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.fail('credential operation should wait for the account lock');
}

async function verifyRecoveryLimits(sql) {
  const keys = [];
  const key = () => { const value = digest(process.env.JWT_SECRET, 'synthetic-limit', randomUUID()); keys.push(value); return value; };
  const origin = key();
  const email = key();
  const codeHash = key();
  const recoveryRequest = (emailKey, originKey) => sql.query('select public.request_password_recovery($1,$2,$3,$4,$5) as result',
    [`${randomUUID()}@example.invalid`, emailKey, originKey, randomUUID(), codeHash]);
  const recoveryConfirm = (emailKey, originKey) => sql.query('select public.confirm_password_recovery($1,$2,$3,$4,$5) as result',
    [emailKey, originKey, randomUUID(), codeHash, 'unused-for-absent-request']);
  try {
    for (let n = 0; n < 21; n++) {
      assert.equal((await recoveryRequest(key(), origin)).rows[0].result.status, n < 20 ? 'absent' : 'limited');
    }
    for (let n = 0; n < 7; n++) {
      if (n > 0) await sql.query("update public.password_recovery_limits set last_accepted_at=clock_timestamp()-interval '61 seconds' where key_hash=$1", [email]);
      assert.equal((await recoveryRequest(email, key())).rows[0].result.status, n < 6 ? 'absent' : 'limited');
    }
    const confirmEmail = key();
    for (let n = 0; n < 31; n++) assert.equal((await recoveryConfirm(confirmEmail, key())).rows[0].result.status, n < 30 ? 'invalid' : 'limited');
    const confirmOrigin = key();
    for (let n = 0; n < 61; n++) assert.equal((await recoveryConfirm(key(), confirmOrigin)).rows[0].result.status, n < 60 ? 'invalid' : 'limited');
    const boundary = key();
    await sql.query(`insert into public.password_recovery_limits(kind,key_hash,window_at,hits,last_accepted_at)
      values('request_email',$1,to_timestamp(floor(extract(epoch from clock_timestamp())/3600)*3600)-interval '1 hour',1,clock_timestamp())`, [boundary]);
    assert.equal((await recoveryRequest(boundary, key())).rows[0].result.status, 'limited', 'resend cooldown spans window boundaries');
    console.log('Recovery: persistent origin/account limits and resend window boundary passed.');
  } finally {
    await sql.query('delete from public.password_recovery_limits where key_hash=any($1::text[])', [keys]);
  }
}

export async function verifyPasswordRecovery(app, sql, second) {
  await verifyRecoveryLimits(sql);
  const address = `reset-${randomUUID()}@example.invalid`;
  const password = 'Synthetic!Original1';
  const newPassword = 'Synthetic!Replacement2';
  const registered = await request(app).post('/api/auth/cadastro').send({ nome: 'Synthetic recovery', email: address, senha: password });
  assert.equal(registered.status, 201);
  const id = registered.body.usuario.id;
  const emailKey = digest(process.env.JWT_SECRET, 'email', address);
  const legacy = jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '7d' });
  const mobile = await request(app).post('/api/v2/auth/login').send({ email: address, senha: password });
  assert.equal(mobile.status, 200);
  const browser = await request(app).post('/api/v2/web-auth/login')
    .set('Host', 'web.example.invalid').set('Origin', 'http://web.example.invalid')
    .send({ email: address, senha: password });
  assert.equal(browser.status, 200);
  const browserCookie = browser.headers['set-cookie'][0].split(';')[0];
  const habit = await request(app).post('/api/vicios').set('Authorization', `Bearer ${legacy}`)
    .send({ nome_vicio: 'Synthetic recovery history', data_inicio: '2026-09-01' });
  assert.equal(habit.status, 201);
  const habitId = habit.body.vicio.id;
  await sql.query("insert into public.registros_diarios(vicio_id,humor,data_registro) values($1,'synthetic','2026-10-01')", [habitId]);
  const counts = () => sql.query('select count(*) as n from public.registros_diarios where vicio_id=$1', [habitId]);
  async function issue() {
    // Only the disposable test account's bucket is reset to simulate elapsed cooldown.
    await sql.query('delete from public.password_recovery_limits where key_hash=$1', [emailKey]);
    const response = await request(app).post(`${prefix}/request`).send({ email: address });
    assert.equal(response.status, 202);
    let code;
    for (let attempt = 0; attempt < 20 && !code; attempt++) {
      const listing = await (await fetch(`${inbox}/api/v1/messages`)).json();
      for (const message of listing.messages || []) {
        if (!message.To?.some(recipient => recipient.Address === address)) continue;
        const detail = await (await fetch(`${inbox}/api/v1/message/${message.ID}`)).json();
        const headers = await (await fetch(`${inbox}/api/v1/message/${message.ID}/headers`)).json();
        const requestHeader = headers['X-Revive-Recovery-Request'] || headers['X-Revive-Recovery-Request'.toLowerCase()];
        if (Array.isArray(requestHeader) ? requestHeader.includes(response.body.request_id) : requestHeader === response.body.request_id) code = detail.Text?.match(/\b\d{8}\b/)?.[0];
      }
      if (!code) await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(code, 'SMTP inbox received the recovery code for this request');
    const stored = (await sql.query('select code_hash from public.password_recovery_requests where id=$1', [response.body.request_id])).rows[0];
    assert.ok(stored && stored.code_hash !== code, 'only a keyed hash is stored');
    assert.ok(!JSON.stringify(response.body).includes(code), 'the API never returns the code');
    return { response, code, requestId: response.body.request_id };
  }
  const confirm = (receipt, code = receipt.code, passwordValue = newPassword) => request(app).post(`${prefix}/confirm`)
    .send({ email: address, request_id: receipt.requestId, codigo: code, senha: passwordValue });
  try {
    const first = await issue();
    const unknown = await request(app).post(`${prefix}/request`).send({ email: `${randomUUID()}@example.invalid` });
    assert.equal(unknown.status, first.response.status);
    const withoutId = body => ({ ...body, request_id: '<random>' });
    assert.deepEqual(withoutId(unknown.body), withoutId(first.response.body));
    const replayRequest = await request(app).post(`${prefix}/request`).send({ email: address });
    assert.equal(replayRequest.status, 202);
    assert.equal((await sql.query('select count(*) as n from public.password_recovery_requests where usuario_id=$1', [id])).rows[0].n, '1', 'cooldown does not issue another code');
    await sql.query("update public.password_recovery_requests set expires_at=clock_timestamp()-interval '1 second' where id=$1", [first.requestId]);
    assert.equal((await confirm(first)).status, 400);
    assert.equal((await request(app).post('/api/auth/login').send({ email: address, senha: password })).status, 200);

    const exhausted = await issue();
    const wrong = exhausted.code === '00000000' ? '11111111' : '00000000';
    for (let index = 0; index < 5; index++) assert.equal((await confirm(exhausted, wrong)).status, 400);
    assert.equal((await confirm(exhausted)).status, 400);

    const replaced = await issue();
    const active = await issue();
    assert.equal((await confirm(replaced)).status, 400, 'resend invalidates the previous code');
    assert.equal((await confirm(active, active.code, 'short')).status, 422);
    // Inject failure after the password update to prove code/password/session rollback.
    await sql.query(`create function public.synthetic_recovery_failure() returns trigger language plpgsql as $$
      begin if new.id='${id}'::uuid then raise exception 'synthetic rollback'; end if; return new; end $$`);
    await sql.query('create trigger synthetic_recovery_failure after update of senha_hash on public.usuarios for each row execute function public.synthetic_recovery_failure()');
    assert.equal((await confirm(active)).status, 503);
    await sql.query('drop trigger synthetic_recovery_failure on public.usuarios; drop function public.synthetic_recovery_failure()');
    assert.equal((await request(app).get('/api/me').set('Authorization', `Bearer ${legacy}`)).status, 200);
    assert.equal((await sql.query('select consumed_at from public.password_recovery_requests where id=$1', [active.requestId])).rows[0].consumed_at, null);
    const before = (await counts()).rows[0].n;
    const result = await Promise.all([confirm(active), confirm(active)]);
    assert.deepEqual(result.map(item => item.status).sort(), [200, 400], 'only one concurrent confirmation changes the password');
    assert.equal((await confirm(active)).status, 400, 'used code cannot be replayed');
    assert.equal((await request(app).post('/api/auth/login').send({ email: address, senha: password })).status, 401);
    const webLogin = await request(app).post('/api/auth/login').send({ email: address, senha: newPassword });
    assert.equal(webLogin.status, 200);
    assert.equal((await request(app).get('/api/me').set('Authorization', `Bearer ${legacy}`)).status, 401);
    assert.equal((await request(app).get('/api/v2/bootstrap').set('Authorization', `Bearer ${browser.body.access_token}`)).status, 401);
    assert.equal((await request(app).post('/api/v2/web-auth/refresh')
      .set('Host', 'web.example.invalid').set('Origin', 'http://web.example.invalid')
      .set('Cookie', browserCookie).send({})).status, 401);
    assert.equal((await request(app).get('/api/me').set('Authorization', `Bearer ${registered.body.token}`)).status, 401);
    assert.equal((await request(app).get('/api/me').set('Authorization', `Bearer ${mobile.body.access_token}`)).status, 401);
    assert.equal((await request(app).get('/api/v2/bootstrap').set('Authorization', `Bearer ${mobile.body.access_token}`)).status, 401);
    assert.equal((await request(app).post('/api/v2/auth/refresh').send({ refresh_token: mobile.body.refresh_token })).status, 401);
    assert.equal((await request(app).get('/api/me').set('Authorization', `Bearer ${webLogin.body.token}`)).status, 200);
    const freshMobile = await request(app).post('/api/v2/auth/login').send({ email: address, senha: newPassword });
    assert.equal(freshMobile.status, 200);
    assert.equal((await counts()).rows[0].n, before, 'history survives recovery');

    // A login that verified an old hash cannot publish a session after reset.
    const currentHash = (await sql.query('select senha_hash from public.usuarios where id=$1', [id])).rows[0].senha_hash;
    await sql.query('begin');
    await sql.query('select id from public.usuarios where id=$1 for update', [id]);
    const staleLogin = second.query('select public.create_mobile_session($1,$2,$3,$4,$5,null) as result',
      [id, currentHash, randomUUID(), 'a'.repeat(64), randomUUID()]);
    await waitForAccountLock(sql, second);
    await sql.query('update public.usuarios set senha_hash=$2 where id=$1', [id, await bcrypt.hash('Synthetic!Final3', 10)]);
    await sql.query('commit');
    assert.equal((await staleLogin).rows[0].result.status, 'invalid');
    assert.equal((await request(app).post('/api/v2/auth/refresh').send({ refresh_token: freshMobile.body.refresh_token })).status, 401);
    const lastMobile = await request(app).post('/api/v2/auth/login').send({ email: address, senha: 'Synthetic!Final3' });
    assert.equal(lastMobile.status, 200);
    await sql.query('begin');
    await sql.query('select id from public.usuarios where id=$1 for update', [id]);
    // Use the real stored refresh hash, without writing the token to diagnostics.
    const refreshHash = (await sql.query('select refresh_token_hash from public.app_sessions where usuario_id=$1 and revoked_at is null', [id])).rows[0].refresh_token_hash;
    const resetRace = second.query('select public.rotate_mobile_session($1,$2,$3,null) as result', [refreshHash, randomUUID(), 'c'.repeat(64)]);
    await waitForAccountLock(sql, second);
    await sql.query('update public.usuarios set senha_hash=$2 where id=$1', [id, await bcrypt.hash('Synthetic!Race4', 10)]);
    await sql.query('commit');
    assert.equal((await resetRace).rows[0].result.status, 'invalid', 'refresh cannot create a session after the password change');
    console.log('Recovery: SMTP delivery, neutral response, cooldown, expiry, attempt exhaustion, rollback, concurrent consumption, history and mobile/web revocation passed.');
  } finally {
    await sql.query('rollback');
    await sql.query('drop trigger if exists synthetic_recovery_failure on public.usuarios; drop function if exists public.synthetic_recovery_failure()');
    await sql.query('delete from public.usuarios where id=$1', [id]);
    await sql.query('delete from public.password_recovery_limits where key_hash=$1', [emailKey]);
  }
}
