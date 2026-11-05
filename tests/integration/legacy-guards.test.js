const jwt = require('jsonwebtoken');
const request = require('supertest');
const supabaseJs = require('@supabase/supabase-js');

const OWNER_ID = 'user-owner';
const OTHER_VICIO_ID = '00000000-0000-4000-8000-0000000000aa';
const OWN_VICIO_ID = '00000000-0000-4000-8000-0000000000bb';

// Minimal in-memory stand-in for the Supabase query builder used by index.js.
function createFakeSupabase() {
    const tables = {
        usuarios: [{ id: OWNER_ID, credential_version: 0 }],
        vicios: [
            { id: OWN_VICIO_ID, usuario_id: OWNER_ID, data_inicio: '2026-01-01', valor_economizado_por_dia: 0 },
            { id: OTHER_VICIO_ID, usuario_id: 'user-other', data_inicio: '2026-01-01', valor_economizado_por_dia: 0 },
        ],
        metas: [],
        mensagens_motivacionais: [{ id: 'm1', mensagem: 'Siga firme', tipo_vicio: 'geral', ativa: true }],
    };
    const calls = [];
    const builder = table => {
        const filters = [];
        let insertRows = null;
        const query = {
            select() { return query; },
            eq(field, value) { filters.push(row => row[field] === value); return query; },
            in(field, values) { calls.push({ table, op: 'in', field, values }); filters.push(row => values.includes(row[field])); return query; },
            or(expression) { calls.push({ table, op: 'or', expression }); return query; },
            insert(rows) { insertRows = rows; return query; },
            rows() { return (tables[table] || []).filter(row => filters.every(filter => filter(row))); },
            async single() {
                if (insertRows) {
                    const row = { id: `${table}-${tables[table].length + 1}`, ...insertRows[0] };
                    tables[table].push(row);
                    return { data: row, error: null };
                }
                const [row] = query.rows();
                return row ? { data: row, error: null } : { data: null, error: { code: 'PGRST116' } };
            },
            async maybeSingle() { return { data: query.rows()[0] || null, error: null }; },
            then(resolve, reject) { return Promise.resolve({ data: query.rows(), error: null }).then(resolve, reject); },
        };
        return query;
    };
    return { tables, calls, from: builder, rpc: async () => ({ data: null, error: null }) };
}

describe('legacy v1 guards', () => {
    let app;
    let fake;
    let originalCreateClient;
    const token = () => jwt.sign({ id: OWNER_ID, cv: 0 }, process.env.JWT_SECRET, { algorithm: 'HS256' });

    beforeAll(() => {
        fake = createFakeSupabase();
        originalCreateClient = supabaseJs.createClient;
        supabaseJs.createClient = () => fake;
        delete require.cache[require.resolve('../../index')];
        ({ app } = require('../../index'));
    });

    afterAll(() => {
        supabaseJs.createClient = originalCreateClient;
        delete require.cache[require.resolve('../../index')];
    });

    it('POST /api/metas rejects a vicio_id owned by another user', async () => {
        const response = await request(app)
            .post('/api/metas')
            .set('Authorization', `Bearer ${token()}`)
            .send({ descricao_meta: 'Meta alheia', vicio_id: OTHER_VICIO_ID });

        expect(response.statusCode).toBe(404);
        expect(fake.tables.metas).toHaveLength(0);
    });

    it('POST /api/metas accepts the user own vicio_id', async () => {
        const response = await request(app)
            .post('/api/metas')
            .set('Authorization', `Bearer ${token()}`)
            .send({ descricao_meta: 'Meta propria', vicio_id: OWN_VICIO_ID });

        expect(response.statusCode).toBe(201);
        expect(fake.tables.metas).toHaveLength(1);
    });

    it('GET /api/mensagens/diaria filters with escaped values instead of a raw PostgREST expression', async () => {
        const response = await request(app)
            .get('/api/mensagens/diaria')
            .query({ tipo_vicio: 'geral' })
            .set('Authorization', `Bearer ${token()}`);

        expect(response.statusCode).toBe(200);
        expect(fake.calls.some(call => call.op === 'or')).toBe(false);
        expect(fake.calls).toContainEqual({ table: 'mensagens_motivacionais', op: 'in', field: 'tipo_vicio', values: ['geral'] });
    });

    it('GET /api/mensagens/diaria rejects filter injection attempts', async () => {
        const response = await request(app)
            .get('/api/mensagens/diaria')
            .query({ tipo_vicio: 'geral,ativa.eq.false' })
            .set('Authorization', `Bearer ${token()}`);

        expect(response.statusCode).toBe(400);
    });
});
