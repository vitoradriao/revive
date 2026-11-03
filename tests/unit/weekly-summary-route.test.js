const { createWeeklySummaryHandler, createWeeklySourceHandler } = require('../../weekly-summary');
const { fakeSupabase } = require('../helpers/session-database.cjs');
const { weeklyReadQuery } = require('../helpers/weekly-database.cjs');
const corpus = require('../fixtures/weekly-summary.json');
function fixture() {
    const db = fakeSupabase({ vicios: [{ id: corpus.habitId, usuario_id: corpus.ownerId, ativo: false }] });
    const tables = Object.fromEntries([['registros_diarios', corpus.records], ['eventos_vontade', corpus.urges], ['historico_recaidas', corpus.relapses]].map(([name, rows]) => [name, rows.map(row => ({ ...row, vicio_id: corpus.habitId, usuario_id: corpus.ownerId }))]));
    const original = db.client.from;
    let failure = false;
    db.client.from = vi.fn(name => tables[name] ? weeklyReadQuery(() => tables[name], () => db.tables.vicios, { cap: 2, fail: failure }) : original(name));
    const handler = createWeeklySummaryHandler({ supabase: db.client, clock: () => new Date(corpus.now) });
    const callHandler = async (handle, req) => {
        const res = { statusCode: 200, locals: {}, set: vi.fn(), status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
        await handle(req, res); return res;
    };
    const call = (patch = {}, owner = corpus.ownerId) => callHandler(handler, { usuarioId: owner, query: { vicio_id: corpus.habitId, semana: corpus.week, timezone: corpus.timezone, ...patch } });
    const detail = (type, id, owner = corpus.ownerId) => callHandler(createWeeklySourceHandler({ supabase: db.client }), { usuarioId: owner, params: { type, id } });
    return { call, detail, db, tables, fail: () => { failure = true; } };
}
it('loads every capped page for an archived habit and returns canonical source IDs', async () => {
    const f = fixture(), result = await f.call();
    expect(result.statusCode).toBe(200); expect(result.set).toHaveBeenCalledWith('Cache-Control', 'no-store');
    expect(result.body.dias_checkin.valor).toBe(3); expect(result.body.episodios.quantidade).toBe(6);
    expect(result.body.frases.some(row => row.texto === corpus.expected.phrase)).toBe(true);
    expect(result.body.intensidade).toMatchObject({ media: 5, denominador: 6 });
    expect(result.body.origens.registros).toHaveLength(4);
});
it('denies foreign owner/habit and validates before any data read', async () => {
    const f = fixture();
    expect((await f.call({}, 'other')).statusCode).toBe(404);
    expect((await f.call({ vicio_id: '10000000-0000-4000-8000-000000000002' })).statusCode).toBe(404);
    f.db.client.from.mockClear();
    expect((await f.call({ timezone: 'invalid' })).statusCode).toBe(422); expect(f.db.client.from).not.toHaveBeenCalled();
});
it('fails the complete result if one page fails, with no private diagnostic logging', async () => {
    const f = fixture(), error = vi.spyOn(console, 'error').mockImplementation(() => {}), log = vi.spyOn(console, 'log').mockImplementation(() => {});
    try { f.fail(); const result = await f.call(); expect(result.statusCode).toBe(503); expect(JSON.stringify(result.body)).not.toContain('synthetic-private'); expect(error).not.toHaveBeenCalled(); expect(log).not.toHaveBeenCalled(); }
    finally { error.mockRestore(); log.mockRestore(); }
});
it('opens only authorized source IDs, with ownership rechecked on every detail read', async () => {
    const f = fixture();
    expect((await f.detail('vontades', corpus.urges[0].id)).statusCode).toBe(200);
    expect((await f.detail('recaidas', corpus.relapses[0].id)).statusCode).toBe(200);
    expect((await f.detail('vontades', corpus.urges[0].id, 'other')).statusCode).toBe(404);
    expect((await f.detail('vontades', 'invalid')).statusCode).toBe(404);
    expect((await f.detail('__proto__', corpus.urges[0].id)).statusCode).toBe(404);
});

it('runs the registered v2 session middleware before the summary without opening a listener', async () => {
    const { createMobileApi } = require('../../mobile-api'), jwt = require('jsonwebtoken');
    const f = fixture(), secret = 'synthetic-weekly-route-session-secret';
    f.db.tables.app_sessions = [{ id: 'session', usuario_id: corpus.ownerId, revoked_at: null, expires_at: '2099-01-01' }];
    const router = createMobileApi({ supabase: f.db.client, jwtSecret: secret, weeklySummaryClock: () => new Date(corpus.now) });
    const stack = router.stack.find(layer => layer.route?.path === '/weekly-summary').route.stack;
    const call = async token => {
        const req = { get: () => token ? 'Bearer ' + token : '', query: { vicio_id: corpus.habitId, semana: corpus.week, timezone: corpus.timezone } };
        const res = { locals: {}, statusCode: 200, set() {}, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
        await stack[0].handle(req, res, () => stack[1].handle(req, res)); return res;
    };
    expect((await call()).statusCode).toBe(401);
    expect((await call(jwt.sign({ id: corpus.ownerId }, secret))).statusCode).toBe(401);
    const token = jwt.sign({ id: corpus.ownerId, sid: 'session', token_type: 'access' }, secret);
    expect((await call(token)).body.episodios.quantidade).toBe(6);
    f.db.tables.app_sessions[0].revoked_at = corpus.now;
    expect((await call(token)).statusCode).toBe(401);
});
