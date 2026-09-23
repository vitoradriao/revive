const crypto = require('crypto');
const express = require('express');
const jwt = require('jsonwebtoken');

const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MS_PER_DAY = 86_400_000;

const clean = value => value == null ? value : String(value).trim();
const tokenHash = token => crypto.createHash('sha256').update(token).digest('hex');
const stableStringify = value => {
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
    if (value && typeof value === 'object') {
        return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
};
const requestHashes = req => {
    const prefix = `${req.method}:${req.path}:`;
    return {
        stable: crypto.createHash('sha256').update(prefix + stableStringify(req.body || {})).digest('hex'),
        legacy: crypto.createHash('sha256').update(prefix + JSON.stringify(req.body || {})).digest('hex'),
    };
};

function formatDuration(totalDays) {
    const years = Math.floor(totalDays / 365);
    const months = Math.floor((totalDays % 365) / 30);
    const days = totalDays % 30;
    const parts = [];
    if (years) parts.push(`${years} ${years === 1 ? 'ano' : 'anos'}`);
    if (months) parts.push(`${months} ${months === 1 ? 'mes' : 'meses'}`);
    if (days || parts.length === 0) parts.push(`${days} ${days === 1 ? 'dia' : 'dias'}`);
    return parts.join(', ');
}

function apiError(res, status, codigo, mensagem, campos) {
    const payload = { codigo, mensagem, request_id: res.locals.requestId };
    if (campos) payload.campos = campos;
    return res.status(status).json(payload);
}

function calculateStats(addiction) {
    const baseDate = addiction.data_ultima_recaida || addiction.data_inicio;
    const abstinenceDays = Math.max(0, Math.floor((Date.now() - new Date(baseDate).getTime()) / MS_PER_DAY));
    const savedAmount = abstinenceDays * Number(addiction.valor_economizado_por_dia || 0);
    return {
        ...addiction,
        dias_abstinencia: abstinenceDays,
        valor_economizado: savedAmount.toFixed(2),
        tempo_formatado: formatDuration(abstinenceDays)
    };
}

function createMobileApi({ supabase, bcrypt, jwtSecret }) {
    if (!jwtSecret) throw new Error('JWT_SECRET e obrigatorio para a API mobile');
    const router = express.Router();

    router.use((req, res, next) => {
        const requestId = clean(req.get('X-Request-Id')) || crypto.randomUUID();
        res.locals.requestId = requestId;
        res.set('X-Request-Id', requestId);
        next();
    });

    const authenticate = async (req, res, next) => {
        const [scheme, token] = (req.get('Authorization') || '').split(' ');
        if (scheme !== 'Bearer' || !token) return apiError(res, 401, 'TOKEN_AUSENTE', 'Sessao nao fornecida.');
        let decoded;
        try {
            decoded = jwt.verify(token, jwtSecret);
            if (!decoded.id || !decoded.sid || decoded.token_type !== 'access') throw new Error('invalid token type');
        } catch {
            return apiError(res, 401, 'TOKEN_INVALIDO', 'Sessao expirada ou invalida.');
        }
        let result;
        try {
            result = await supabase.from('app_sessions').select('id').eq('id', decoded.sid)
                .eq('usuario_id', decoded.id).is('revoked_at', null).gt('expires_at', new Date().toISOString())
                .maybeSingle();
        } catch {
            return apiError(res, 503, 'SESSAO_INDISPONIVEL', 'Nao foi possivel validar a sessao.');
        }
        if (result.error) return apiError(res, 503, 'SESSAO_INDISPONIVEL', 'Nao foi possivel validar a sessao.');
        if (!result.data) return apiError(res, 401, 'SESSAO_REVOGADA', 'Sessao encerrada. Entre novamente.');
        req.usuarioId = decoded.id;
        req.sessionId = decoded.sid;
        return next();
    };

    const issueAccessToken = (usuario, sessionId) => jwt.sign(
        { id: usuario.id, email: usuario.email, sid: sessionId, token_type: 'access' },
        jwtSecret,
        { expiresIn: ACCESS_TOKEN_TTL_SECONDS }
    );

    const createSession = async (usuario, req, familyId = crypto.randomUUID(), id = crypto.randomUUID()) => {
        const refreshToken = crypto.randomBytes(48).toString('base64url');
        const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS).toISOString();
        const { error } = await supabase.from('app_sessions').insert([{
            id,
            usuario_id: usuario.id,
            refresh_token_hash: tokenHash(refreshToken),
            family_id: familyId,
            expires_at: expiresAt,
            user_agent: clean(req.get('User-Agent'))?.slice(0, 500) || null
        }]);
        if (error) throw error;
        return {
            access_token: issueAccessToken(usuario, id),
            refresh_token: refreshToken,
            expires_in: ACCESS_TOKEN_TTL_SECONDS,
            usuario: { id: usuario.id, nome: usuario.nome, email: usuario.email },
            sessionId: id,
            familyId
        };
    };

    const respondSession = (res, session, status = 200) => {
        const { sessionId, familyId, ...publicSession } = session;
        return res.status(status).json(publicSession);
    };

    const validateCredentials = (nome, email, senha) => {
        const campos = {};
        if (nome !== undefined && (!nome || nome.length > 120)) campos.nome = 'Informe um nome valido com ate 120 caracteres.';
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) campos.email = 'Informe um email valido.';
        if (!senha || senha.length < 6 || !/[A-Z]/.test(senha) || !/[!@#$%^&*(),.?":{}|<>]/.test(senha)) {
            campos.senha = 'Use ao menos 6 caracteres, uma maiuscula e um caractere especial.';
        }
        return campos;
    };

    router.post('/auth/cadastro', async (req, res) => {
        try {
            const nome = clean(req.body.nome);
            const email = clean(req.body.email)?.toLowerCase();
            const senha = req.body.senha;
            const campos = validateCredentials(nome, email, senha);
            if (Object.keys(campos).length) return apiError(res, 422, 'DADOS_INVALIDOS', 'Revise os campos informados.', campos);

            const { data: existing, error: lookupError } = await supabase.from('usuarios').select('id').eq('email', email).maybeSingle();
            if (lookupError) throw lookupError;
            if (existing) return apiError(res, 409, 'EMAIL_EM_USO', 'Este email ja esta cadastrado.');

            const senhaHash = await bcrypt.hash(senha, 10);
            const { data: usuario, error } = await supabase
                .from('usuarios').insert([{ nome, email, senha_hash: senhaHash }])
                .select('id, nome, email').single();
            if (error) throw error;
            return respondSession(res, await createSession(usuario, req), 201);
        } catch (error) {
            console.error('mobile cadastro failed', { code: error?.code, message: error?.message });
            return apiError(res, 500, 'ERRO_INTERNO', 'Nao foi possivel criar a conta.');
        }
    });

    router.post('/auth/login', async (req, res) => {
        try {
            const email = clean(req.body.email)?.toLowerCase();
            const senha = req.body.senha;
            if (!email || !senha) return apiError(res, 422, 'DADOS_INVALIDOS', 'Email e senha sao obrigatorios.');
            const { data: usuario, error } = await supabase.from('usuarios').select('*').eq('email', email).maybeSingle();
            if (error || !usuario || !(await bcrypt.compare(senha, usuario.senha_hash))) {
                return apiError(res, 401, 'CREDENCIAIS_INVALIDAS', 'Email ou senha invalidos.');
            }
            return respondSession(res, await createSession(usuario, req));
        } catch (error) {
            console.error('mobile login failed', { code: error?.code, message: error?.message });
            return apiError(res, 500, 'ERRO_INTERNO', 'Nao foi possivel entrar.');
        }
    });

    router.post('/auth/refresh', async (req, res) => {
        const refreshToken = clean(req.body.refresh_token);
        if (!refreshToken) return apiError(res, 422, 'REFRESH_AUSENTE', 'Refresh token obrigatorio.');
        try {
            const hash = tokenHash(refreshToken);
            const replacementId = crypto.randomUUID();
            const replacementToken = crypto.randomBytes(48).toString('base64url');
            const { data: rotated, error } = await supabase.rpc('rotate_mobile_session', {
                p_refresh_token_hash: hash,
                p_replacement_id: replacementId,
                p_replacement_hash: tokenHash(replacementToken),
                p_user_agent: clean(req.get('User-Agent'))?.slice(0, 500) || null
            });
            if (error) throw error;
            if (rotated?.status !== 'rotated') {
                const codes = { reused: 'REFRESH_REUTILIZADO', expired: 'REFRESH_EXPIRADO', invalid: 'REFRESH_INVALIDO' };
                return apiError(res, 401, codes[rotated?.status] || 'REFRESH_INVALIDO', 'Sessao invalida ou encerrada.');
            }
            const usuario = { id: rotated.usuario_id, nome: rotated.nome, email: rotated.email };
            return respondSession(res, {
                access_token: issueAccessToken(usuario, replacementId),
                refresh_token: replacementToken,
                expires_in: ACCESS_TOKEN_TTL_SECONDS,
                usuario
            });
        } catch (error) {
            console.error('mobile refresh failed', { code: error?.code, message: error?.message });
            return apiError(res, 500, 'ERRO_INTERNO', 'Nao foi possivel renovar a sessao.');
        }
    });

    router.post('/auth/logout', authenticate, async (req, res) => {
        try {
            const { error } = await supabase.from('app_sessions').update({ revoked_at: new Date().toISOString() })
                .eq('id', req.sessionId).eq('usuario_id', req.usuarioId).is('revoked_at', null);
            if (error) throw error;
            return res.status(204).send();
        } catch (error) {
            console.error('mobile logout failed', { code: error?.code, message: error?.message });
            return apiError(res, 500, 'ERRO_INTERNO', 'Nao foi possivel encerrar a sessao.');
        }
    });

    const executeIdempotent = async (req, res, operation, payload) => {
        const key = clean(req.get('Idempotency-Key'));
        if (!key || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key)) {
            return apiError(res, 422, 'IDEMPOTENCY_KEY_INVALIDA', 'Idempotency-Key UUID e obrigatoria.');
        }
        const hashes = requestHashes(req);
        const { data, error } = await supabase.rpc('execute_mobile_mutation', {
            p_usuario_id: req.usuarioId,
            p_idempotency_key: key,
            p_request_hash: hashes.stable,
            p_legacy_request_hash: hashes.legacy,
            p_operation: operation,
            p_payload: payload,
            p_request_id: res.locals.requestId,
        });
        if (error) throw error;
        const result = Array.isArray(data) ? data[0] : data;
        if (!result || !Number.isInteger(result.status_code) || !result.response_body) throw new Error('Invalid idempotent mutation response');
        return res.status(result.status_code).json(result.response_body);
    };

    router.get('/bootstrap', authenticate, async (req, res) => {
        try {
            const [userResult, addictionsResult, recordsResult, relapsesResult, goalsResult, messagesResult] = await Promise.all([
                supabase.from('usuarios').select('id, nome, email').eq('id', req.usuarioId).single(),
                supabase.from('vicios').select('*').eq('usuario_id', req.usuarioId).order('data_criacao', { ascending: false }),
                supabase.from('registros_diarios').select('*, vicios!inner(usuario_id)').eq('vicios.usuario_id', req.usuarioId).order('data_registro', { ascending: false }),
                supabase.from('historico_recaidas').select('*, vicios!inner(usuario_id)').eq('vicios.usuario_id', req.usuarioId).order('data_recaida', { ascending: false }),
                supabase.from('metas').select('*, vicios(nome_vicio)').eq('usuario_id', req.usuarioId).order('data_criacao', { ascending: false }),
                supabase.from('mensagens_motivacionais').select('id, mensagem, autor, tipo_vicio').eq('ativa', true).limit(50)
            ]);
            const failed = [userResult, addictionsResult, recordsResult, relapsesResult, goalsResult, messagesResult].find(result => result.error);
            if (failed) throw failed.error;
            if (!userResult.data) return apiError(res, 404, 'USUARIO_NAO_ENCONTRADO', 'Usuario nao encontrado.');
            const messages = messagesResult.data || [];
            return res.json({
                server_time: new Date().toISOString(),
                usuario: userResult.data,
                vicios: (addictionsResult.data || []).map(calculateStats),
                registros: recordsResult.data || [],
                recaidas: relapsesResult.data || [],
                metas: goalsResult.data || [],
                mensagem: messages.length ? messages[Math.floor(Math.random() * messages.length)] : null
            });
        } catch (error) {
            console.error('mobile bootstrap failed', { code: error?.code, message: error?.message });
            return apiError(res, 500, 'ERRO_INTERNO', 'Nao foi possivel carregar seus dados.');
        }
    });

    router.delete('/account', authenticate, async (req, res) => {
        try {
            const { error } = await supabase.rpc('delete_revive_account', { p_usuario_id: req.usuarioId });
            if (error) throw error;
            return res.status(204).send();
        } catch (error) {
            console.error('mobile account deletion failed', { code: error?.code, message: error?.message });
            return apiError(res, 500, 'ERRO_INTERNO', 'Nao foi possivel excluir a conta.');
        }
    });

    router.post('/devices/push-token', authenticate, async (req, res) => {
        try {
            const pushToken = clean(req.body.expo_push_token);
            const platform = clean(req.body.platform);
            if (!/^Expo(?:nent)?PushToken\[[^\]]+\]$/.test(pushToken || '') || !['android', 'ios'].includes(platform)) {
                return apiError(res, 422, 'PUSH_TOKEN_INVALIDO', 'Token de dispositivo invalido.');
            }
            const now = new Date().toISOString();
            const { error } = await supabase.from('device_push_tokens').upsert([{
                usuario_id: req.usuarioId,
                expo_push_token: pushToken,
                platform,
                enabled: true,
                revoked_at: null,
                updated_at: now
            }], { onConflict: 'expo_push_token' });
            if (error) throw error;
            return res.status(204).send();
        } catch (error) {
            console.error('mobile push token registration failed', { code: error?.code, message: error?.message });
            return apiError(res, 500, 'ERRO_INTERNO', 'Nao foi possivel registrar o dispositivo.');
        }
    });

    router.delete('/devices/push-token', authenticate, async (req, res) => {
        try {
            const pushToken = clean(req.body.expo_push_token);
            if (pushToken) {
                const { error } = await supabase.from('device_push_tokens')
                    .update({ enabled: false, revoked_at: new Date().toISOString() })
                    .eq('usuario_id', req.usuarioId).eq('expo_push_token', pushToken);
                if (error) throw error;
            }
            return res.status(204).send();
        } catch (error) {
            console.error('mobile push token removal failed', { code: error?.code, message: error?.message });
            return apiError(res, 500, 'ERRO_INTERNO', 'Nao foi possivel remover o dispositivo.');
        }
    });

    router.post('/registros', authenticate, async (req, res) => {
        try {
            const payload = { ...req.body, data_registro: clean(req.body.data_registro) || new Date().toISOString().slice(0, 10) };
            return await executeIdempotent(req, res, 'record.create', payload);
        } catch (error) {
            console.error('mobile record failed', { code: error?.code, message: error?.message });
            return apiError(res, 500, 'ERRO_INTERNO', 'Nao foi possivel criar o registro.');
        }
    });

    router.post('/vicios/:id/recaida', authenticate, async (req, res) => {
        try {
            const payload = { ...req.body, addictionId: req.params.id, occurred_at: clean(req.body.occurred_at) || new Date().toISOString() };
            return await executeIdempotent(req, res, 'relapse.create', payload);
        } catch (error) {
            console.error('mobile relapse failed', { code: error?.code, message: error?.message });
            return apiError(res, 500, 'ERRO_INTERNO', 'Nao foi possivel registrar a recaida.');
        }
    });

    router.post('/metas', authenticate, async (req, res) => {
        try {
            return await executeIdempotent(req, res, 'goal.create', req.body);
        } catch (error) {
            console.error('mobile goal failed', { code: error?.code, message: error?.message });
            return apiError(res, 500, 'ERRO_INTERNO', 'Nao foi possivel criar a meta.');
        }
    });

    router.patch('/metas/:id', authenticate, async (req, res) => {
        try {
            return await executeIdempotent(req, res, 'goal.complete', { ...req.body, goalId: req.params.id });
        } catch (error) {
            console.error('mobile goal update failed', { code: error?.code, message: error?.message });
            return apiError(res, 500, 'ERRO_INTERNO', 'Nao foi possivel atualizar a meta.');
        }
    });

    return router;
}

module.exports = { createMobileApi, ACCESS_TOKEN_TTL_SECONDS, tokenHash };
