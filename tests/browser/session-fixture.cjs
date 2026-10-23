const express = require('express');
const path = require('node:path');
const fs = require('node:fs');
const { randomUUID } = require('node:crypto');
const { createMobileApi } = require('../../mobile-api');
const { createCredentialAuth } = require('../../credential-auth');
const { fakeSupabase } = require('../helpers/session-database.cjs');
const app = express();
app.use('/api', require('../../habit-edit').privateHabitResponse);
app.use(express.json());
let networkUnavailable = false;
app.post('/__test/network', (req, res) => { networkUnavailable = req.body.offline === true; res.sendStatus(204); });
app.use((req, res, next) => {
    // Keep server state while making the origin unreachable, including public navigation.
    if (networkUnavailable && !req.path.startsWith('/__test/')) { res.destroy(); return; }
    next();
});
app.use('/api', (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
const database = fakeSupabase({ usuarios: [
    { id: '00000000-0000-4000-8000-000000000001', nome: 'Conta A sintética', email: 'a@example.invalid', senha_hash: 'synthetic', credential_version: 0 },
    { id: '00000000-0000-4000-8000-000000000002', nome: 'Conta B sintética', email: 'b@example.invalid', senha_hash: 'synthetic', credential_version: 0 }
], app_sessions: [] });
const secret = 'synthetic-browser-session-key-not-production';
const counts = { refresh: 0, login: 0, writes: 0, replays: 0 };
const events = { registros: new Map(), vontades: new Map(), recaidas: new Map(), metas: new Map() };
const receipts = new Map();
let dropNextResponse = false, dropRecordResponses = false, dropUrgeResponses = false, holdUrgeResponses = false, blockMutations = false;
const habits = database.tables.usuarios.map((user, index) => ({
    id: '10000000-0000-4000-8000-00000000000' + (index + 1), usuario_id: user.id,
    motivo_pessoal: null, nome_vicio: 'Hábito sintético', data_inicio: '2026-10-01T00:00:00.000Z', ativo: true, revision: 1, inicio_editavel: true, valor_economizado_por_dia: 10, valor_economizado: 0
}));
const initialHabits = structuredClone(habits);
let goalTransport = 'normal', failGoalDelete = false, revokeOnGoalWrite = false;
const heldGoalResponses = [];
database.tables.vicios = habits;
// Diary queries exercise the Express DTO and cursor contract over synthetic rows.
const originalFrom = database.client.from;
database.client.from = table => {
    if (table !== 'registros_diarios') return originalFrom(table);
    const filters = [];
    return {
        select() { return this; },
        eq(field, value) { filters.push([field, value]); return this; },
        async maybeSingle() {
            const record = [...events.registros.values()].find(row => filters.every(([field, value]) =>
                (field === 'vicios.usuario_id' ? row.usuario_id : row[field]) === value));
            return { data: record ? { ...structuredClone(record), vicios: { usuario_id: record.usuario_id } } : null, error: null };
        }
    };
};
const originalRpc = database.client.rpc;
database.client.rpc = async (name, args) => {
    if (name === 'list_urge_events') {
        const habit = habits.find(row => row.id === args.p_vicio_id && row.usuario_id === args.p_usuario_id);
        if (!habit) return { data: [{ habit_found: false }], error: null };
        const day = instant => new Intl.DateTimeFormat('en-CA', { timeZone: args.p_timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(instant));
        const all = [...events.vontades.values()].filter(row => row.usuario_id === args.p_usuario_id && row.vicio_id === args.p_vicio_id && day(row.occurred_at) >= args.p_inicio && day(row.occurred_at) <= args.p_fim);
        const rows = all.filter(row => !args.p_cursor_time || row.occurred_at < args.p_cursor_time || row.occurred_at === args.p_cursor_time && row.id < args.p_cursor_id)
            .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at) || b.id.localeCompare(a.id)).slice(0, args.p_limit);
        return { data: rows.length ? rows.map(row => ({ ...structuredClone(row), habit_found: true, total_count: all.length })) : [{ habit_found: true, total_count: all.length }], error: null };
    }
    if (name === 'list_diary_records') {
        const rows = [...events.registros.values()].filter(row => row.usuario_id === args.p_usuario_id &&
            (!args.p_vicio_id || row.vicio_id === args.p_vicio_id) && row.data_registro >= args.p_inicio && row.data_registro <= args.p_fim &&
            (!args.p_cursor_date || row.data_registro < args.p_cursor_date || row.data_registro === args.p_cursor_date && row.id < args.p_cursor_id))
            .sort((a, b) => b.data_registro.localeCompare(a.data_registro) || b.id.localeCompare(a.id)).slice(0, args.p_limit);
        return { data: structuredClone(rows), error: null };
    }
    if (name === 'edit_revive_habit') {
        const habit = habits.find(item => item.id === args.p_vicio_id && item.usuario_id === args.p_usuario_id);
        const result = !habit ? { status: 404, codigo: 'VICIO_NAO_ENCONTRADO' }
            : habit.revision !== args.p_revision ? { status: 409, codigo: 'REVISAO_CONFLITO' }
            : args.p_patch.data_inicio && !habit.inicio_editavel ? { status: 409, codigo: 'INICIO_COM_HISTORICO' } : null;
        if (result) return { data: result, error: null };
        Object.assign(habit, args.p_patch, { revision: habit.revision + 1 });
        counts.writes++;
        return { data: { status: 200, vicio: structuredClone(habit) }, error: null };
    }
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
    if (habit?.ativo === false) {
        const rejection = type === 'urge.create' ? problem(404, 'VICIO_NAO_ENCONTRADO') : problem(409, 'HABITO_ARQUIVADO');
        if (type === 'urge.create') receipts.set(key, { hash: args.p_request_hash, result: structuredClone(rejection) });
        return { data: rejection, error: null };
    }
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
        if (type === 'goal.create') Object.assign(entity, {
            dias_abstinencia_inicio: p.iniciar_hoje ? habit.dias_abstinencia || 0 : 0,
            valor_economizado_inicio: p.iniciar_hoje ? Number(habit.valor_economizado) || 0 : 0,
            data_criacao: new Date().toISOString()
        });
        if (type === 'relapse.create') {
            entity.data_recaida = p.occurred_at; entity.resetar_contador = p.resetarContador;
            if (p.resetarContador) {
                habit.data_ultima_recaida = p.occurred_at;
                habit.dias_abstinencia = 0;
                if (habit.progresso) Object.assign(habit.progresso, { sequencia_atual_dias: 0, economia_sequencia: { valor_estimado: 0, cobertura: 'confirmed' } });
            }
        }
        events[target[0]].set(entity.id, entity); counts.writes++;
        if (habit) habit.inicio_editavel = false;
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
        ...Object.fromEntries(Object.entries(events).filter(([key]) => key !== 'vontades').map(([key, values]) => [key, [...values.values()].filter(item => item.usuario_id === user.id)])), mensagem: null });
});
app.post('/__test/seed-goals', (_req, res) => {
    const progress = require('../fixtures/progress.cjs').progressFixture({ reset: false });
    Object.assign(habits[0], { dias_abstinencia: 32, valor_economizado: 320, progresso: progress.vicios[0].progresso });
    const archived = { ...structuredClone(habits[0]), id: '10000000-0000-4000-8000-000000000003', nome_vicio: 'Hábito arquivado sintético', ativo: false };
    habits.push(archived);
    const goal = { id: '30000000-0000-4000-8000-000000000001', usuario_id: habits[0].usuario_id, vicio_id: archived.id,
        descricao_meta: 'Meta legada arquivada', dias_objetivo: 30, iniciar_hoje: true, dias_abstinencia_inicio: 17,
        valor_economizado_inicio: 170, data_inicio_meta: '2026-01-18', concluida: false };
    events.metas.set(goal.id, goal); res.sendStatus(204);
});
app.post('/__test/goal-transport', (req, res) => {
    goalTransport = req.body.mode || 'normal';
    if (goalTransport === 'normal') for (const held of heldGoalResponses.splice(0)) held.send(held.body);
    res.sendStatus(204);
});
app.post('/__test/revoke-on-goal-write', (_req, res) => { revokeOnGoalWrite = true; res.sendStatus(204); });
app.post('/__test/fail-goal-delete', (req, res) => { failGoalDelete = req.body.enabled === true; res.sendStatus(204); });
app.post('/__test/archive-goal-habit', (req, res) => { habits[0].ativo = req.body.archived !== true; res.sendStatus(204); });
app.post('/__test/seed-urges', (_req, res) => {
    for (let index = 1; index <= 24; index++) {
        const id = '70000000-0000-4000-8000-' + String(index).padStart(12, '0');
        events.vontades.set(id, { id, usuario_id: habits[0].usuario_id, vicio_id: habits[0].id,
            occurred_at: '2026-10-22T15:00:00.000Z', timezone: 'America/Sao_Paulo', intensidade: index % 11,
            gatilhos: ['trigger_future_1'], nota: null, acao_realizada: null, resultado: null });
    }
    res.sendStatus(204);
});
app.post('/__test/hold-urge-responses', (req, res) => { holdUrgeResponses = req.body.enabled === true; res.sendStatus(204); });
app.post('/__test/drop-urge-responses', (req, res) => { dropUrgeResponses = req.body.enabled === true; res.sendStatus(204); });
app.post('/__test/seed-diary', (_req, res) => {
    for (let index = 1; index <= 23; index++) {
        const record = { id: '20000000-0000-4000-8000-' + String(index).padStart(12, '0'), usuario_id: habits[0].usuario_id,
            vicio_id: habits[0].id, data_registro: '2026-10-22', revision: 1, humor: 'bom',
            gatilhos: null, conquistas: null, observacoes: index === 23 ? 'Legado sintético. '.repeat(100) : 'Registro sintético.' };
        events.registros.set(record.id, record);
    }
    res.sendStatus(204);
});
app.post('/__test/reset-block-mutations', (_req, res) => { blockMutations = false; res.sendStatus(204); });
app.post('/__test/block-mutations', (_req, res) => { blockMutations = true; res.sendStatus(204); });
app.use('/api/v2', (req, res, next) => {
    if (revokeOnGoalWrite && req.method === 'PATCH' && req.path.startsWith('/metas/')) {
        revokeOnGoalWrite = false; database.tables.app_sessions.forEach(row => { row.revoked_at = new Date().toISOString(); });
    }
    if (blockMutations && req.method !== 'GET' && req.path !== '/account' && !req.path.startsWith('/web-auth/')) return res.status(503).json({ codigo: 'CONSULTA_INDISPONIVEL' });
    const json = res.json.bind(res);
    res.json = body => {
        if ((req.path === '/metas' || /^\/metas\/[^/]+$/.test(req.path) || req.path.endsWith('/recaida')) && req.method !== 'GET' && res.statusCode < 300) {
            if (goalTransport === 'hold') { heldGoalResponses.push({ send: json, body }); return res; }
            if (goalTransport === 'drop') { res.destroy(); return res; }
        }
        if (holdUrgeResponses && req.method === 'POST' && req.path === '/vontades' && res.statusCode < 300) return res;
        if ((dropNextResponse && req.method !== 'GET' && !req.path.startsWith('/web-auth/') || dropRecordResponses && req.method === 'POST' && req.path === '/registros' || dropUrgeResponses && req.method === 'POST' && req.path === '/vontades') && res.statusCode < 300) {
            dropNextResponse = false; res.destroy(); return res;
        }
        return json(body);
    };
    next();
});
app.post('/__test/drop-record-responses', (req, res) => { dropRecordResponses = req.body.enabled === true; res.sendStatus(204); });
app.post('/__test/drop-next-response', (_req, res) => { dropNextResponse = true; res.sendStatus(204); });
app.get('/__test/status', (_req, res) => res.json({
    goalHabitActive: habits[0].ativo, counts, events: Object.fromEntries(Object.entries(events).map(([key, values]) => [key, values.size])), activeSessions: database.tables.app_sessions.filter(row => !row.revoked_at).length
}));
app.post('/__test/reset', (_req, res) => { networkUnavailable = false; goalTransport = 'normal'; failGoalDelete = false; revokeOnGoalWrite = false; heldGoalResponses.length = 0; database.tables.app_sessions.length = 0; habits.splice(0, habits.length, ...structuredClone(initialHabits)); blockMutations = false; for (const key of Object.keys(counts)) counts[key] = 0; for (const values of Object.values(events)) values.clear(); receipts.clear(); dropNextResponse = false; dropRecordResponses = false; dropUrgeResponses = false; holdUrgeResponses = false; res.sendStatus(204); });
app.post('/__test/revoke', (_req, res) => {
    database.tables.app_sessions.forEach(row => { row.revoked_at = new Date().toISOString(); });
    res.sendStatus(204);
});
app.use('/api/v2/web-auth', (req, _res, next) => { if (req.path === '/refresh') counts.refresh++; if (req.path === '/login') counts.login++; next(); });
const lifecycleBcrypt = require('./account-lifecycle-fixture.cjs')(app, database, secret, events);
app.use('/api/v2', createMobileApi({
    supabase: database.client, jwtSecret: secret, webSecureCookies: false, webAuthEnabled: true,
    bcrypt: lifecycleBcrypt
}));
app.use('/api', createCredentialAuth({ supabase: database.client, jwtSecret: secret }));
app.get('/api/me', (req, res) => {
    const user = database.tables.usuarios.find(row => row.id === req.usuarioId);
    res.json({ usuario: { id: user.id, nome: user.nome, email: user.email } });
});
app.get('/api/vicios', (req, res) => res.json({ vicios: habits.filter(item => item.usuario_id === req.usuarioId) }));
app.get('/api/vicios/:id/registros', (req, res) => res.json({ registros: [...events.registros.values()].filter(item => item.usuario_id === req.usuarioId && item.vicio_id === req.params.id) }));
app.delete('/api/metas/:id', (req, res) => {
    if (failGoalDelete) return res.status(500).json({ codigo: 'DELETE_FAILED', mensagem: 'Falha sintética na exclusão. A meta foi preservada.' });
    const goal = events.metas.get(req.params.id);
    if (!goal || goal.usuario_id !== req.usuarioId) return res.status(404).json({ erro: 'Meta nao encontrada' });
    events.metas.delete(goal.id); res.json({ mensagem: 'Meta excluida com sucesso' });
});
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
app.get('/{*any}', (req, res) => req.path.startsWith('/api/') ? res.sendStatus(404) : res.sendFile(path.join(publicBuild, 'index.html'), { dotfiles: 'allow' }));
const port = Number(process.env.REVIVE_BROWSER_API_PORT || 3177);
app.listen(port, '127.0.0.1', () => console.log('Synthetic session HTTP API on 127.0.0.1:' + port));
