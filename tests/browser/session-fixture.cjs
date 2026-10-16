const express = require('express');
const { createMobileApi } = require('../../mobile-api');
const { createCredentialAuth } = require('../../credential-auth');
const { fakeSupabase } = require('../helpers/session-database.cjs');
const app = express();
app.use(express.json());
const database = fakeSupabase({ usuarios: [
    { id: '00000000-0000-4000-8000-000000000001', nome: 'Conta A sintética', email: 'a@example.invalid', senha_hash: 'synthetic', credential_version: 0 },
    { id: '00000000-0000-4000-8000-000000000002', nome: 'Conta B sintética', email: 'b@example.invalid', senha_hash: 'synthetic', credential_version: 0 }
], app_sessions: [] });
const secret = 'synthetic-browser-session-key-not-production';
const counts = { refresh: 0, login: 0 };
app.get('/__test/status', (_req, res) => res.json({
    counts, activeSessions: database.tables.app_sessions.filter(row => !row.revoked_at).length
}));
app.post('/__test/reset', (_req, res) => { database.tables.app_sessions.length = 0; counts.refresh = 0; counts.login = 0; res.sendStatus(204); });
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
app.get('/api/vicios', (_req, res) => res.json({ vicios: [] }));
app.get('/api/metas', (_req, res) => res.json({ metas: [] }));
app.get('/api/recaidas', (_req, res) => res.json({ recaidas: [] }));
app.get('/api/mensagens/diaria', (_req, res) => res.json({ mensagem: { mensagem: 'Conteúdo sintético de teste' } }));
const port = Number(process.env.REVIVE_BROWSER_API_PORT || 3177);
app.listen(port, '127.0.0.1', () => console.log('Synthetic session HTTP API on 127.0.0.1:' + port));
