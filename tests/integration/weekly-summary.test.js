const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const { createMobileApi } = require('../../mobile-api');
const { fakeSupabase } = require('../helpers/session-database.cjs');
const { weeklyReadQuery } = require('../helpers/weekly-database.cjs');
const corpus = require('../fixtures/weekly-summary.json');
function fixture() {
    const secret = 'synthetic-weekly-session-secret', other = '00000000-0000-4000-8000-000000000002';
    const db = fakeSupabase({ usuarios: [{ id: corpus.ownerId }, { id: other }], app_sessions: [corpus.ownerId, other].map(id => ({ id, usuario_id: id, revoked_at: null, expires_at: '2099-01-01' })),
        vicios: [{ id: corpus.habitId, usuario_id: corpus.ownerId, ativo: false }, { id: '10000000-0000-4000-8000-000000000002', usuario_id: other }] });
    const tables = Object.fromEntries([['registros_diarios', corpus.records], ['eventos_vontade', corpus.urges], ['historico_recaidas', corpus.relapses]].map(([name, rows]) => [name, rows.map(row => ({ ...row, usuario_id: corpus.ownerId, vicio_id: corpus.habitId }))]));
    let fail = false;
    const original = db.client.from;
    db.client.from = name => tables[name] ? weeklyReadQuery(() => tables[name], () => db.tables.vicios, { cap: 3, fail }) : original(name);
    const app = express(); app.use(express.json()); app.use('/api/v2', createMobileApi({ supabase: db.client, jwtSecret: secret }));
    const auth = owner => 'Bearer ' + jwt.sign({ id: owner, sid: owner, token_type: 'access' }, secret);
    const query = { vicio_id: corpus.habitId, semana: corpus.week, timezone: corpus.timezone };
    const read = (patch = {}, owner = corpus.ownerId) => request(app).get('/api/v2/weekly-summary').query({ ...query, ...patch }).set('Authorization', auth(owner));
    return { app, db, tables, other, auth, read, fail: () => { fail = true; } };
}
afterEach(() => vi.useRealTimers());
it('uses current web session auth; archived data from all pages is isolated by ownership', async () => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(corpus.now);
    const f = fixture();
    expect((await request(f.app).get('/api/v2/weekly-summary')).status).toBe(401);
    const res = await f.read(); expect(res.status).toBe(200); expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body.episodios.quantidade).toBe(6); expect(res.body.intensidade.media).toBe(5);
    expect(res.body.frases.some(row => row.texto === corpus.expected.phrase)).toBe(true);
    expect((await f.read({}, f.other)).status).toBe(404);
    expect((await f.read({ vicio_id: f.db.tables.vicios[1].id })).status).toBe(404);
    f.db.tables.app_sessions[0].revoked_at = '2026-10-23'; expect((await f.read()).status).toBe(401);
});
it('filters unrelated rows and periods out of every denominator with a full synthetic year', async () => {
    const f = fixture();
    const base = f.tables.registros_diarios[0];
    const annual = Array.from({ length: 365 }, (_, i) => ({ ...base, id: '50000000-0000-4000-8000-' + String(i).padStart(12, '0'), data_registro: new Date(Date.UTC(2026, 0, i + 1)).toISOString().slice(0, 10) }));
    f.tables.registros_diarios.push(...annual, { ...base, id: 'other-habit', vicio_id: f.db.tables.vicios[1].id, usuario_id: f.other });
    const res = await f.read(); expect(res.status).toBe(200);
    expect(res.body.cobertura.registros).toBe(11); expect(res.body.dias_checkin.valor).toBe(7);
    expect(res.body.origens.registros.some(row => row.id === 'other-habit')).toBe(false);
    expect((await f.read({ timezone: 'UTC' })).body.timezone).toBe('UTC');
});
it('validates filters, refuses partial successes, never logs private database diagnostics', async () => {
    const f = fixture();
    for (const patch of [{ semana: '2026-10-20' }, { timezone: 'no-zone' }, { vicio_id: 'invalid' }, { limit: 1 }]) expect((await f.read(patch)).status).toBe(422);
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try { f.fail(); const res = await f.read(); expect(res.status).toBe(503); expect(JSON.stringify(res.body)).not.toContain('synthetic-private'); expect(spy).not.toHaveBeenCalled(); }
    finally { spy.mockRestore(); }
});
it('opens authorized source IDs only, including archived habits; text appears only on explicit detail reads', async () => {
    const f = fixture(), id = corpus.urges[0].id;
    f.tables.eventos_vontade[0].nota = 'synthetic-private-note';
    const path = '/api/v2/weekly-summary/sources/vontades/' + id;
    const res = await request(f.app).get(path).set('Authorization', f.auth(corpus.ownerId));
    expect(res.status).toBe(200); expect(res.body.registro.nota).toBe('synthetic-private-note');
    expect((await request(f.app).get(path).set('Authorization', f.auth(f.other))).status).toBe(404);
    expect(JSON.stringify((await f.read()).body)).not.toContain('synthetic-private-note');
    const relapse = await request(f.app).get('/api/v2/weekly-summary/sources/recaidas/' + corpus.relapses[0].id).set('Authorization', f.auth(corpus.ownerId));
    expect(relapse.status).toBe(200);
});
