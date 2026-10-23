import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import jwt from 'jsonwebtoken';

export async function verifyGoalsRelapses(app, sql, jwtSecret) {
  const owner = randomUUID(), other = randomUUID(), habit = randomUUID(), session = randomUUID(), otherSession = randomUUID();
  await sql.query("insert into public.usuarios(id,nome,email,senha_hash) values($1,'Synthetic goals',$2,'synthetic'),($3,'Synthetic other',$4,'synthetic')", [owner, `${owner}@example.invalid`, other, `${other}@example.invalid`]);
  for (const [id, user] of [[session, owner], [otherSession, other]]) await sql.query("insert into public.app_sessions(id,usuario_id,refresh_token_hash,family_id,expires_at) values($1,$2,$3,$4,now()+interval '1 day')", [id, user, randomUUID(), randomUUID()]);
  await sql.query("insert into public.vicios(id,usuario_id,nome_vicio,data_inicio,valor_economizado_por_dia) values($1,$2,'Synthetic habit',(now() at time zone 'UTC')-interval '33 days 12 hours',10)", [habit, owner]);
  const token = jwt.sign({ id: owner, sid: session, token_type: 'access' }, jwtSecret);
  const foreignToken = jwt.sign({ id: other, sid: otherSession, token_type: 'access' }, jwtSecret);
  const send = (method, path, payload, key = randomUUID(), credential = token) => request(app)[method](path).set('Authorization', `Bearer ${credential}`).set('Idempotency-Key', key).send(payload);
  const bootstrap = async () => {
    const response = await send('get', '/api/v2/bootstrap'); assert.equal(response.status, 200);
    return response.body;
  };
  try {
    const baseline = await bootstrap(), original = baseline.vicios.find(row => row.id === habit);
    assert.ok(original.progresso.recorde_dias >= 33);
    const payload = { vicio_id: habit, descricao_meta: 'Synthetic durable goal', dias_objetivo: 30, valor_objetivo: 100, iniciar_hoje: true, data_inicio_meta: '2026-10-23' };
    const key = randomUUID();
    const creates = await Promise.all([send('post', '/api/v2/metas', payload, key), send('post', '/api/v2/metas', payload, key)]);
    creates.forEach(response => assert.equal(response.status, 201));
    assert.equal(creates[0].body.meta.id, creates[1].body.meta.id);
    const goal = creates[0].body.meta;
    assert.equal(Number(goal.dias_abstinencia_inicio), 33);
    assert.equal(Number(goal.valor_economizado_inicio), Number(original.valor_economizado));
    assert.equal((await send('patch', `/api/v2/vicios/${habit}`, { revision: 1, valor_economizado_por_dia: 20 })).status, 200);
    const afterRate = await bootstrap();
    assert.deepEqual(afterRate.metas.find(row => row.id === goal.id), { ...goal, vicios: { nome_vicio: 'Synthetic habit' } });
    assert.ok(Math.abs(Number(afterRate.vicios.find(row => row.id === habit).valor_economizado) - Number(original.valor_economizado)) < 0.02);
    const instant = new Date().toISOString(), reflection = { resetarContador: false, occurred_at: instant, timezone: 'America/Sao_Paulo' };
    const reflectionKey = randomUUID();
    const one = await send('post', `/api/v2/vicios/${habit}/recaida`, reflection, reflectionKey);
    const replay = await send('post', `/api/v2/vicios/${habit}/recaida`, reflection, reflectionKey);
    assert.equal(one.status, 201); assert.equal(replay.body.recaida.id, one.body.recaida.id);
    assert.equal((await bootstrap()).vicios.find(row => row.id === habit).progresso.sequencia_atual_dias, 33);
    assert.equal((await send('post', `/api/v2/vicios/${habit}/recaida`, { ...reflection, resetarContador: true })).status, 201);
    const reset = await bootstrap(), progress = reset.vicios.find(row => row.id === habit).progresso;
    assert.equal(progress.sequencia_atual_dias, 0); assert.ok(progress.recorde_dias >= 33);
    assert.ok(baseline.conquistas.every(award => reset.conquistas.some(row => row.id === award.id)));
    assert.equal((await send('patch', `/api/v2/vicios/${habit}`, { revision: reset.vicios.find(row => row.id === habit).revision, ativo: false })).status, 200);
    assert.equal((await send('post', '/api/v2/metas', payload)).body.codigo, 'HABITO_ARQUIVADO');
    assert.ok((await bootstrap()).metas.some(row => row.id === goal.id));
    const completionKey = randomUUID();
    const completions = await Promise.all([send('patch', `/api/v2/metas/${goal.id}`, { concluida: true }, completionKey), send('patch', `/api/v2/metas/${goal.id}`, { concluida: true }, completionKey)]);
    completions.forEach(response => { assert.equal(response.status, 200); assert.equal(response.body.meta.concluida, true); });
    assert.equal((await sql.query('select count(*) from public.api_idempotency where usuario_id=$1 and idempotency_key=$2', [owner, completionKey])).rows[0].count, '1');
    assert.equal((await send('delete', `/api/metas/${goal.id}`, undefined, randomUUID(), foreignToken)).status, 404);
    assert.equal((await send('get', '/api/metas')).body.metas.find(row => row.id === goal.id).concluida, true);
    assert.equal((await send('get', '/api/recaidas')).body.recaidas.length, 2);
    assert.equal((await send('delete', `/api/metas/${goal.id}`)).status, 200);
    assert.equal((await sql.query('select id from public.metas where id=$1', [goal.id])).rowCount, 0);
    await sql.query('update public.app_sessions set revoked_at=now() where id=$1', [session]);
    assert.equal((await send('get', '/api/metas')).status, 401);
  } finally {
    await sql.query('select public.delete_revive_account($1)', [owner]);
    await sql.query('select public.delete_revive_account($1)', [other]);
  }
  console.log('Goals/relapses: real PostgreSQL baselines, prospective savings, reset, awards, replay, archive and v2 legacy ownership passed.');
}
