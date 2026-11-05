const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const { createMobileApi } = require('../../mobile-api');
const { fakeSupabase } = require('../helpers/session-database.cjs');
const { normalizeDiaryText } = require('../../diary-search');
const corpus = require('../fixtures/diary-search.json');
const habit = '10000000-0000-4000-8000-000000000001';
function fixture() {
    const secret = 'synthetic-search-api-secret';
    const db = fakeSupabase({ usuarios: [{ id: 'a' }, { id: 'b' }],
        app_sessions: ['a', 'b'].map(id => ({ id, usuario_id: id, revoked_at: null, expires_at: '2099-01-01' })) });
    const rows = Array.from({ length: 365 }, (_, index) => ({ ...corpus.rows[index % corpus.rows.length],
        id: '20000000-0000-4000-8000-' + String(index + 1).padStart(12, '0'), vicio_id: habit,
        data_registro: new Date(Date.UTC(2026, 0, index + 1)).toISOString().slice(0, 10) }));
    db.client.rpc = vi.fn(async (_name, args) => ({ data: args.p_usuario_id === 'a' && (!args.p_vicio_id || args.p_vicio_id === habit) ? rows.filter(row =>
        (!args.p_inicio || row.data_registro >= args.p_inicio) && (!args.p_fim || row.data_registro <= args.p_fim)
        && (!args.p_cursor_date || row.data_registro < args.p_cursor_date || row.data_registro === args.p_cursor_date && row.id < args.p_cursor_id)
        && ['humor','gatilhos','conquistas','observacoes'].some(key => normalizeDiaryText(row[key] || '').includes(normalizeDiaryText(args.p_termo))))
        .sort((a,b) => b.data_registro.localeCompare(a.data_registro) || b.id.localeCompare(a.id)).slice(0,args.p_limit) : [], error: null }));
    const app = express(); app.use(express.json()); app.use('/api/v2', createMobileApi({ supabase: db.client, jwtSecret: secret }));
    const search = (body, owner = 'a') => request(app).post('/api/v2/registros/search')
        .set('Authorization', 'Bearer ' + jwt.sign({ id: owner, sid: owner, token_type: 'access' }, secret)).send(body);
    return { app, db, rows, search };
}
it('searches beyond the first page with stable order, body-only literals and owner isolation', async () => {
    const f = fixture();
    expect((await request(f.app).post('/api/v2/registros/search').send({})).status).toBe(401);
    for (const { term } of corpus.cases) {
        const seen = []; let cursor;
        do {
            const res = await f.search({ termo: term, limit: 20, ...(cursor ? { cursor } : {}) });
            expect(res.status).toBe(200); expect(res.headers['cache-control']).toBe('no-store');
            seen.push(...res.body.registros.map(row => row.id)); cursor = res.body.next_cursor;
        } while (cursor);
        const expected = f.rows.filter(row => ['humor','gatilhos','conquistas','observacoes'].some(key => normalizeDiaryText(row[key] || '').includes(normalizeDiaryText(term)))).reverse().map(row => row.id);
        expect(seen).toEqual(expected); expect(new Set(seen).size).toBe(seen.length);
    }
    expect((await f.search({ termo: '' }, 'b')).body.registros).toEqual([]);
    expect((await f.search({ termo: '', vicio_id: '10000000-0000-4000-8000-000000000002' })).body.registros).toEqual([]);
});
it('rejects mismatched/tampered cursors and invalid bodies without echoing search content', async () => {
    const f = fixture(), first = await f.search({ termo: '', limit: 2 });
    expect(first.body.next_cursor).toBeTruthy();
    for (const changed of [{ termo: 'otro' }, { limit: 3 }, { inicio: '2026-01-01', fim: '2026-12-31' }, { vicio_id: habit }]) {
        const res = await f.search({ termo: '', limit: 2, ...changed, cursor: first.body.next_cursor });
        expect(res.status).toBe(422); expect(res.body.codigo).toBe('CURSOR_INCOMPATIVEL');
    }
    expect((await f.search({ termo: '', limit: 2, cursor: first.body.next_cursor }, 'b')).status).toBe(422);
    for (const body of [null, [], { termo: null }, { termo: 'x'.repeat(101) }, { termo: '😀'.repeat(101) }, { termo: '\0' }, { termo: '\ud800' },
        { termo: '', limit: '20' }, { termo: '', limit: 101 }, { termo: '', vicio_id: 'bad' }, { termo: '', inicio: '2026-01-01' }, { termo: '', inicio: '2026-02-30', fim: '2026-03-01' }, { unknown: true }]) {
        expect((await f.search(body)).status).toBe(422);
    }
    expect((await f.search({ termo: 'a'.repeat(100) })).status).toBe(200);
    expect((await f.search({ termo: '😀'.repeat(100) })).status).toBe(200);
    const error = vi.spyOn(console, 'error').mockImplementation(() => {}), log = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
        f.db.client.rpc.mockResolvedValueOnce({ error: { message: 'synthetic-private-search-body' } });
        const res = await f.search({ termo: 'synthetic-private-search-body' });
        expect(res.status).toBe(503); expect(JSON.stringify(res.body)).not.toContain('synthetic-private-search-body');
        expect(error).not.toHaveBeenCalled(); expect(log).not.toHaveBeenCalled();
    } finally { error.mockRestore(); log.mockRestore(); }
});


it('keeps access and JSON parser diagnostics private for search URLs, including trailing slash/case', async () => {
    const { app } = require('../../index');
    const writes = [], stdout = vi.spyOn(process.stdout, 'write').mockImplementation(value => { writes.push(String(value)); return true; });
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(value => { writes.push(String(value)); return true; });
    try {
        const marker = 'synthetic-private-parser-marker';
        const invalid = await request(app).post('/API/v2/REGISTROS/search/').set('Content-Type', 'application/json').send('{"termo":"' + marker);
        expect(invalid.status).toBe(400); expect(invalid.headers['cache-control']).toBe('no-store');
        expect(JSON.stringify(invalid.body)).not.toContain(marker);
        const denied = await request(app).post('/api/v2/registros/search?termo=' + marker).send({ termo: marker });
        expect(denied.status).toBe(401);
        expect(writes.join('')).not.toContain(marker);
    } finally { stdout.mockRestore(); stderr.mockRestore(); }
});
