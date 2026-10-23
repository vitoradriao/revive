const express = require('express');
const request = require('supertest');
const { createPasswordRecovery, NEUTRAL_MESSAGE, digest } = require('../../password-recovery');

function fixture({ status = 'created', configured = true, deliveryFails = false, databaseFails = false, confirmation = 'changed', enabled = true } = {}) {
    const calls = []; const events = []; const mail = [];
    const database = {
        rpc: async (name, args) => {
            calls.push({ name, args });
            return databaseFails ? { error: {} } : { data: { status: name === 'confirm_password_recovery' ? confirmation : status, email: 'synthetic@example.invalid' } };
        },
        from: () => ({ update: value => ({ eq: async (key, id) => { calls.push({ invalidated: id, value }); return { error: null }; } }) }),
    };
    const app = express(); app.use(express.json());
    app.use('/reset', createPasswordRecovery({ supabase: database, jwtSecret: 'synthetic-secret', enabled,
        bcrypt: { hash: async () => 'synthetic-bcrypt-hash' }, responseFloorMs: 0, observe: event => events.push(event),
        email: { configured, send: async message => { mail.push(message); if (deliveryFails) throw new Error('sensitive-provider-details'); } } }));
    return { app, calls, events, mail };
}
describe('password recovery HTTP contract', () => {
    it('keeps recovery disabled during credential-version rollout without issuing codes', async () => {
        const test = fixture({ enabled: false });
        expect((await request(test.app).post('/reset/request').send({ email: 'synthetic@example.invalid' })).body.mensagem).toBe(NEUTRAL_MESSAGE);
        expect((await request(test.app).post('/reset/confirm').send({ email: 'synthetic@example.invalid',
            request_id: '00000000-0000-4000-8000-000000000000', codigo: '12345678', senha: 'Synthetic!1' })).status).toBe(503);
        expect(test.calls).toHaveLength(0); expect(test.mail).toHaveLength(0);
        expect(test.events).toEqual(['recovery_disabled', 'recovery_disabled']);
    });
    it.each(['created', 'absent', 'limited'])('returns the same neutral envelope for %s', async status => {
        const test = fixture({ status });
        const response = await request(test.app).post('/reset/request').send({ email: ' Synthetic@example.invalid ' });
        expect(response.status).toBe(202);
        expect(response.body).toEqual({ mensagem: NEUTRAL_MESSAGE, request_id: expect.any(String), reenviar_apos: 60 });
        expect(test.calls[0].args.p_email).toBe('synthetic@example.invalid');
        expect(test.calls[0].args.p_email_key).toHaveLength(64);
        if (status === 'created') {
            expect(test.mail).toHaveLength(1);
            expect(test.mail[0].code).toMatch(/^\d{8}$/);
            expect(JSON.stringify(test.calls)).not.toContain(test.mail[0].code);
            expect(JSON.stringify(response.body)).not.toContain(test.mail[0].code);
        } else expect(test.mail).toHaveLength(0);
    });
    it.each([{ configured: false }, { deliveryFails: true }, { databaseFails: true }])('observes infrastructure failure without enumerating users', async options => {
        const test = fixture(options);
        const response = await request(test.app).post('/reset/request').send({ email: 'synthetic@example.invalid' });
        expect(response.status).toBe(202);
        expect(response.body.mensagem).toBe(NEUTRAL_MESSAGE);
        expect(test.events).toHaveLength(1);
        expect(JSON.stringify(test.events)).not.toContain('sensitive-provider-details');
        if (!options.databaseFails) expect(test.calls.some(call => call.invalidated === response.body.request_id)).toBe(true);
    });
    it('validates types, password byte limit and never returns a session after confirmation', async () => {
        const test = fixture();
        const requested = await request(test.app).post('/reset/request').send({ email: 'synthetic@example.invalid' });
        const body = { email: 'synthetic@example.invalid', request_id: requested.body.request_id, codigo: test.mail[0].code, senha: 'Synthetic!1' };
        expect((await request(test.app).post('/reset/confirm').send({ ...body, codigo: 12345678 })).status).toBe(422);
        expect((await request(test.app).post('/reset/confirm').send({ ...body, senha: 'É'.repeat(40) + 'A!' })).status).toBe(422);
        const response = await request(test.app).post('/reset/confirm').send(body);
        expect(response.status).toBe(200);
        expect(response.headers['set-cookie'][0]).toContain('Expires=Thu, 01 Jan 1970');
        expect(response.headers['set-cookie'][0]).toContain('Path=/api/v2/web-auth');
        expect(Object.keys(response.body)).toEqual(['mensagem']);
        expect(test.calls.at(-1).args.p_code_hash).toBe(digest('synthetic-secret', 'code', body.request_id, body.email, body.codigo));
    });
    it.each([['invalid', 400], ['limited', 429]])('maps %s without exposing code details', async (confirmation, expected) => {
        const test = fixture({ confirmation });
        const response = await request(test.app).post('/reset/confirm').send({ email: 'synthetic@example.invalid',
            request_id: '00000000-0000-4000-8000-000000000000', codigo: '12345678', senha: 'Synthetic!1' });
        expect(response.status).toBe(expected);
        expect(JSON.stringify(response.body)).not.toContain('12345678');
    });
});
