const { createHash } = require('node:crypto');
const { createPasswordRecovery } = require('../../password-recovery');

// Only mounted by the local synthetic browser fixture. Mail stays in process memory.
module.exports = function mountAccountLifecycle(app, database, secret, events) {
    const requests = new Map(), deliveries = new Map();
    const hash = value => createHash('sha256').update(value).digest('hex');
    let mode = 'normal';
    const rpc = database.client.rpc;
    database.client.rpc = async (name, args) => {
        if (name === 'request_password_recovery') {
            const user = database.tables.usuarios.find(row => row.email === args.p_email);
            requests.set(args.p_request_id, { ...args, userId: user?.id, consumed: false, attempts: 0 });
            return { data: { status: user ? 'created' : 'absent', email: args.p_email }, error: null };
        }
        if (name === 'confirm_password_recovery') {
            if (mode === 'unavailable') return { error: { code: 'SYNTHETIC_UNAVAILABLE' } };
            if (mode === 'limited') return { data: { status: 'limited' }, error: null };
            const row = requests.get(args.p_request_id);
            if (!row || row.consumed || !row.userId || row.p_email_key !== args.p_email_key || mode === 'expired' || ++row.attempts > 5 || row.p_code_hash !== args.p_code_hash) {
                return { data: { status: 'invalid' }, error: null };
            }
            row.consumed = true;
            database.tables.usuarios.find(user => user.id === row.userId).senha_hash = args.p_password_hash;
            database.tables.app_sessions.filter(session => session.usuario_id === row.userId).forEach(session => { session.revoked_at = new Date().toISOString(); });
            return { data: { status: 'changed' }, error: null };
        }
        if (name === 'delete_revive_account') {
            if (mode === 'delete-failure') return { error: { code: 'SYNTHETIC_DELETE_FAILURE' } };
            for (const values of Object.values(events)) for (const [id, value] of values) if (value.usuario_id === args.p_usuario_id) values.delete(id);
        }
        return rpc(name, args);
    };
    const recovery = enabled => createPasswordRecovery({ supabase: database.client, jwtSecret: secret,
        enabled, responseFloorMs: 0, observe: () => {}, bcrypt: { hash: async value => hash(value) },
        email: { get configured() { return mode !== 'smtp'; }, send: async message => { deliveries.set(message.requestId, message.code); } }
    });
    const active = recovery(true), disabled = recovery(false);
    app.use('/api/v2/auth/password-recovery', (req, res, next) => (mode === 'disabled' ? disabled : active)(req, res, next));
    app.post('/__test/account-mode', (req, res) => { mode = req.body.mode; res.sendStatus(204); });
    app.post('/__test/recovery-delivery', (req, res) => res.json({ code: deliveries.get(req.body.requestId) || null }));
    return { compare: async (password, stored) => stored === 'synthetic' ? password === 'Synthetic!1' : hash(password) === stored,
        hash: async value => hash(value) };
};
