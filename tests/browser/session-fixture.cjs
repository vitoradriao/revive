const express = require('express');
const path = require('node:path');
const fs = require('node:fs');
const { randomUUID } = require('node:crypto');
const { createMobileApi } = require('../../mobile-api');
const { createCredentialAuth } = require('../../credential-auth');
const { fakeSupabase } = require('../helpers/session-database.cjs');
const app = express();
app.use(express.json());
app.use('/api', (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
const database = fakeSupabase({ usuarios: [
    { id: '00000000-0000-4000-8000-000000000001', nome: 'Conta A sintética', email: 'a@example.invalid', senha_hash: 'synthetic', credential_version: 0 },
    { id: '00000000-0000-4000-8000-000000000002', nome: 'Conta B sintética', email: 'b@example.invalid', senha_hash: 'synthetic', credential_version: 0 }
], app_sessions: [] });
const secret = 'synthetic-browser-session-key-not-production';
const counts = { refresh: 0, login: 0, writes: 0, replays: 0 };
const events = { registros: new Map(), vontades: new Map(), recaidas: new Map(), metas: new Map() };
const receipts = new Map();
let dropNextResponse = false;
const habits = database.tables.usuarios.map((user, index) => ({
    id: '10000000-0000-4000-8000-00000000000' + (index + 1), usuario_id: user.id,
    nome_vicio: 'Hábito sintético', data_inicio: '2026-10-01T00:00:00.000Z', ativo: true, revision: 1
}));
database.tables.vicios = habits;
const originalRpc = database.client.rpc;
database.client.rpc = async (name, args) => {
    if (!['execute_mobile_mutation', 'execute_diary_record_update', 'execute_mobile_urge_mutation'].includes(name)) return originalRpc(name, args);
    const key = args.p_usuario_id + ':' + args.p_idempotency_key;
    const prior = receipts.get(key);
    if (prior) {
        counts.replays++;
        return { data: prior.hash === args.p_request_hash ? prior.result : { status_code: 409, response_body: { codigo: 'IDEMPOTENCY_CONFLITO' } }, error: null };
    }
    const p = args.p_payload, userId = args.p_usuario_id, type = args.p_operation;
    const problem = (status_code, codigo) => ({ status_code, response_body: { codigo, mensagem: 'Erro sintético de teste.' } });
    let result;
    const habit = habits.find(item => item.id === (p.vicio_id || p.addictionId) && item.usuario_id === userId);
    const base = { id: randomUUID(), usuario_id: userId, vicio_id: habit?.id };
    if (type === 'record.update') {
        const record = events.registros.get(p.recordId);
        if (!record || record.usuario_id !== userId) result = problem(404, 'REGISTRO_NAO_ENCONTRADO');
        else if (record.revision !== p.expected_version) result = problem(409, 'REVISAO_CONFLITO');
        else {
            const { recordId: _id, expected_version: _version, ...fields } = p;
            const updated = { ...record, ...fields, revision: record.revision + 1 };
            events.registros.set(updated.id, updated); result = { status_code: 200, response_body: { registro: updated } }; counts.writes++;
        }
    } else if (type === 'goal.complete') {
        const goal = events.metas.get(p.goalId);
        if (!goal || goal.usuario_id !== userId) result = problem(404, 'META_NAO_ENCONTRADA');
        else { const updated = { ...goal, concluida: true }; events.metas.set(goal.id, updated); result = { status_code: 200, response_body: { meta: updated } }; counts.writes++; }
    } else if (!habit && (type !== 'goal.create' || p.vicio_id)) result = problem(404, 'VICIO_NAO_ENCONTRADO');
    else {
        const target = { 'record.create': ['registros', 'registro'], 'urge.create': ['vontades', 'vontade'],
            'relapse.create': ['recaidas', 'recaida'], 'goal.create': ['metas', 'meta'] }[type];
        if (!target) return { data: null, error: new Error('Unsupported synthetic operation') };
        const entity = { ...p, ...base, ...(type === 'record.create' ? { revision: 1 } : {}), ...(type === 'goal.create' ? { concluida: false } : {}) };
        events[target[0]].set(entity.id, entity); counts.writes++;
        result = { status_code: 201, response_body: { [target[1]]: entity } };
    }
    receipts.set(key, { hash: args.p_request_hash, result: structuredClone(result) });
    return { data: structuredClone(result), error: null };
};
const fixtureAuth = createCredentialAuth({ supabase: database.client, jwtSecret: secret });
app.get('/api/v2/bootstrap', fixtureAuth, (req, res) => {
    const user = database.tables.usuarios.find(row => row.id === req.usuarioId);
    res.json({ usuario: { id: user.id, nome: user.nome, email: user.email }, server_time: new Date().toISOString(),
        vicios: habits.filter(item => item.usuario_id === user.id),
        ...Object.fromEntries(Object.entries(events).map(([key, values]) => [key, [...values.values()].filter(item => item.usuario_id === user.id)])), mensagem: null });
});
app.use('/api/v2', (req, res, next) => {
    const json = res.json.bind(res);
    res.json = body => {
        if (dropNextResponse && req.method !== 'GET' && !req.path.startsWith('/web-auth/') && res.statusCode < 300) {
            dropNextResponse = false; res.destroy(); return res;
        }
        return json(body);
    };
    next();
});
app.post('/__test/drop-next-response', (_req, res) => { dropNextResponse = true; res.sendStatus(204); });
app.get('/__test/status', (_req, res) => res.json({
    counts, events: Object.fromEntries(Object.entries(events).map(([key, values]) => [key, values.size])), activeSessions: database.tables.app_sessions.filter(row => !row.revoked_at).length
}));
app.post('/__test/reset', (_req, res) => { database.tables.app_sessions.length = 0; for (const key of Object.keys(counts)) counts[key] = 0; for (const values of Object.values(events)) values.clear(); receipts.clear(); dropNextResponse = false; res.sendStatus(204); });
app.post('/__test/revoke', (_req, res) => {
    database.tables.app_sessions.forEach(row => { row.revoked_at = new Date().toISOString(); });
    res.sendStatus(204);
});
app.use('/api/v2/web-auth', (req, _res, next) => { if (req.path === '/refresh') counts.refresh++; if (req.path === '/login') counts.login++; next(); });
app.use('/api/v2', createMobileApi({
    supabase: database.client, jwtSecret: secret, webSecureCookies: false, webAuthEnabled: true,
    bcrypt: { compare: async password => password === 'Synthetic!1', hash: async () => 'synthetic' }
}));
app.use('/api', createCredentialAuth({ supabase: database.client, jwtSecret: secret }));
app.get('/api/me', (req, res) => {
    const user = database.tables.usuarios.find(row => row.id === req.usuarioId);
    res.json({ usuario: { id: user.id, nome: user.nome, email: user.email } });
});
app.get('/api/vicios', (req, res) => res.json({ vicios: habits.filter(item => item.usuario_id === req.usuarioId) }));
app.get('/api/vicios/:id/registros', (req, res) => res.json({ registros: [...events.registros.values()].filter(item => item.usuario_id === req.usuarioId && item.vicio_id === req.params.id) }));
app.get('/api/metas', (_req, res) => res.json({ metas: [] }));
app.get('/api/recaidas', (_req, res) => res.json({ recaidas: [] }));
app.get('/api/mensagens/diaria', (_req, res) => res.json({ mensagem: { mensagem: 'Conteúdo sintético de teste' } }));
app.get('/api/private-probe', (_req, res) => res.json({ privateMarker: 'synthetic-private-only' }));
const publicBuild = path.resolve(__dirname, '../../revive-painel/dist');
app.get('/sw.js', (_req, res) => {
    const revision = (process.env.REVIVE_BROWSER_SHELL_REVISION || '').replace(/[^a-z0-9-]/gi, '');
    let source = fs.readFileSync(path.join(publicBuild, 'sw.js'), 'utf8');
    if (revision) source = source.replace(/(const CACHE_VERSION = ')([^']+)(';)/, (_match, before, version, after) => before + version + '-' + revision + after);
    res.type('application/javascript').set('Cache-Control', 'no-cache').send(source);
});
app.use(express.static(publicBuild));
app.get('/{*any}', (req, res) => req.path.startsWith('/api/') ? res.sendStatus(404) : res.sendFile(path.join(publicBuild, 'index.html')));
const port = Number(process.env.REVIVE_BROWSER_API_PORT || 3177);
app.listen(port, '127.0.0.1', () => console.log('Synthetic session HTTP API on 127.0.0.1:' + port));
