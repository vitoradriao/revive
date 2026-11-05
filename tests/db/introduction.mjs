import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import jwt from 'jsonwebtoken';

export async function verifyIntroduction(app, sql, secret) {
  const users = [randomUUID(), randomUUID()], tokens = [];
  for (const user of users) {
    await sql.query("insert into public.usuarios(id,nome,email,senha_hash) values($1,'Synthetic introduction',$2,'synthetic')", [user, `${user}@example.invalid`]);
    const session = randomUUID();
    await sql.query("insert into public.app_sessions(id,usuario_id,refresh_token_hash,family_id,expires_at) values($1,$2,$3,$4,now()+interval '1 day')", [session, user, randomUUID(), randomUUID()]);
    tokens.push(jwt.sign({ id: user, sid: session, token_type: 'access' }, secret));
  }
  const send = (method, path, body, index = 0) => request(app)[method](path).set('X-Forwarded-For', '192.0.2.67').set('Authorization', 'Bearer ' + tokens[index]).send(body);
  const patch = (revision, intro, index = 0) => send('patch', '/api/v2/preferences', { revision, intro }, index);
  const today = new Date().toISOString().slice(0, 10);
  try {
    assert.equal((await patch(0, { version: 1, state: 'pending', step: 'habit' })).status, 200);
    const created = await send('post', '/api/vicios', { nome_vicio: 'Synthetic habit', data_inicio: today, valor_economizado_por_dia: 0 });
    assert.equal(created.status, 201); const habit = created.body.vicio;
    const checkpoint = { version: 1, state: 'pending', step: 'reason', habit_id: habit.id };
    assert.equal((await patch(1, checkpoint)).status, 200);
    assert.equal((await patch(0, checkpoint, 1)).status, 422);
    // Motivo rejeitado não desfaz o cadastro nem a etapa confirmada.
    assert.equal((await send('patch', '/api/v2/vicios/' + habit.id, { revision: habit.revision, motivo_pessoal: 'x'.repeat(1001) })).status, 422);
    assert.equal((await send('get', '/api/v2/preferences')).body.preferences.intro.habit_id, habit.id);
    const reason = await send('patch', '/api/v2/vicios/' + habit.id, { revision: habit.revision, motivo_pessoal: 'Synthetic private reason' });
    assert.equal(reason.status, 200);
    assert.equal(Number((await sql.query('select count(*) from public.vicios where usuario_id=$1', [users[0]])).rows[0].count), 1);
    const checkinStep = { ...checkpoint, step: 'checkin' };
    const race = await Promise.all([
      patch(2, checkinStep), send('patch', '/api/v2/preferences', { revision: 2, indicator_order: ['future_metric'] }),
    ]);
    assert.deepEqual(race.map(row => row.status).sort(), [200, 409]);
    let current = (await send('get', '/api/v2/preferences')).body.preferences;
    if (current.intro.step !== 'checkin') {
      assert.equal((await patch(current.revision, checkinStep)).status, 200);
      current = (await send('get', '/api/v2/preferences')).body.preferences;
    }
    const id = randomUUID(), body = { vicio_id: habit.id, data_registro: today, timezone: 'America/Sao_Paulo', humor: 'bom' };
    const record = () => request(app).post('/api/v2/registros').set('X-Forwarded-For', '192.0.2.67').set('Authorization', 'Bearer ' + tokens[0]).set('Idempotency-Key', id).send(body);
    assert.equal((await record()).status, 201); assert.equal((await record()).status, 201);
    assert.equal(Number((await sql.query('select count(*) from public.registros_diarios where vicio_id=$1', [habit.id])).rows[0].count), 1);
    assert.equal((await patch(current.revision, { ...checkinStep, state: 'completed' })).status, 200);
    const saved = (await send('get', '/api/v2/preferences')).body.preferences;
    assert.equal(saved.intro.state, 'completed'); assert.equal(saved.intro.habit_id, habit.id);
    assert.equal((await send('get', '/api/v2/preferences', undefined, 1)).body.preferences.intro.state, 'pending');
  } finally { for (const user of users) await sql.query('select public.delete_revive_account($1)', [user]); }
  console.log('First habit introduction: checkpoints, private ownership, partial reason failure, concurrent revision and text-free idempotent check-in passed.');
}
