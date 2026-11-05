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
            if (name === 'edit_revive_habit') return { data: { status: 200, vicio: { id: args.p_vicio_id, revision: args.p_revision + 1, ...args.p_patch } }, error: null };
            if (name === 'execute_mobile_urge_mutation') {
                return { data: [{ status_code: 201, response_body: { vontade: {
                    id: 'server-urge-1', usuario_id: 'user-1', vicio_id: 'habit-a',
                    occurred_at: '2026-09-28T01:00:00.000Z', timezone: 'America/Sao_Paulo',
                    intensidade: 4, gatilhos: ['estresse'], nota: null, acao_realizada: null,
                    resultado: null, created_at: '2026-09-28T01:00:00.000Z', updated_at: '2026-09-28T01:00:00.000Z',
                } } }], error: null };
            }
            if (name === 'list_urge_events') {
                const rows = [
                    { habit_found: true, id: '10000000-0000-4000-8000-000000000002', usuario_id: 'user-1', vicio_id: args.p_vicio_id, occurred_at: '2026-09-28T01:00:00.000Z', timezone: 'America/Sao_Paulo', intensidade: 4, gatilhos: ['estresse'], nota: null, acao_realizada: null, resultado: null, created_at: '2026-09-28T01:00:00.000Z', updated_at: '2026-09-28T01:00:00.000Z', total_count: 2 },
                    { habit_found: true, id: '10000000-0000-4000-8000-000000000001', usuario_id: 'user-1', vicio_id: args.p_vicio_id, occurred_at: '2026-09-28T01:00:00.000Z', timezone: 'America/Sao_Paulo', intensidade: 3, gatilhos: ['outro'], nota: null, acao_realizada: null, resultado: null, created_at: '2026-09-28T01:00:00.000Z', updated_at: '2026-09-28T01:00:00.000Z', total_count: 2 },
                ];
                return { data: args.p_cursor_id ? [rows[1]] : rows, error: null };
            }
            return { data: [{ status_code: 201, response_body: { registro: { id: 'server-record-1' } } }], error: null };
        },
    };
    const app = express();
    app.use(express.json());
    app.use('/api/v2', createMobileApi({ supabase, bcrypt: {}, jwtSecret: secret }));
    const token = jwt.sign({ id: 'user-1', sid: session.id, token_type: 'access' }, secret, { expiresIn: '5m' });
    return { app, token, calls };
}

it('forwards a validated online edit and its owner/revision to the transactional RPC', async () => {
    const { app, token, calls } = createApp();
    const response = await request(app).patch('/api/v2/vicios/10000000-0000-4000-8000-000000000001')
        .set('Authorization', `Bearer ${token}`).send({ revision: 3, nome_vicio: ' Café ', ativo: false });
    expect(response.status).toBe(200);
    expect(response.body.vicio.revision).toBe(4);
    expect(calls[0]).toEqual({ name: 'edit_revive_habit', args: {
        p_usuario_id: 'user-1', p_vicio_id: '10000000-0000-4000-8000-000000000001', p_revision: 3,
        p_patch: { nome_vicio: 'Café', ativo: false },
    } });
});

it('rejects unauthorized fields before invoking the edit RPC', async () => {
    const { app, token, calls } = createApp();
    const response = await request(app).patch('/api/v2/vicios/10000000-0000-4000-8000-000000000001')
        .set('Authorization', `Bearer ${token}`).send({ revision: 3, usuario_id: 'other' });
    expect(response.status).toBe(422);
    expect(calls).toHaveLength(0);
});

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

it('sends only validated, allowlisted urge fields to the atomic idempotent mutation', async () => {
    const { app, token, calls } = createApp();
    const response = await request(app).post('/api/v2/vontades')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', '45763824-3b9e-4ab7-9d13-6cb73fae6106')
        .send({
            vicio_id: '10000000-0000-4000-8000-000000000001',
            occurred_at: '2026-09-27T22:00:00-03:00',
            timezone: 'America/Sao_Paulo',
            intensidade: 4,
            gatilhos: ['estresse'],
            nota: 'synthetic note',
        });

    expect(response.status).toBe(201);
    expect(calls.at(-1).name).toBe('execute_mobile_urge_mutation');
    expect(calls.at(-1).args.p_operation).toBe('urge.create');
    expect(calls.at(-1).args.p_payload).toEqual({
        vicio_id: '10000000-0000-4000-8000-000000000001',
        occurred_at: '2026-09-28T01:00:00.000Z',
        timezone: 'America/Sao_Paulo', intensidade: 4, gatilhos: ['estresse'],
        nota: 'synthetic note', acao_realizada: null, resultado: null,
    });
});

it('rejects malformed urge content before reserving an idempotency key', async () => {
    const { app, token, calls } = createApp();
    const invalid = await request(app).post('/api/v2/vontades')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', '7e9e3789-3ed0-47d0-9c6a-9d1e94cbf2ea')
        .send({
            vicio_id: '10000000-0000-4000-8000-000000000001',
            occurred_at: '2026-09-27T22:00:00-03:00', timezone: 'Not/AZone',
            intensidade: 11, gatilhos: ['estresse', 'estresse'],
        });
    expect(invalid.status).toBe(422);
    expect(invalid.body.campos).toMatchObject({ timezone: expect.any(String), intensidade: expect.any(String), gatilhos: expect.any(String) });
    expect(calls).toHaveLength(0);
});

it('paginates urge events with a validated stable cursor and explicit selection coverage', async () => {
    const { app, token, calls } = createApp();
    const query = '/api/v2/vontades?vicio_id=10000000-0000-4000-8000-000000000001&inicio=2026-09-27&fim=2026-09-27&timezone=America%2FSao_Paulo&limit=1';
    const first = await request(app).get(query).set('Authorization', `Bearer ${token}`);
    expect(first.status).toBe(200);
    expect(first.body.vontades).toHaveLength(1);
    expect(first.body.cobertura).toEqual({ total: 2, retornados: 1, tem_mais: true });
    expect(first.body.next_cursor).toBeTruthy();

    const second = await request(app).get(`${query}&cursor=${encodeURIComponent(first.body.next_cursor)}`)
        .set('Authorization', `Bearer ${token}`);
    expect(second.status).toBe(200);
    expect(second.body.vontades).toHaveLength(1);
    expect(second.body.vontades[0].id).not.toBe(first.body.vontades[0].id);
    expect(calls.at(-1).args.p_cursor_id).toBe(first.body.vontades[0].id);
});

it('normalizes a reason for the owner/revision RPC while default DTOs omit private content', async () => {
    const { app, token, calls } = createApp();
    const path = '/api/v2/vicios/10000000-0000-4000-8000-000000000001';
    const patch = header => {
        const call = request(app).patch(path).set('Authorization', `Bearer ${token}`);
        if (header) call.set('X-Revive-Include-Personal-Reason', 'true');
        return call.send({ revision: 3, motivo_pessoal: '  synthetic-private-marker\r\nlinha  ' });
    };
    const legacy = await patch(false);
    expect(legacy.status).toBe(200);
    expect(JSON.stringify(legacy.body).includes('synthetic-private-marker')).toBe(false);
    const web = await patch(true);
    expect(web.status).toBe(200);
    expect(web.body.vicio.motivo_pessoal === 'synthetic-private-marker\nlinha').toBe(true);
    expect(calls[0].args).toMatchObject({ p_usuario_id: 'user-1', p_revision: 3 });
    expect(calls[0].args.p_patch.motivo_pessoal === web.body.vicio.motivo_pessoal).toBe(true);
    expect(web.headers['cache-control']).toBe('no-store');
    expect(web.headers.vary).toContain('X-Revive-Include-Personal-Reason');
    const oversized = await request(app).patch(path).set('Authorization', `Bearer ${token}`)
        .send({ revision: 3, motivo_pessoal: '😀'.repeat(1001) });
    expect(oversized.status).toBe(422);
    expect(calls).toHaveLength(2);
    expect(oversized.body.campos).toHaveProperty('motivo_pessoal');
});
