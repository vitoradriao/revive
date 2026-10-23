const { createMobileApi } = require('../../mobile-api');
// Handler validation without a listener; HTTP/auth middleware is covered by integration tests.
function fixture() {
    const rpc = vi.fn(async () => ({ data: [], error: null }));
    const router = createMobileApi({ supabase: { rpc }, jwtSecret: 'synthetic-search-route-secret' });
    const handler = router.stack.find(layer => layer.route?.path === '/registros/search').route.stack.at(-1).handle;
    const call = async (body, owner = 'a') => {
        const res = { locals: { requestId: 'synthetic' }, statusCode: 200,
            status(code) { this.statusCode = code; return this; }, json(data) { this.body = data; return this; } };
        await handler({ body, usuarioId: owner }, res); return res;
    };
    return { rpc, call };
}
it('validates strict search bodies and optional paired period before RPC', async () => {
    const f = fixture();
    for (const body of [null, [], { termo: 4 }, { termo: null }, { termo: 'x'.repeat(101) }, { termo: '\0' },
        { termo: '', limit: 0 }, { termo: '', limit: '20' }, { cursor: null }, { unknown: true },
        { inicio: '2026-01-01' }, { inicio: '2026-02-30', fim: '2026-03-01' }, { inicio: '2000-01-01', fim: '2026-03-01' }, { vicio_id: null }]) {
        expect((await f.call(body)).statusCode).toBe(422);
    }
    expect(f.rpc).not.toHaveBeenCalled();
    expect((await f.call({})).statusCode).toBe(200);
    expect(f.rpc).toHaveBeenLastCalledWith('search_diary_records', expect.objectContaining({ p_usuario_id: 'a', p_termo: '', p_limit: 51, p_inicio: null, p_fim: null }));
    expect((await f.call({ termo: '😀'.repeat(100), inicio: '2026-01-01', fim: '2026-12-31', limit: 100 })).statusCode).toBe(200);
});
it('paginates limit+1 with signed bound cursors, preserving literal term in RPC only', async () => {
    const f = fixture();
    const rows = [3,2,1].map(n => ({ id: '20000000-0000-4000-8000-' + String(n).padStart(12,'0'), data_registro: '2026-10-23' }));
    f.rpc.mockResolvedValueOnce({ data: rows, error: null });
    const first = await f.call({ termo: 'Ação %_', limit: 2 });
    expect(first.body.registros).toEqual(rows.slice(0,2)); expect(first.body.next_cursor).toBeTruthy();
    const cursor = first.body.next_cursor;
    const next = await f.call({ termo: 'ACAO %_', limit: 2, cursor });
    expect(next.statusCode).toBe(200);
    expect(f.rpc).toHaveBeenLastCalledWith('search_diary_records', expect.objectContaining({ p_termo: 'ACAO %_', p_cursor_date: '2026-10-23', p_cursor_id: rows[1].id, p_limit: 3 }));
    for (const changed of [{ termo: 'different' }, { limit: 3 }, { vicio_id: '10000000-0000-4000-8000-000000000001' }, { inicio: '2026-01-01', fim: '2026-12-31' }, { cursor: cursor+'x' }]) {
        const result = await f.call({ termo: 'Ação %_', limit: 2, cursor, ...changed });
        expect(result.statusCode).toBe(422); expect(result.body.codigo).toBe('CURSOR_INCOMPATIVEL');
    }
    expect((await f.call({ termo: 'Ação %_', limit: 2, cursor }, 'b')).statusCode).toBe(422);
});
it('keeps errors and private terms out of diagnostics', async () => {
    const f = fixture();
    f.rpc.mockRejectedValueOnce(new Error('synthetic-private-term'));
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
        const result = await f.call({ termo: 'synthetic-private-term' });
        expect(result.statusCode).toBe(503);
        expect(JSON.stringify(result.body)).not.toContain('synthetic-private-term');
        expect(log).not.toHaveBeenCalled();
    } finally { log.mockRestore(); }
});
