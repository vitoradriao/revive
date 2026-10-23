function fakeSupabase(initial) {
    const tables = structuredClone(initial);
    class Query {
        constructor(table) { this.table = table; this.filters = []; this.mode = 'select'; this.payload = null; }
        select(columns) { this.columns = columns; return this; }
        eq(field, value) { this.filters.push(row => row[field] === value); return this; }
        is(field, value) { this.filters.push(row => row[field] === value); return this; }
        gt(field, value) { this.filters.push(row => row[field] > value); return this; }
        insert(rows) { this.mode = 'insert'; this.payload = rows; return this; }
        update(values) { this.mode = 'update'; this.payload = values; return this; }
        delete() { this.mode = 'delete'; return this; }
        matches(row) { return this.filters.every(filter => filter(row)); }
        execute() {
            const rows = tables[this.table];
            if (!rows) return { data: null, error: new Error(`unknown table ${this.table}`) };
            if (this.mode === 'insert') {
                const inserted = this.payload.map(row => this.table === 'app_sessions'
                    ? { revoked_at: null, replaced_by: null, ...row }
                    : { ...row });
                rows.push(...inserted);
                return { data: inserted, error: null };
            }
            const matched = rows.filter(row => this.matches(row));
            if (this.mode === 'update') {
                matched.forEach(row => Object.assign(row, this.payload));
                return { data: matched, error: null };
            }
            if (this.mode === 'delete') {
                tables[this.table] = rows.filter(row => !this.matches(row));
                return { data: matched, error: null };
            }
            return { data: matched, error: null };
        }
        async maybeSingle() {
            if (this.table === 'usuarios' && this.columns === 'credential_version') {
                if (state.credentialLookupError) return { data: null, error: { code: state.credentialLookupError } };
                if (state.missingCredentialColumn) return { data: null, error: { code: '42703' } };
            }
            if (this.table === 'app_sessions' && state.failSessionLookup) return { data: null, error: new Error('database unavailable') };
            const result = this.execute(); return { ...result, data: result.data?.[0] || null };
        }
        async single() { const result = this.execute(); return { ...result, data: result.data?.[0] || null }; }
        then(resolve, reject) { return Promise.resolve(this.execute()).then(resolve, reject); }
    }
    const state = { failSessionLookup: false, createError: null, missingCredentialColumn: false, credentialLookupError: null };
    const client = {
        from: table => new Query(table),
        rpc: async (name, args) => {
            if (name === 'delete_revive_account') {
                if (state.failAccountDelete) return { data: null, error: { code: 'SYNTHETIC_DELETE_FAILURE' } };
                const id = args.p_usuario_id;
                tables.usuarios = tables.usuarios.filter(row => row.id !== id);
                for (const name of ['app_sessions', 'vicios']) if (tables[name]) tables[name] = tables[name].filter(row => row.usuario_id !== id);
                return { data: null, error: null };
            }
            if (name === 'create_mobile_session') {
                if (state.changeHashOnCreate) tables.usuarios[0].senha_hash = 'changed-hash';
                if (state.createError) return { data: null, error: { code: state.createError } };
                const usuario = tables.usuarios.find(row => row.id === args.p_usuario_id);
                if (!usuario || usuario.senha_hash !== args.p_expected_hash) return { data: { status: 'invalid' }, error: null };
                tables.app_sessions.push({ id: args.p_id, usuario_id: usuario.id,
                    refresh_token_hash: args.p_refresh_hash, family_id: args.p_family_id,
                    expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
                    user_agent: args.p_user_agent, revoked_at: null, replaced_by: null });
                return { data: { status: 'created', credential_version: 0 }, error: null };
            }
            if (name === 'revoke_mobile_session_family') {
                if (state.failSessionLookup) return { data: null, error: new Error('database unavailable') };
                const source = tables.app_sessions.find(row => row.refresh_token_hash === args.p_refresh_token_hash);
                if (source) tables.app_sessions.filter(row => row.family_id === source.family_id && row.usuario_id === source.usuario_id)
                    .forEach(row => { row.revoked_at = new Date().toISOString(); });
                return { data: { status: 'revoked' }, error: null };
            }
            if (name !== 'rotate_mobile_session') return { data: null, error: new Error(`unknown function ${name}`) };
            const current = tables.app_sessions.find(row => row.refresh_token_hash === args.p_refresh_token_hash);
            if (!current) return { data: { status: 'invalid' }, error: null };
            if (current.revoked_at) {
                if (current.replaced_by) {
                    tables.app_sessions.filter(row => row.family_id === current.family_id && !row.revoked_at)
                        .forEach(row => { row.revoked_at = new Date().toISOString(); });
                    return { data: { status: 'reused' }, error: null };
                }
                return { data: { status: 'invalid' }, error: null };
            }
            if (new Date(current.expires_at).getTime() <= Date.now()) {
                current.revoked_at = new Date().toISOString();
                return { data: { status: 'expired' }, error: null };
            }
            const usuario = tables.usuarios.find(row => row.id === current.usuario_id);
            if (!usuario) return { data: { status: 'invalid' }, error: null };
            tables.app_sessions.push({
                id: args.p_replacement_id, usuario_id: current.usuario_id,
                refresh_token_hash: args.p_replacement_hash, family_id: current.family_id,
                expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
                user_agent: args.p_user_agent, revoked_at: null, replaced_by: null,
            });
            current.revoked_at = new Date().toISOString();
            current.replaced_by = args.p_replacement_id;
            return { data: { status: 'rotated', usuario_id: usuario.id, nome: usuario.nome, email: usuario.email }, error: null };
        },
    };
    return { tables, client, state };
}


module.exports = { fakeSupabase };
