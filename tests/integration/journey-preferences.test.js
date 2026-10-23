const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const { createMobileApi } = require('../../mobile-api');
const { fakeSupabase } = require('../helpers/session-database.cjs');
const { defaultPreferences } = require('../../journey-preferences');

it('authenticates reads, scopes defaults/rows to the account and maps atomic conflicts without disclosing the other owner', async () => {
    const secret = 'synthetic-preferences-secret';
    const db = fakeSupabase({ usuarios: [{ id: 'a' }, { id: 'b' }],
        app_sessions: ['a', 'b'].map(id => ({ id, usuario_id: id, revoked_at: null, expires_at: '2099-01-01' })),
        journey_preferences: [{ usuario_id: 'b', ...defaultPreferences(), revision: 4, intro: { version: 2, state: 'completed' } }],
    });
    const rpc = vi.fn(async () => ({ data: { status: 409 }, error: null })); db.client.rpc = rpc;
    const app = express(); app.use(express.json()); app.use('/api/v2', createMobileApi({ supabase: db.client, jwtSecret: secret }));
    const token = user => jwt.sign({ id: user, sid: user, token_type: 'access' }, secret);
    const read = user => request(app).get('/api/v2/preferences').set('Authorization', 'Bearer ' + token(user));
    expect((await request(app).get('/api/v2/preferences')).status).toBe(401);
    const a = await read('a'); expect(a.status).toBe(200); expect(a.body.preferences).toEqual(defaultPreferences());
    expect(a.headers['cache-control']).toBe('no-store'); expect((await read('b')).body.preferences.revision).toBe(4);
    const patch = body => request(app).patch('/api/v2/preferences').set('Authorization', 'Bearer ' + token('a')).send(body);
    expect((await patch({ revision: 0, indicator_order: [] })).status).toBe(422); expect(rpc).not.toHaveBeenCalled();
    expect((await patch({ revision: 1, intro: { version: 3, state: 'dismissed' } })).status).toBe(409);
    expect(rpc).toHaveBeenCalledWith('edit_journey_preferences', { p_usuario_id: 'a', p_revision: 1, p_patch: { intro: { version: 3, state: 'dismissed' } } });
    rpc.mockResolvedValueOnce({ data: { status: 422 }, error: null });
    expect((await patch({ revision: 0, primary_habit_id: '10000000-0000-4000-8000-000000000001' })).status).toBe(422);
    rpc.mockResolvedValueOnce({ data: { status: 200, preferences: { ...defaultPreferences(), revision: 1 } }, error: null });
    expect((await patch({ revision: 0, primary_habit_id: null })).body.preferences.revision).toBe(1);
    rpc.mockResolvedValueOnce({ error: { code: 'synthetic' } });
    expect((await patch({ revision: 1, primary_habit_id: null })).status).toBe(503);
});
