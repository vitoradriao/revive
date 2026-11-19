const request = require('supertest');
const vercelHandler = require('../../api/[...path]');

describe('vercel api handler', () => {
    it('forwards API requests to the Express app', async () => {
        const response = await request(vercelHandler).get('/api/live');

        expect(response.statusCode).toBe(200);
        expect(response.body).toHaveProperty('status');
        expect(response.body).toHaveProperty('timestamp');
    });

    it('normalizes Vercel dynamic route params before forwarding', async () => {
        const response = await request(vercelHandler).get('/api/[...path]?path=live');

        expect(response.statusCode).toBe(200);
        expect(response.body).toHaveProperty('status');
    });
});
