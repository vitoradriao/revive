const express = require('express');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const { createMobileApi } = require('../../mobile-api');

const secret = 'test-secret-with-enough-entropy-for-mutations';

function createApp() {
    const calls = [];
    const session = {
        id: 'session-1', usuario_id: 'user-1', revoked_at: null,
        expires_at: new Date(Date.now() + 60_000).toISOString(),
    };
    const supabase = {
        from(table) {
            if (table !== 'app_sessions') throw new Error(`Unexpected table ${table}`);
            const filters = [];
            return {
                select() { return this; },
                eq(field, value) { filters.push(row => row[field] === value); return this; },
                is(field, value) { filters.push(row => row[field] === value); return this; },
                gt(field, value) { filters.push(row => row[field] > value); return this; },
                async maybeSingle() {
                    return { data: filters.every(filter => filter(session)) ? { id: session.id } : null, error: null };
                },
            };
        },
        async rpc(name, args) {
            calls.push({ name, args });
            return { data: [{ status_code: 201, response_body: { registro: { id: 'server-record-1' } } }], error: null };
        },
    };
    const app = express();
    app.use(express.json());
    app.use('/api/v2', createMobileApi({ supabase, bcrypt: {}, jwtSecret: secret }));
    const token = jwt.sign({ id: 'user-1', sid: session.id, token_type: 'access' }, secret, { expiresIn: '5m' });
    return { app, token, calls };
}

it('uses the transactional RPC and stable payload hash for retries with reordered fields', async () => {
    const { app, token, calls } = createApp();
    const key = '4f926a5f-16a1-4fd0-8ed1-ef2b6957a80f';
    const first = await request(app).post('/api/v2/registros')
        .set('Authorization', `Bearer ${token}`).set('Idempotency-Key', key)
        .send({ vicio_id: '00000000-0000-4000-8000-000000000001', data_registro: '2026-09-01', humor: 'synthetic' });
    const replay = await request(app).post('/api/v2/registros')
        .set('Authorization', `Bearer ${token}`).set('Idempotency-Key', key)
        .send({ humor: 'synthetic', data_registro: '2026-09-01', vicio_id: '00000000-0000-4000-8000-000000000001' });

    expect(first.status).toBe(201);
    expect(replay.status).toBe(201);
    expect(calls).toHaveLength(2);
    expect(calls.map(call => call.name)).toEqual(['execute_mobile_mutation', 'execute_mobile_mutation']);
    expect(calls[0].args.p_operation).toBe('record.create');
    expect(calls[0].args.p_idempotency_key).toBe(key);
    expect(calls[0].args.p_request_hash).toBe(calls[1].args.p_request_hash);
    expect(calls[0].args.p_legacy_request_hash).not.toBe(calls[1].args.p_legacy_request_hash);
  });

it('sends goal completion intent with its target id and explicit completed state', async () => {
    const { app, token, calls } = createApp();
    const response = await request(app).patch('/api/v2/metas/00000000-0000-4000-8000-000000000002')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', '8af7df3f-ce94-4aaf-a042-686b427122b7')
        .send({ concluida: true });

    expect(response.status).toBe(201);
    expect(calls[0].args.p_operation).toBe('goal.complete');
  expect(calls[0].args.p_payload).toEqual({ concluida: true, goalId: '00000000-0000-4000-8000-000000000002' });
});
