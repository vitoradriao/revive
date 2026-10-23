const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const { createMobileApi, tokenHash } = require('../../mobile-api');
const { fakeSupabase } = require('../helpers/session-database.cjs');

const secret = 'synthetic-web-session-secret';
const origin = 'http://web.example.invalid';
function fixture(secure = false, enabled = true) {
    const database = fakeSupabase({
        usuarios: [{ id: 'user-1', nome: 'Synthetic', email: 'web@example.invalid', senha_hash: 'hash', credential_version: 0 }],
        app_sessions: []
    });
    const bcrypt = { compare: vi.fn(async () => true), hash: vi.fn(async () => 'hash') };
    const app = express(); app.use(express.json());
    app.use('/api/v2', createMobileApi({ supabase: database.client, bcrypt, jwtSecret: secret, webSecureCookies: secure, webAuthEnabled: enabled }));
    const post = (action, body = {}, cookie, suppliedOrigin = secure ? 'https://web.example.invalid' : origin) => {
        const call = request(app).post('/api/v2/web-auth/' + action).set('Host', 'web.example.invalid');
        if (suppliedOrigin !== undefined) call.set('Origin', suppliedOrigin);
        if (cookie) call.set('Cookie', cookie);
        return call.send(body);
    };
    return { database, app, bcrypt, post };
}
const cookieOf = response => response.headers['set-cookie'][0].split(';')[0];

describe('web session transport using native session rules', () => {
    it('keeps the rollout disabled until enabled without changing mobile login', async () => {
        const { app, post, database } = fixture(false, false);
        const web = await post('login', { email: 'web@example.invalid', senha: 'Synthetic!1' });
        expect(web.status).toBe(503);
        expect(web.body.codigo).toBe('WEB_AUTH_DESABILITADO');
        expect(web.headers['cache-control']).toBe('no-store');
        expect(web.headers['set-cookie']).toBeUndefined();
        expect(database.tables.app_sessions).toHaveLength(0);
        const mobile = await request(app).post('/api/v2/auth/login').send({ email: 'web@example.invalid', senha: 'Synthetic!1' });
        expect(mobile.status).toBe(200);
        expect(typeof mobile.body.refresh_token).toBe('string');
        const missing = await request(app).post('/api/v2/auth/refresh').send({});
        expect(missing.status).toBe(422);
        expect(missing.body.mensagem).toBe('Refresh token obrigatorio.');
    });
    it('uses an HttpOnly, host-only cookie and never returns refresh token in web JSON', async () => {
        const { database, post } = fixture();
        const login = await post('login', { email: 'web@example.invalid', senha: 'Synthetic!1' });
        expect(login.status).toBe(200);
        const cookie = login.headers['set-cookie'][0];
        expect(cookie).toContain('HttpOnly');
        expect(cookie).toContain('SameSite=Lax');
        expect(cookie).toContain('Path=/api/v2/web-auth');
        expect(cookie).not.toContain('Domain=');
        expect(cookie).not.toContain('Secure');
        expect(login.headers['cache-control']).toBe('no-store');
        expect(login.body.refresh_token).toBeUndefined();
        expect(cookie).not.toContain(login.body.access_token);
        expect(jwt.verify(login.body.access_token, secret).token_type).toBe('access');
        const raw = cookieOf(login).split('=')[1];
        expect(database.tables.app_sessions[0].refresh_token_hash).toBe(tokenHash(raw));
    });
    it('sets Secure in production mode and rejects insecure origins', async () => {
        const { post } = fixture(true);
        expect((await post('login', { email: 'web@example.invalid', senha: 'Synthetic!1' })).headers['set-cookie'][0]).toContain('; Secure');
        expect((await post('login', {}, null, origin)).status).toBe(403);
    });
    it('rejects cross-origin and missing-origin requests before touching credentials or cookies', async () => {
        const { app, post, bcrypt, database } = fixture();
        for (const other of ['null', 'https://hostile.example.invalid', 'http://web.example.invalid.evil.test']) {
            const rejected = await post('login', { email: 'web@example.invalid', senha: 'Synthetic!1' }, null, other);
            expect(rejected.status).toBe(403);
            expect(rejected.headers['set-cookie']).toBeUndefined();
        }
        const absent = await request(app).post('/api/v2/web-auth/refresh').set('Host', 'web.example.invalid').send({});
        expect(absent.status).toBe(403);
        expect(database.tables.app_sessions).toHaveLength(0);
        expect(bcrypt.compare).not.toHaveBeenCalled();
    });
    it('rotates using only the cookie, clears invalid cookies and preserves mobile contracts', async () => {
        const { app, post } = fixture();
        const login = await post('login', { email: 'web@example.invalid', senha: 'Synthetic!1' });
        const refreshed = await post('refresh', { refresh_token: 'body-is-ignored' }, cookieOf(login));
        expect(refreshed.status).toBe(200);
        expect(refreshed.body.refresh_token).toBeUndefined();
        expect(cookieOf(refreshed)).not.toBe(cookieOf(login));
        const reused = await post('refresh', {}, cookieOf(login));
        expect(reused.status).toBe(401);
        expect(reused.body.codigo).toBe('REFRESH_REUTILIZADO');
        expect(reused.headers['set-cookie'][0]).toContain('Expires=Thu, 01 Jan 1970');
        const mobile = await request(app).post('/api/v2/auth/login').send({ email: 'web@example.invalid', senha: 'Synthetic!1' });
        expect(mobile.status).toBe(200);
        expect(typeof mobile.body.refresh_token).toBe('string');
        expect(mobile.headers['set-cookie']).toBeUndefined();
    });
    it('logs out by cookie family even when a tab holds an older access token', async () => {
        const { app, database, post } = fixture();
        const login = await post('login', { email: 'web@example.invalid', senha: 'Synthetic!1' });
        const refreshed = await post('refresh', {}, cookieOf(login));
        const logout = await post('logout', {}, cookieOf(refreshed));
        expect(logout.status).toBe(204);
        expect(logout.text).toBe('');
        expect(database.tables.app_sessions.every(item => item.revoked_at)).toBe(true);
        const after = await request(app).get('/api/v2/bootstrap').set('Authorization', 'Bearer ' + refreshed.body.access_token);
        expect(after.status).toBe(401);
        expect((await post('logout')).status).toBe(204);
    });
    it('does not clear a usable cookie or claim logout when database validation is unavailable', async () => {
        const { database, post } = fixture();
        const login = await post('login', { email: 'web@example.invalid', senha: 'Synthetic!1' });
        database.state.failSessionLookup = true;
        const failed = await post('logout', {}, cookieOf(login));
        expect(failed.status).toBe(503);
        expect(failed.headers['set-cookie']).toBeUndefined();
        database.state.failSessionLookup = false;
        database.state.createError = 'DB_UNAVAILABLE';
        const logger = vi.spyOn(console, 'error').mockImplementation(() => {});
        try {
            const unavailable = await post('login', { email: 'web@example.invalid', senha: 'Synthetic!1' });
            expect(unavailable.status).toBe(503);
            expect(unavailable.body.codigo).toBe('ERRO_INTERNO');
        } finally { logger.mockRestore(); }
    });
    it('expires the web cookie only after authenticated account deletion is confirmed', async () => {
        const { app, post, database } = fixture();
        const login = await post('login', { email: 'web@example.invalid', senha: 'Synthetic!1' });
        const remove = () => request(app).delete('/api/v2/account').set('Authorization', 'Bearer ' + login.body.access_token);
        database.state.failAccountDelete = true;
        const logger = vi.spyOn(console, 'error').mockImplementation(() => {});
        try {
            const failure = await remove();
            expect(failure.status).toBe(500);
            expect(failure.headers['set-cookie']).toBeUndefined();
            expect(database.tables.usuarios).toHaveLength(1);
            expect(database.tables.app_sessions[0].revoked_at).toBeNull();
        } finally { logger.mockRestore(); }
        database.state.failAccountDelete = false;
        const deleted = await remove();
        expect(deleted.status).toBe(204); expect(deleted.text).toBe('');
        expect(deleted.headers['set-cookie'][0]).toContain('Path=/api/v2/web-auth');
        expect(deleted.headers['set-cookie'][0]).toContain('Expires=Thu, 01 Jan 1970');
        expect(deleted.headers['set-cookie'][0]).toContain('HttpOnly');
        expect((await request(app).get('/api/v2/bootstrap').set('Authorization', 'Bearer ' + login.body.access_token)).status).toBe(401);
        expect((await post('refresh', {}, cookieOf(login))).status).toBe(401);
        expect(database.tables.usuarios).toHaveLength(0);
    });
    it('requires a cookie even if a refresh token is supplied in JSON', async () => {
        const { post } = fixture();
        const missing = await post('refresh', { refresh_token: 'not-a-cookie' });
        expect(missing.status).toBe(401);
        expect(missing.body.codigo).toBe('REFRESH_AUSENTE');
    });
});
