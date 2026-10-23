import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { diarySearchSql } = require('../helpers/diary-search-sql.cjs');
const corpus = require('../fixtures/diary-search.json');
export async function verifyDiarySearch(app, sql, secret) {
    await sql.query(diarySearchSql());
    const owner = randomUUID(), other = randomUUID(), habit = randomUUID(), session = randomUUID();
    await sql.query("insert into public.usuarios(id,nome,email,senha_hash) values($1,'Synthetic search',$2,'synthetic'),($3,'Synthetic search',$4,'synthetic')", [owner, owner+'@example.invalid', other, other+'@example.invalid']);
    try {
        await sql.query("insert into public.vicios(id,usuario_id,nome_vicio,data_inicio,ativo) values($1,$2,'Synthetic search','2026-01-01',false)", [habit,owner]);
        await sql.query("insert into public.app_sessions(id,usuario_id,refresh_token_hash,family_id,expires_at) values($1,$2,$3,$4,now()+interval '1 hour')", [session,owner,randomUUID(),randomUUID()]);
        const auth = 'Bearer '+jwt.sign({ id: owner, sid: session, token_type: 'access' },secret,{expiresIn:'5m'});
        const ids = [];
        for (let i=0;i<365;i++) {
            const row=corpus.rows[i%corpus.rows.length];
            const saved=await sql.query("insert into public.registros_diarios(vicio_id,data_registro,humor,gatilhos,conquistas,observacoes) values($1,'2026-01-01'::date+$2::int,$3,$4,$5,$6) returning id",[habit,i,row.humor,row.gatilhos,row.conquistas,row.observacoes]);
            ids.push(saved.rows[0].id);
        }
        const search = body => request(app).post('/api/v2/registros/search').set('Authorization',auth).send(body);
        for (const test of corpus.cases) {
            const seen=[]; let cursor;
            do {
                const res=await search({termo:test.term,limit:20,...(cursor?{cursor}:{})});
                assert.equal(res.status,200); seen.push(...res.body.registros.map(row=>row.id)); cursor=res.body.next_cursor;
            } while(cursor);
            assert.deepEqual(seen,ids.filter((_id,index)=>test.matches.includes(index%corpus.rows.length)).reverse());
        }
        const first=await search({termo:'',limit:2});
        assert.equal((await search({termo:'%',limit:2,cursor:first.body.next_cursor})).status,422);
        assert.equal((await search({termo:'😀'.repeat(100)})).status,200);
        assert.equal((await search({termo:'😀'.repeat(101)})).status,422);
        assert.deepEqual((await search({termo:'',vicio_id:randomUUID()})).body.registros,[]);
    } finally {
        await sql.query('select public.delete_revive_account($1)',[owner]);
        await sql.query('select public.delete_revive_account($1)',[other]);
    }
    console.log('Search: shared Unicode/literal corpus, full year, stable pages, archive, cursor scope and ownership passed.');
}
