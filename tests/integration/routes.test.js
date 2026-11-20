const request = require('supertest');
const { app } = require('../../index');

describe('api routes', () => {
    it('GET /api/live responds with status payload', async () => {
        const response = await request(app).get('/api/live');

        expect(response.statusCode).toBe(200);
        expect(response.headers['cache-control']).toBe('no-store');
        expect(response.headers['ratelimit-limit']).toBeUndefined();
        expect(response.body).toHaveProperty('status');
        expect(response.body).toHaveProperty('timestamp');
    });

    it.each(['/api/auth/login', '/api/auth/cadastro', '/api/vicios/00000000-0000-4000-8000-000000000001/recaida'])('retires %s', async path => {
        const response = await request(app).post(path).send({});
        expect(response.status).toBe(410);
        expect(response.body.codigo).toBe('ROTA_DESCONTINUADA');
    });
});
