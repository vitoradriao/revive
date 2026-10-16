const express = require('express');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const { createMobileApi, tokenHash } = require('../../mobile-api');

const { fakeSupabase } = require('../helpers/session-database.cjs');

describe('mobile refresh-token lifecycle', () => {
    it.each([
        { missing: true, enabled: false, rpcError: 'PGRST202', status: 200 },
        { missing: false, enabled: false, rpcError: 'PGRST202', status: 500 },
        { missing: true, enabled: true, rpcError: 'PGRST202', status: 500 },
        { missing: true, enabled: false, rpcError: '42501', status: 500 },
        { missing: true, enabled: false, rpcError: 'PGRST202', lookupError: 'PGRST204', status: 500 },
        { missing: true, enabled: false, rpcError: 'PGRST202', changeHash: true, status: 401 },
    ])('creates legacy sessions only before migration with recovery disabled: %j', async scenario => {
        const database = fakeSupabase({ usuarios: [{ id: 'user-1', nome: 'Synthetic', email: 'test@example.invalid', senha_hash: 'hash', credential_version: 0 }], app_sessions: [] });
        Object.assign(database.state, { createError: scenario.rpcError, missingCredentialColumn: scenario.missing, credentialLookupError: scenario.lookupError, changeHashOnCreate: scenario.changeHash });
        const app = express(); app.use(express.json());
        app.use('/api/v2', createMobileApi({ supabase: database.client, bcrypt: { compare: async () => true }, jwtSecret: 'synthetic-secret', recoveryEnabled: scenario.enabled }));
        const log = vi.spyOn(console, 'error').mockImplementation(() => {});
        try {
            const response = await request(app).post('/api/v2/auth/login').send({ email: 'test@example.invalid', senha: 'Synthetic!1' });
            expect(response.status).toBe(scenario.status);
            expect(database.tables.app_sessions).toHaveLength(scenario.status === 200 ? 1 : 0);
            if (scenario.status === 200) expect(jwt.verify(response.body.access_token, 'synthetic-secret').cv).toBe(0);
        } finally { log.mockRestore(); }
    });
    it('rotates refresh tokens and revokes the family when an old token is reused', async () => {
        const secret = 'test-secret-with-enough-entropy-for-tests';
        const database = fakeSupabase({
            usuarios: [{ id: 'user-1', nome: 'Teste', email: 'teste@example.com', senha_hash: 'hash' }],
            app_sessions: [],
        });
        const app = express();
        app.use(express.json());
        app.use('/api/v2', createMobileApi({
            supabase: database.client,
            bcrypt: { compare: async () => true, hash: async () => 'hash' },
            jwtSecret: secret,
        }));

        const login = await request(app).post('/api/v2/auth/login').send({ email: 'teste@example.com', senha: 'Senha!1' });
        expect(login.status).toBe(200);
        expect(login.body.expires_in).toBe(900);
        const claims = jwt.verify(login.body.access_token, secret);
        expect(claims.token_type).toBe('access');
        expect(claims.exp - claims.iat).toBe(900);
        expect(database.tables.app_sessions[0].refresh_token_hash).toBe(tokenHash(login.body.refresh_token));
        expect(JSON.stringify(database.tables.app_sessions)).not.toContain(login.body.refresh_token);

        const refreshed = await request(app).post('/api/v2/auth/refresh').send({ refresh_token: login.body.refresh_token });
        expect(refreshed.status).toBe(200);
        expect(refreshed.body.refresh_token).not.toBe(login.body.refresh_token);
        expect(database.tables.app_sessions[0].revoked_at).toBeTruthy();
        expect(database.tables.app_sessions[0].replaced_by).toBe(database.tables.app_sessions[1].id);

        const reused = await request(app).post('/api/v2/auth/refresh').send({ refresh_token: login.body.refresh_token });
        expect(reused.status).toBe(401);
        expect(reused.body.codigo).toBe('REFRESH_REUTILIZADO');
        expect(database.tables.app_sessions.every(session => session.revoked_at)).toBe(true);

        const revokedAccess = await request(app).get('/api/v2/bootstrap')
            .set('Authorization', `Bearer ${refreshed.body.access_token}`);
        expect(revokedAccess.status).toBe(401);
        expect(revokedAccess.body.codigo).toBe('SESSAO_REVOGADA');

        database.state.failSessionLookup = true;
        const unavailable = await request(app).get('/api/v2/bootstrap')
            .set('Authorization', `Bearer ${login.body.access_token}`);
        expect(unavailable.status).toBe(503);
        expect(unavailable.body.codigo).toBe('SESSAO_INDISPONIVEL');
    });
});
