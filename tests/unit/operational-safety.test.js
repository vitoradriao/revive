const express = require('express');
const request = require('supertest');
const { distributedLimit, healthCheck, deleteHabit } = require('../../operational-safety');

describe('operational safety', () => {
    it('reports unavailable database without leaking its error', async () => {
        const query = { select: () => query, limit: () => query, abortSignal: async () => ({ error: { message: 'private details' } }) };
        const app = express(); app.get('/health', healthCheck({ from: () => query }));
        const response = await request(app).get('/health');
        expect(response.status).toBe(503); expect(response.text).not.toContain('private details');
    });
    it('reports database readiness', async () => {
        const query = { select: () => query, limit: () => query, abortSignal: async () => ({ error: null }) };
        const app = express(); app.get('/health', healthCheck({ from: () => query }));
        expect((await request(app).get('/health')).body.database).toBe('ok');
    });
    it('shares counters between instances and fails closed on database errors', async () => {
        const calls = []; let hits = 0; let down = false;
        const database = { rpc: async (_name, args) => { calls.push(args); return { data: ++hits <= 1, error: down ? {} : null }; } };
        const app = () => { const a = express(); a.get('/', distributedLimit({ supabase: database, secret: 'test', kind: 'login', seconds: 900, max: 1 }), (_q,r)=>r.sendStatus(200)); return a; };
        expect((await request(app()).get('/')).status).toBe(200);
        const denied = await request(app()).get('/'); expect(denied.status).toBe(429); expect(denied.headers['retry-after']).toBe('900');
        expect(calls[0].p_key).toBe(calls[1].p_key); expect(calls[0].p_key).toMatch(/^[a-f0-9]{64}$/);
        down = true; expect((await request(app()).get('/')).status).toBe(503);
    });
    it('deletes through one owner-scoped transaction and handles rollback', async () => {
        let fail = false; const rpc = vi.fn(async () => ({ data: true, error: fail ? {} : null }));
        const app = express(); app.delete('/:id', (q,_r,next)=>{q.usuarioId='owner';next();}, deleteHabit({ rpc }));
        const id = '00000000-0000-4000-8000-000000000001';
        expect((await request(app).delete('/'+id)).status).toBe(200);
        expect(rpc).toHaveBeenCalledWith('delete_revive_habit',{p_usuario_id:'owner',p_vicio_id:id});
        fail=true; expect((await request(app).delete('/'+id)).status).toBe(503);
        expect((await request(app).delete('/invalid')).status).toBe(400);
    });
});
