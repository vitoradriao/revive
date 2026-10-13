import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import jwt from 'jsonwebtoken';

export async function verifyDiaryRecords(app, sql, secret) {
  const owner = randomUUID(), other = randomUUID(), habit = randomUUID(), foreignHabit = randomUUID(), session = randomUUID();
  await sql.query("insert into public.usuarios(id,nome,email,senha_hash) values($1,'Synthetic diary',$2,'synthetic'),($3,'Other diary',$4,'synthetic')", [owner, `${owner}@example.invalid`, other, `${other}@example.invalid`]);
  try {
    await sql.query("insert into public.vicios(id,usuario_id,nome_vicio,data_inicio) values($1,$2,'Synthetic','2026-01-01'),($3,$4,'Other','2026-01-01')", [habit,owner,foreignHabit,other]);
    await sql.query("insert into public.app_sessions(id,usuario_id,refresh_token_hash,family_id,expires_at) values($1,$2,$3,$4,now()+interval '1 hour')", [session,owner,'synthetic-diary',randomUUID()]);
    const auth = `Bearer ${jwt.sign({ id: owner, sid: session, token_type: 'access' }, secret, { expiresIn: '5m' })}`;
    const create = (key,payload) => request(app).post('/api/v2/registros').set('Authorization',auth).set('Idempotency-Key',key).send(payload);
    const patch = (id,key,payload) => request(app).patch(`/api/v2/registros/${id}`).set('Authorization',auth).set('Idempotency-Key',key).send(payload);
    const ids = [];
    for (let i=0;i<5;i++) {
      const key=randomUUID(); const input={vicio_id:habit,data_registro:'2026-10-04',humor:'H'.repeat(100),gatilhos:'g'.repeat(500),conquistas:'c'.repeat(500),observacoes:'o'.repeat(1000)};
      const res=await create(key,input); assert.equal(res.status,201,JSON.stringify(res.body));
      ids.push(res.body.registro.id); assert.equal((await create(key,input)).body.registro.id,ids.at(-1));
    }
    assert.equal((await create(randomUUID(),{vicio_id:habit,humor:'x'.repeat(101)})).status,422);
    await sql.query("insert into public.registros_diarios(vicio_id,data_registro,humor) values($1,'2026-10-04','other')",[foreignHabit]);
    const seen=[]; let cursor;
    do {
      const res=await request(app).get('/api/v2/registros').query({inicio:'2026-10-04',fim:'2026-10-04',limit:2,...(cursor?{cursor}:{})}).set('Authorization',auth);
      assert.equal(res.status,200,JSON.stringify(res.body)); seen.push(...res.body.registros.map(r=>r.id)); cursor=res.body.next_cursor;
    } while(cursor);
    assert.equal(new Set(seen).size,5); assert.deepEqual(seen,[...ids].sort().reverse());
    const version=1; const key=randomUUID(); const input={expected_version:version,humor:'Corrigido',observacoes:'Texto corrigido'};
    const saved=await patch(ids[0],key,input); assert.equal(saved.status,200,JSON.stringify(saved.body)); assert.equal(saved.body.registro.revision,2);
    assert.deepEqual((await patch(ids[0],key,input)).body,saved.body);
    assert.equal((await patch(ids[0],randomUUID(),{expected_version:1,humor:'Stale'})).body.codigo,'REVISAO_CONFLITO');
    assert.equal((await patch(ids[0],key,{expected_version:2,humor:'Changed key'})).status,409);
    assert.equal((await patch(ids[0],randomUUID(),{expected_version:2,data_registro:'2026-10-05'})).status,422);
    const foreign=(await sql.query('select id from public.registros_diarios where vicio_id=$1',[foreignHabit])).rows[0].id;
    assert.equal((await patch(foreign,randomUUID(),{expected_version:1,humor:'foreign'})).status,404);
    assert.equal((await request(app).get(`/api/v2/registros/${foreign}`).set('Authorization',auth)).status,404);
    await sql.query('update public.vicios set ativo=false where id=$1',[habit]);
    assert.equal((await patch(ids[0],randomUUID(),{expected_version:2,gatilhos:null})).status,200);
    // Historical overlong fields remain complete when another field is changed.
    await sql.query("update public.registros_diarios set observacoes=repeat('L',2000) where id=$1",[ids[1]]);
    const legacy=await patch(ids[1],randomUUID(),{expected_version:2,humor:'Legacy preserved'});
    assert.equal(legacy.status,200); assert.equal(legacy.body.registro.observacoes.length,2000);
    assert.equal((await sql.query('select data_ultima_recaida from public.vicios where id=$1',[habit])).rows[0].data_ultima_recaida,null);
    const concurrent=await Promise.all([patch(ids[2],randomUUID(),{expected_version:1,humor:'A'}),patch(ids[2],randomUUID(),{expected_version:1,humor:'B'})]);
    assert.deepEqual(concurrent.map(r=>r.status).sort(),[200,409]);
    const permission=(await sql.query("select has_function_privilege('anon','public.execute_diary_record_update(uuid,uuid,text,text,text,jsonb,text)','EXECUTE') as allowed")).rows[0];
    assert.equal(permission.allowed,false);
  } finally {
    await sql.query('select public.delete_revive_account($1)',[owner]);
    await sql.query('select public.delete_revive_account($1)',[other]);
  }
  console.log('Diary: HTTP/PostgreSQL tied pagination, ownership, concurrency, replay, archived edit and legacy preservation passed.');
}
