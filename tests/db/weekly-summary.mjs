import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { buildWeeklySummary } = require('../../weekly-summary');
export async function verifyWeeklySummary(app, sql, secret) {
    const owner = randomUUID(), other = randomUUID(), habit = randomUUID(), foreignHabit = randomUUID(), session = randomUUID();
    await sql.query("insert into public.usuarios(id,nome,email,senha_hash) values($1,'Synthetic weekly',$2,'synthetic'),($3,'Synthetic weekly',$4,'synthetic')", [owner, owner + '@example.invalid', other, other + '@example.invalid']);
    try {
        await sql.query("insert into public.vicios(id,usuario_id,nome_vicio,data_inicio) values($1,$2,'Synthetic weekly','2025-01-01'),($3,$4,'Synthetic foreign','2025-01-01')", [habit, owner, foreignHabit, other]);
        await sql.query("insert into public.app_sessions(id,usuario_id,refresh_token_hash,family_id,expires_at) values($1,$2,$3,$4,now()+interval '1 hour')", [session, owner, randomUUID(), randomUUID()]);
        const auth = 'Bearer ' + jwt.sign({ id: owner, sid: session, token_type: 'access' }, secret, { expiresIn: '5m' });
        // Over a page of records in one week, plus a full year outside that week.
        await sql.query("insert into public.registros_diarios(vicio_id,data_registro,humor) select $1,'2026-03-02'::date+(n%7),'Bem' from generate_series(0,1104)n", [habit]);
        await sql.query("insert into public.registros_diarios(vicio_id,data_registro,humor) select $1,'2025-01-01'::date+n,'bom' from generate_series(0,364)n", [habit]);
        await sql.query("insert into public.registros_diarios(vicio_id,data_registro,humor) values($1,'2026-03-02','Confiante')", [foreignHabit]);
        await sql.query("insert into public.eventos_vontade(usuario_id,vicio_id,occurred_at,timezone,intensidade,gatilhos) values($1,$2,'2026-03-02T02:00:00Z','UTC',0,array['estresse']),($1,$2,'2026-03-08T06:59:59Z','America/New_York',10,array['tedio']),($1,$2,'2026-03-08T07:00:00Z','America/New_York',6,array['estresse']),($1,$2,'2026-03-09T04:00:00Z','America/New_York',4,'{}')", [owner, habit]);
        await sql.query("insert into public.historico_recaidas(vicio_id,data_recaida) values($1,'2026-03-02T02:00:00')", [habit]);
        await sql.query("insert into public.registros_diarios(vicio_id,data_registro,humor) values($1,'2025-12-29','bom'),($1,'2026-01-04','Bem'),($1,'2026-01-05','neutro')", [habit]);
        await sql.query("insert into public.eventos_vontade(usuario_id,vicio_id,occurred_at,timezone,intensidade,gatilhos) values($1,$2,'2025-12-29T02:00:00Z','UTC',3,'{}')", [owner, habit]);
        const foreignEvent = (await sql.query("insert into public.eventos_vontade(usuario_id,vicio_id,occurred_at,timezone,intensidade,gatilhos) values($1,$2,'2026-03-02T12:00:00Z','UTC',10,array['estresse']) returning id", [other, foreignHabit])).rows[0].id;
        await sql.query('update public.vicios set ativo=false where id=$1', [habit]);
        const records = (await sql.query("select id,vicio_id,data_registro::text,humor from public.registros_diarios where vicio_id=$1", [habit])).rows;
        const urges = (await sql.query('select * from public.eventos_vontade where vicio_id=$1', [habit])).rows.map(row => ({ ...row, occurred_at: row.occurred_at.toISOString() }));
        const relapses = (await sql.query("select id,vicio_id,to_char(data_recaida,'YYYY-MM-DD\"T\"HH24:MI:SS') data_recaida from public.historico_recaidas where vicio_id=$1", [habit])).rows;
        const read = query => request(app).get('/api/v2/weekly-summary').query({ vicio_id: habit, semana: '2026-03-02', timezone: 'UTC', ...query }).set('Authorization', auth);
        for (const timezone of ['UTC', 'America/Sao_Paulo', 'America/New_York']) {
            const response = await read({ timezone }); assert.equal(response.status, 200);
            const expected = buildWeeklySummary({ ownerId: owner, habitId: habit, week: '2026-03-02', timezone, records, urges, relapses, now: new Date(response.body.atualizado_em) });
            assert.deepEqual(response.body, expected);
            assert.equal(response.body.cobertura.registros, 1105); assert.equal(response.body.dias_checkin.valor, 7);
        }
        for (const timezone of ['UTC', 'America/Sao_Paulo', 'America/New_York']) {
            const result = await read({ semana: '2025-12-29', timezone });
            assert.equal(result.status, 200); assert.equal(result.body.intervalo.fim, '2026-01-04');
            assert.equal(result.body.cobertura.registros, 5); assert.equal(result.body.dias_checkin.valor, 4);
            assert.equal(result.body.episodios.quantidade, timezone === 'UTC' ? 1 : 0);
        }
        assert.equal((await read({ vicio_id: foreignHabit })).status, 404);
        assert.equal((await request(app).get('/api/v2/weekly-summary/sources/vontades/' + foreignEvent).set('Authorization', auth)).status, 404);
        for (const [type, id] of [['vontades', urges[0].id], ['recaidas', relapses[0].id]]) {
            const path = '/api/v2/weekly-summary/sources/' + type + '/' + id;
            assert.equal((await request(app).get(path).set('Authorization', auth)).status, 200);
        }
        // Account ownership remains enforced through real PostgREST joins for archived rows.
        await sql.query('update public.app_sessions set revoked_at=now() where id=$1', [session]);
        assert.equal((await read({})).status, 401);
    } finally {
        await sql.query('select public.delete_revive_account($1)', [owner]);
        await sql.query('select public.delete_revive_account($1)', [other]);
    }
    console.log('Weekly summary: PostgreSQL/PostgREST full pages, year, archive, ownership, UTC/São Paulo/DST and sources passed.');
}
