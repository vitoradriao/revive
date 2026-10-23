const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const { createMobileApi } = require('../../mobile-api');
const { fakeSupabase } = require('../helpers/session-database.cjs');

it('keeps bootstrap private by default and isolates explicitly requested reasons by account', async () => {
    const secret = 'synthetic-personal-reason-test';
    const database = fakeSupabase({
        usuarios: [{ id: 'a' }, { id: 'b' }],
        app_sessions: ['a', 'b'].map(id => ({ id, usuario_id: id, revoked_at: null, expires_at: '2099-01-01' })),
        vicios: ['a', 'b'].map(id => ({ id, usuario_id: id, revision: 1, ativo: false, data_inicio: new Date().toISOString(), motivo_pessoal: `synthetic-private-${id}` })),
        registros_diarios: [], historico_recaidas: [], metas: [], mensagens_motivacionais: [],
        progresso_periodos: [], segmentos_economia: [], conquistas_permanentes: [],
    });
    const original = database.client.from;
    database.client.from = table => {
        const query = original(table);
        query.order = query.limit = function () { return this; };
        return query;
    };
    const app = express(); app.use(express.json());
    app.use('/api/v2', createMobileApi({ supabase: database.client, jwtSecret: secret }));
    const read = (user, include) => {
        const call = request(app).get('/api/v2/bootstrap').set('Authorization', 'Bearer ' + jwt.sign({ id: user, sid: user, token_type: 'access' }, secret));
        return include ? call.set('X-Revive-Include-Personal-Reason', 'true') : call;
    };
    const legacy = await read('a', false);
    expect(legacy.status).toBe(200);
    expect(JSON.stringify(legacy.body).includes('synthetic-private-')).toBe(false);
    for (const user of ['a', 'b']) {
        const response = await read(user, true);
        expect(response.status).toBe(200);
        expect(response.body.vicios).toHaveLength(1);
        expect(response.body.vicios[0].motivo_pessoal === `synthetic-private-${user}`).toBe(true);
        expect(JSON.stringify(response.body.mensagem).includes('synthetic-private-')).toBe(false);
    }
});
