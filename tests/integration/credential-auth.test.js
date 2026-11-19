const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const { createCredentialAuth } = require('../../credential-auth');
function fixture(recoveryEnabled = false) {
    const state = { version: 0, session: true, unavailable: false, missingColumn: false, account: true, errorCode: null };
    const database = { from: table => {
        let columns;
        const query = { select: value => { columns = value; return query; }, eq: () => query, is: () => query, gt: () => query,
            maybeSingle: async () => ({ error: state.unavailable ? {} : state.errorCode ? { code: state.errorCode }
                : columns === 'credential_version' && state.missingColumn ? { code: '42703' } : null,
                data: table === 'usuarios' ? state.account ? { id: 'user', credential_version: state.version } : null
                    : state.session ? { id: 'session' } : null }) };
        return query;
    } };
    const app = express(); app.get('/protected', createCredentialAuth({ supabase: database, jwtSecret: 'synthetic-secret', recoveryEnabled }), (_, res) => res.sendStatus(200));
    const call = claims => request(app).get('/protected').set('Authorization', `Bearer ${jwt.sign({ id: 'user', ...claims }, 'synthetic-secret', { expiresIn: '1m' })}`);
    return { state, call };
}
describe('web credentials rollout', () => {
    it('rejects a legacy token older than fifteen minutes even with a seven-day expiry', async () => {
        const app = express();
        app.get('/', createCredentialAuth({ supabase: { from: () => { throw new Error('must reject before database'); } }, jwtSecret: 'synthetic-secret' }), (_q,r)=>r.sendStatus(200));
        const token = jwt.sign({ id: 'user', iat: Math.floor(Date.now()/1000)-901 }, 'synthetic-secret', { expiresIn: '7d' });
        expect((await request(app).get('/').set('Authorization', `Bearer ${token}`)).status).toBe(401);
    });
    it('supports the old schema only with recovery disabled and stops fallback after migration', async () => {
        const test = fixture(); test.state.missingColumn = true;
        expect((await test.call({})).status).toBe(200);
        expect((await test.call({ cv: 0 })).status).toBe(200);
        expect((await test.call({ cv: 1 })).status).toBe(401);
        test.state.account = false;
        expect((await test.call({})).status).toBe(401);
        test.state.account = true; test.state.missingColumn = false; test.state.version = 1;
        expect((await test.call({})).status).toBe(401);
        const enabled = fixture(true); enabled.state.missingColumn = true;
        expect((await enabled.call({})).status).toBe(503);
    });
    it.each(['42501', 'PGRST204', '08006'])('never falls back for database error %s', async errorCode => {
        const test = fixture(); test.state.errorCode = errorCode;
        expect((await test.call({})).status).toBe(503);
    });
    it('accepts versionless legacy JWTs only before the first password change', async () => {
        const test = fixture();
        expect((await test.call({})).status).toBe(200);
        test.state.version = 1;
        expect((await test.call({})).status).toBe(401);
        expect((await test.call({ cv: 0 })).status).toBe(401);
        expect((await test.call({ cv: 1 })).status).toBe(200);
        test.state.unavailable = true;
        expect((await test.call({ cv: 1 })).status).toBe(503);
    });
    it('honors mobile revocation on compatibility routes', async () => {
        const test = fixture();
        expect((await test.call({ sid: 'session', token_type: 'access' })).status).toBe(200);
        test.state.session = false;
        expect((await test.call({ sid: 'session', token_type: 'access' })).status).toBe(401);
        expect((await test.call({ sid: 'session', token_type: 'other' })).status).toBe(401);
    });
});
