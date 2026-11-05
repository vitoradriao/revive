import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import cases from '../fixtures/personal-reason.cjs';

export async function verifyPersonalReasons(app, sql, secret) {
  const owner = randomUUID(), other = randomUUID(), habit = randomUUID();
  const tokens = [];
  for (const user of [owner, other]) {
    await sql.query("insert into public.usuarios(id,nome,email,senha_hash) values($1,'Synthetic private test',$2,'synthetic')", [user, `${user}@example.invalid`]);
    const session = randomUUID();
    await sql.query("insert into public.app_sessions(id,usuario_id,refresh_token_hash,family_id,expires_at) values($1,$2,$3,$4,now()+interval '1 day')", [session, user, randomUUID(), randomUUID()]);
    tokens.push(jwt.sign({ id: user, sid: session, token_type: 'access' }, secret));
  }
  const insert = async id => sql.query("insert into public.vicios(id,usuario_id,nome_vicio,data_inicio,valor_economizado_por_dia) values($1,$2,'Synthetic habit',(now() at time zone 'UTC')::date,10)", [id, owner]);
  const patch = (body, token = tokens[0]) => request(app).patch(`/api/v2/vicios/${habit}`).set('Authorization', `Bearer ${token}`)
    .set('X-Revive-Include-Personal-Reason', 'true').send(body);
  const bootstrap = (token = tokens[0], include = true) => {
    const call = request(app).get('/api/v2/bootstrap').set('Authorization', `Bearer ${token}`);
    return include ? call.set('X-Revive-Include-Personal-Reason', 'true') : call;
  };
  const state = async () => (await sql.query(`select
    (select to_jsonb(v) - 'revision' - 'motivo_pessoal' - 'data_modificacao' - 'data_atualizacao' from public.vicios v where id=$1) as habit,
    (select jsonb_agg(to_jsonb(s) order by id) from public.segmentos_economia s where vicio_id=$1) as economy,
    (select jsonb_agg(to_jsonb(p) order by id) from public.progresso_periodos p where vicio_id=$1) as periods,
    (select jsonb_agg(to_jsonb(m) order by id) from public.metas m where vicio_id=$1) as goals,
    (select jsonb_agg(to_jsonb(r) order by id) from public.historico_recaidas r where vicio_id=$1) as relapses,
    (select jsonb_agg(to_jsonb(r) order by id) from public.registros_diarios r where vicio_id=$1) as records,
    (select jsonb_agg(to_jsonb(m) order by id) from public.marcos m where vicio_id=$1) as milestones,
    (select jsonb_agg(to_jsonb(c) order by id) from public.conquistas_permanentes c where vicio_id=$1) as awards`, [habit])).rows[0];
  try {
    await insert(habit);
    assert.equal((await sql.query('select motivo_pessoal from public.vicios where id=$1', [habit])).rows[0].motivo_pessoal, null);
    for (const { input, normalized } of cases) {
      const result = await sql.query('select public.normalize_personal_reason($1) as value', [input]);
      assert.equal(result.rows[0].value === normalized, true, 'PostgreSQL and JavaScript normalization agree');
    }
    const first = await patch({ revision: 1, motivo_pessoal: '  synthetic-private-marker\r\nlinha  ' });
    assert.equal(first.status, 200);
    assert.equal(first.body.vicio.motivo_pessoal === 'synthetic-private-marker\nlinha', true);
    const legacy = await bootstrap(tokens[0], false);
    assert.equal(legacy.status, 200);
    assert.equal(JSON.stringify(legacy.body).includes('synthetic-private-marker'), false);
    const legacyHabit = await request(app).get(`/api/vicios/${habit}`).set('Authorization', `Bearer ${tokens[0]}`);
    assert.equal(legacyHabit.status, 200);
    assert.equal(JSON.stringify(legacyHabit.body).includes('synthetic-private-marker'), false);
    const own = await bootstrap();
    assert.equal(own.status, 200);
    assert.equal(own.body.vicios.find(row => row.id === habit).motivo_pessoal === first.body.vicio.motivo_pessoal, true);
    const foreign = await bootstrap(tokens[1]);
    assert.equal(foreign.status, 200);
    assert.equal(JSON.stringify(foreign.body).includes('synthetic-private-marker'), false);
    assert.equal((await patch({ revision: 2, motivo_pessoal: 'other' }, tokens[1])).status, 404);
    // A cliente antigo omite o campo: preservação também em arquivo.
    await sql.query("insert into public.metas(usuario_id,vicio_id,descricao_meta,dias_objetivo) values($1,$2,'Synthetic goal',7)", [owner, habit]);
    await sql.query("insert into public.registros_diarios(vicio_id,humor,data_registro) values($1,'synthetic',current_date)", [habit]);
    await sql.query("insert into public.marcos(vicio_id,tipo_marco,dias_abstinencia,data_marco) values($1,'synthetic',1,now())", [habit]);
    const receiptKey = randomUUID();
    const relapse = await request(app).post(`/api/v2/vicios/${habit}/recaida`).set('Authorization', `Bearer ${tokens[0]}`)
      .set('Idempotency-Key', receiptKey).send({ resetarContador: false });
    assert.equal(relapse.status, 201);
    const storedReceipt = (await sql.query('select response_body from public.api_idempotency where usuario_id=$1 and idempotency_key=$2', [owner, receiptKey])).rows[0];
    assert.equal(JSON.stringify(storedReceipt).includes('motivo_pessoal'), false);
    assert.equal(JSON.stringify(storedReceipt).includes('synthetic-private-marker'), false);
    const archived = await patch({ revision: 2, ativo: false });
    assert.equal(archived.status, 200);
    assert.equal(archived.body.vicio.motivo_pessoal === first.body.vicio.motivo_pessoal, true);
    const before = await state();
    const edits = await Promise.all([
      patch({ revision: 3, motivo_pessoal: 'synthetic-first' }),
      patch({ revision: 3, motivo_pessoal: 'synthetic-second' }),
    ]);
    assert.deepEqual(edits.map(row => row.status).sort(), [200, 409]);
    assert.deepEqual(await state(), before);
    assert.equal((await patch({ revision: 4, motivo_pessoal: '😀'.repeat(1000) })).status, 200);
    assert.equal((await patch({ revision: 5, motivo_pessoal: '😀'.repeat(1001) })).status, 422);
    const tooLong = await sql.query('select public.edit_revive_habit($1,$2,5,$3::jsonb) as value', [owner, habit, JSON.stringify({ motivo_pessoal: '😀'.repeat(1001) })]);
    assert.equal(tooLong.rows[0].value.status, 422);
    assert.equal((await sql.query('select length(motivo_pessoal) as size,revision from public.vicios where id=$1', [habit])).rows[0].size, 1000);
    const removed = await patch({ revision: 5, motivo_pessoal: ' \t\n' });
    assert.equal(removed.status, 200); assert.equal(removed.body.vicio.motivo_pessoal, null);
    assert.deepEqual(await state(), before);
    assert.equal((await patch({ revision: 6, motivo_pessoal: 'synthetic-private-marker' })).status, 200);
    const deleted = await request(app).delete(`/api/vicios/${habit}`).set('Authorization', `Bearer ${tokens[0]}`);
    assert.equal(deleted.status, 200);
    assert.equal((await sql.query('select id from public.vicios where id=$1', [habit])).rowCount, 0);
    const accountHabit = randomUUID(); await insert(accountHabit);
    await sql.query('update public.vicios set motivo_pessoal=$2 where id=$1', [accountHabit, 'synthetic-private-marker']);
    const account = await request(app).delete('/api/v2/account').set('Authorization', `Bearer ${tokens[0]}`);
    assert.equal(account.status, 204);
    assert.equal((await sql.query('select id from public.vicios where usuario_id=$1', [owner])).rowCount, 0);
  } finally {
    await sql.query('select public.delete_revive_account($1)', [owner]);
    await sql.query('select public.delete_revive_account($1)', [other]);
  }
  console.log('Personal reason: owner, default DTO privacy, normalization, concurrency, archive, limits, history and deletion passed.');
}
