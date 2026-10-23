const crypto = require('crypto');
const { defaultPreferences, validatePreferences } = require('./journey-preferences');
const { createWebAuthTransport } = require('./web-auth-transport');
const { validateRecordFields, parseRecordCursor } = require('./diary-records');
const express = require('express');
const jwt = require('jsonwebtoken');
const { buildProgressSnapshot, observedAccountAwards, observedAwards } = require('./progress-metrics');
const { privateHabitResponse, validateHabitPatch, listEditableHabits, habitEditMessages } = require('./habit-edit');
const { readCredentialVersion } = require('./credential-auth');

const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
const MS_PER_DAY = 86_400_000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LOCAL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

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

function isValidLocalDate(value) {
    if (typeof value !== 'string' || !LOCAL_DATE_PATTERN.test(value)) return false;
    const date = new Date(`${value}T00:00:00.000Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isValidTimezone(value) {
    if (typeof value !== 'string' || value.length < 1 || value.length > 100) return false;
    try {
        new Intl.DateTimeFormat('en', { timeZone: value }).format(0);
        return true;
    } catch {
        return false;
    }
}

function parseUrgeCursor(value) {
    if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,512}$/.test(value)) return undefined;
    try {
        const decoded = Buffer.from(value, 'base64url').toString('utf8');
        const cursor = JSON.parse(decoded);
        const time = new Date(cursor.occurred_at);
        if (Buffer.from(decoded).toString('base64url') !== value
            || !Number.isFinite(time.getTime())
            || time.toISOString() !== cursor.occurred_at
            || !UUID_PATTERN.test(cursor.id)) return undefined;
        return { occurredAt: cursor.occurred_at, id: cursor.id };
    } catch {
        return undefined;
    }
}

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

function createMobileApi({ supabase, bcrypt, jwtSecret, recoveryEnabled = process.env.PASSWORD_RECOVERY_ENABLED === 'true', webSecureCookies = process.env.NODE_ENV === 'production', webAuthEnabled = process.env.WEB_AUTH_ENABLED === 'true' }) {
    if (!jwtSecret) throw new Error('JWT_SECRET e obrigatorio para a API mobile');
    const router = express.Router();
    router.use(privateHabitResponse);
    const webAuth = createWebAuthTransport({ secure: webSecureCookies });

    router.use((req, res, next) => {
        const requestId = clean(req.get('X-Request-Id')) || crypto.randomUUID();
        res.locals.requestId = requestId;
        res.set('X-Request-Id', requestId);
        next();
    });

    router.use('/web-auth', (req, res, next) => {
        res.set('Cache-Control', 'no-store');
        if (!webAuthEnabled) return apiError(res, 503, 'WEB_AUTH_DESABILITADO', 'O acesso web está temporariamente indisponível.');
        return webAuth.guard(req, res, next);
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
        { id: usuario.id, email: usuario.email, sid: sessionId, token_type: 'access', cv: Number(usuario.credential_version || 0) },
        jwtSecret,
        { expiresIn: ACCESS_TOKEN_TTL_SECONDS }
    );

    const createSession = async (usuario, req, expectedHash, familyId = crypto.randomUUID(), id = crypto.randomUUID()) => {
        const refreshToken = crypto.randomBytes(48).toString('base64url');
        let { data, error } = await supabase.rpc('create_mobile_session', {
            p_id: id, p_usuario_id: usuario.id, p_expected_hash: expectedHash,
            p_refresh_hash: tokenHash(refreshToken), p_family_id: familyId,
            p_user_agent: clean(req.get('User-Agent'))?.slice(0, 500) || null,
        });
        if (error?.code === 'PGRST202' && !recoveryEnabled) {
            const version = await readCredentialVersion({ supabase, userId: usuario.id, recoveryEnabled });
            if (version.error) throw version.error;
            // A missing RPC alone is not enough: once the column exists, the
            // account lock in the new function is mandatory even at version zero.
            if (version.data?.legacySchema) {
                const current = await supabase.from('usuarios').select('senha_hash')
                    .eq('id', usuario.id).maybeSingle();
                if (current.error) throw current.error;
                if (current.data?.senha_hash !== expectedHash) return null;
                const inserted = await supabase.from('app_sessions').insert([{
                    id, usuario_id: usuario.id, refresh_token_hash: tokenHash(refreshToken), family_id: familyId,
                    expires_at: new Date(Date.now() + 30 * MS_PER_DAY).toISOString(),
                    user_agent: clean(req.get('User-Agent'))?.slice(0, 500) || null,
                }]);
                error = inserted.error;
                data = { status: 'created', credential_version: 0 };
            }
        }
        if (error) throw error;
        if (data?.status !== 'created') return null;
        return {
            access_token: issueAccessToken({ ...usuario, credential_version: data.credential_version }, id),
            refresh_token: refreshToken,
            expires_in: ACCESS_TOKEN_TTL_SECONDS,
            usuario: { id: usuario.id, nome: usuario.nome, email: usuario.email },
            sessionId: id,
            familyId
        };
    };

    const respondSession = (res, session, status = 200) => {
        res.set('Cache-Control', 'no-store');
        if (res.locals.webAuth) return webAuth.respond(res, session, status);
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

    router.post(['/auth/cadastro', '/web-auth/cadastro'], async (req, res) => {
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
            const session = await createSession(usuario, req, senhaHash);
            if (!session) return apiError(res, 401, 'CREDENCIAIS_INVALIDAS', 'Entre novamente com a senha atual.');
            return respondSession(res, session, 201);
        } catch (error) {
            console.error('session cadastro failed', { code: error?.code });
            return apiError(res, res.locals.webAuth ? 503 : 500, 'ERRO_INTERNO', 'Nao foi possivel criar a conta.');
        }
    });

    router.post(['/auth/login', '/web-auth/login'], async (req, res) => {
        try {
            const email = clean(req.body.email)?.toLowerCase();
            const senha = req.body.senha;
            if (!email || !senha) return apiError(res, 422, 'DADOS_INVALIDOS', 'Email e senha sao obrigatorios.');
            const { data: usuario, error } = await supabase.from('usuarios').select('*').eq('email', email).maybeSingle();
            if (error && res.locals.webAuth) throw error;
            if (error || !usuario || !(await bcrypt.compare(senha, usuario.senha_hash))) {
                return apiError(res, 401, 'CREDENCIAIS_INVALIDAS', 'Email ou senha invalidos.');
            }
            const session = await createSession(usuario, req, usuario.senha_hash);
            if (!session) return apiError(res, 401, 'CREDENCIAIS_INVALIDAS', 'Email ou senha invalidos.');
            return respondSession(res, session);
        } catch (error) {
            console.error('session login failed', { code: error?.code });
            return apiError(res, res.locals.webAuth ? 503 : 500, 'ERRO_INTERNO', 'Nao foi possivel entrar.');
        }
    });

    router.post(['/auth/refresh', '/web-auth/refresh'], async (req, res) => {
        const refreshToken = res.locals.webAuth ? res.locals.webRefreshToken : clean(req.body.refresh_token);
        if (!refreshToken) {
            if (res.locals.webAuth) webAuth.clear(res);
            return apiError(res, res.locals.webAuth ? 401 : 422, 'REFRESH_AUSENTE', res.locals.webAuth ? 'Sessão não fornecida.' : 'Refresh token obrigatorio.');
        }
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
                if (res.locals.webAuth) webAuth.clear(res);
                const codes = { reused: 'REFRESH_REUTILIZADO', expired: 'REFRESH_EXPIRADO', invalid: 'REFRESH_INVALIDO' };
                return apiError(res, 401, codes[rotated?.status] || 'REFRESH_INVALIDO', 'Sessao invalida ou encerrada.');
            }
            const usuario = { id: rotated.usuario_id, nome: rotated.nome, email: rotated.email, credential_version: rotated.credential_version };
            return respondSession(res, {
                access_token: issueAccessToken(usuario, replacementId),
                refresh_token: replacementToken,
                expires_in: ACCESS_TOKEN_TTL_SECONDS,
                usuario
            });
        } catch (error) {
            console.error('session refresh failed', { code: error?.code });
            return apiError(res, res.locals.webAuth ? 503 : 500, 'ERRO_INTERNO', 'Nao foi possivel renovar a sessao.');
        }
    });

    router.post('/web-auth/logout', async (req, res) => {
        try {
            const token = res.locals.webRefreshToken;
            if (token) {
                const { data, error } = await supabase.rpc('revoke_mobile_session_family', { p_refresh_token_hash: tokenHash(token) });
                if (error || data?.status !== 'revoked') throw error || new Error('Invalid revocation response');
            }
            webAuth.clear(res);
            return res.status(204).send();
        } catch {
            return apiError(res, 503, 'SESSAO_INDISPONIVEL', 'Não foi possível encerrar a sessão.');
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

    const executeIdempotent = async (req, res, operation, payload, rpcFunction = 'execute_mobile_mutation') => {
        const key = clean(req.get('Idempotency-Key'));
        if (!key || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key)) {
            return apiError(res, 422, 'IDEMPOTENCY_KEY_INVALIDA', 'Idempotency-Key UUID e obrigatoria.');
        }
        const hashes = requestHashes(req);
        const { data, error } = await supabase.rpc(rpcFunction, {
            p_usuario_id: req.usuarioId,
            p_idempotency_key: key,
            p_request_hash: hashes.stable,
            p_legacy_request_hash: hashes.legacy,
            p_operation: operation,
            p_payload: payload,
            p_request_id: res.locals.requestId,
        });
        if (error?.message === 'HABITO_ARQUIVADO') return apiError(res, 409, 'HABITO_ARQUIVADO', habitEditMessages.HABITO_ARQUIVADO);
        if (error) throw error;
        const result = Array.isArray(data) ? data[0] : data;
        if (!result || !Number.isInteger(result.status_code) || !result.response_body) throw new Error('Invalid idempotent mutation response');
        return res.status(result.status_code).json(result.response_body);
    };

    router.patch('/vicios/:id', authenticate, async (req, res) => {
        if (!UUID_PATTERN.test(req.params.id)) return apiError(res, 404, 'VICIO_NAO_ENCONTRADO', habitEditMessages.VICIO_NAO_ENCONTRADO);
        const { revision, patch, fields } = validateHabitPatch(req.body);
        if (Object.keys(fields).length) return apiError(res, 422, 'DADOS_INVALIDOS', habitEditMessages.DADOS_INVALIDOS, fields);
        try {
            const { data, error } = await supabase.rpc('edit_revive_habit', {
                p_usuario_id: req.usuarioId, p_vicio_id: req.params.id, p_revision: revision, p_patch: patch,
            });
            if (error) throw error;
            if (data?.status === 200 && data.vicio) return res.json({ vicio: data.vicio });
            if ([404, 409, 422].includes(data?.status) && habitEditMessages[data.codigo]) return apiError(res, data.status, data.codigo, habitEditMessages[data.codigo]);
            throw new Error('Invalid habit edit response');
        } catch {
            return apiError(res, 503, 'EDICAO_INDISPONIVEL', 'Não foi possível confirmar a edição. Recarregue o hábito antes de tentar novamente.');
        }
    });

    router.get('/preferences', authenticate, async (req, res) => {
        res.set('Cache-Control', 'no-store');
        try {
            const { data, error } = await supabase.from('journey_preferences')
                .select('primary_habit_id, indicator_order, intro, revision').eq('usuario_id', req.usuarioId).maybeSingle();
            if (error) throw error;
            return res.json({ preferences: data || defaultPreferences() });
        } catch {
            return apiError(res, 503, 'PREFERENCIAS_INDISPONIVEIS', 'Não foi possível consultar as preferências.');
        }
    });
    router.patch('/preferences', authenticate, async (req, res) => {
        res.set('Cache-Control', 'no-store');
        if (!validatePreferences(req.body)) return apiError(res, 422, 'DADOS_INVALIDOS', 'Revise as preferências informadas.');
        const { revision, ...patch } = req.body;
        try {
            const { data, error } = await supabase.rpc('edit_journey_preferences', {
                p_usuario_id: req.usuarioId, p_revision: revision, p_patch: patch,
            });
            if (error) throw error;
            if (data?.status === 200 && data.preferences) return res.json({ preferences: data.preferences });
            if (data?.status === 409) return apiError(res, 409, 'REVISAO_CONFLITO', 'As preferências mudaram. Consulte a versão atual e revise suas escolhas locais.');
            if (data?.status === 422) return apiError(res, 422, 'DADOS_INVALIDOS', 'Revise as preferências; o principal deve ser um hábito ativo desta conta.');
            throw new Error('Invalid preferences response');
        } catch {
            return apiError(res, 503, 'PREFERENCIAS_INDISPONIVEIS', 'Não foi possível confirmar a alteração. Consulte a versão atual antes de tentar novamente.');
        }
    });

    router.get('/bootstrap', authenticate, async (req, res) => {
        try {
            const [userResult, addictionsResult, recordsResult, relapsesResult, goalsResult, messagesResult,
                periodsResult, economyResult, awardsResult] = await Promise.all([
                supabase.from('usuarios').select('id, nome, email').eq('id', req.usuarioId).single(),
                listEditableHabits(supabase, req.usuarioId),
                supabase.from('registros_diarios').select('*, vicios!inner(usuario_id)').eq('vicios.usuario_id', req.usuarioId).order('data_registro', { ascending: false }),
                supabase.from('historico_recaidas').select('*, vicios!inner(usuario_id)').eq('vicios.usuario_id', req.usuarioId).order('data_recaida', { ascending: false }),
                supabase.from('metas').select('*, vicios(nome_vicio)').eq('usuario_id', req.usuarioId).order('data_criacao', { ascending: false }),
                supabase.from('mensagens_motivacionais').select('id, mensagem, autor, tipo_vicio').eq('ativa', true).limit(50),
                supabase.from('progresso_periodos').select('id, vicio_id, started_at, ended_at, source, cobertura, vicios!inner(usuario_id)').eq('vicios.usuario_id', req.usuarioId),
                supabase.from('segmentos_economia').select('id, vicio_id, effective_from, effective_to, valor_diario, cobertura, origem, vicios!inner(usuario_id)').eq('vicios.usuario_id', req.usuarioId),
                supabase.from('conquistas_permanentes').select('id, usuario_id, vicio_id, categoria, valor_alvo, awarded_at, origem, cobertura').eq('usuario_id', req.usuarioId)
            ]);
            const failed = [userResult, addictionsResult, recordsResult, relapsesResult, goalsResult,
                messagesResult, periodsResult, economyResult, awardsResult].find(result => result.error);
            if (failed) throw failed.error;
            if (!userResult.data) return apiError(res, 404, 'USUARIO_NAO_ENCONTRADO', 'Usuario nao encontrado.');
            const messages = messagesResult.data || [];
            const periods = (periodsResult.data || []).map(({ vicios, ...period }) => period);
            const economySegments = (economyResult.data || []).map(({ vicios, ...segment }) => segment);
            const recordRows = recordsResult.data || [];
            const now = new Date();
            const addictions = addictionsResult.data || [];
            const observed = addictions.flatMap(addiction => observedAwards({
                usuarioId: req.usuarioId,
                vicioId: addiction.id,
                periods: periods.filter(period => period.vicio_id === addiction.id),
                economySegments: economySegments.filter(segment => segment.vicio_id === addiction.id),
                now,
            }));
            observed.push(...observedAccountAwards({
                usuarioId: req.usuarioId,
                periods,
                economySegments,
                records: recordRows,
                goals: goalsResult.data || [],
                now,
            }));
            let newlyObservedAwards = [];
            if (observed.length) {
                const persisted = await supabase.from('conquistas_permanentes')
                    .upsert(observed, {
                        onConflict: 'usuario_id,vicio_id,categoria,valor_alvo',
                        ignoreDuplicates: true,
                    })
                    .select('id, usuario_id, vicio_id, categoria, valor_alvo, awarded_at, origem, cobertura');
                if (persisted.error) throw persisted.error;
                newlyObservedAwards = persisted.data || [];
            }
            const awards = [...(awardsResult.data || []), ...newlyObservedAwards];
            const enrichedAddictions = addictions.map(addiction => {
                const progresso = buildProgressSnapshot({
                    periods: periods.filter(period => period.vicio_id === addiction.id),
                    economySegments: economySegments.filter(segment => segment.vicio_id === addiction.id),
                    records: recordRows.filter(record => record.vicio_id === addiction.id),
                    awards: awards.filter(award => award.vicio_id === addiction.id),
                    now,
                });
                return { ...calculateStats(addiction), progresso,
                    inicio_editavel: Boolean(addiction.inicio_editavel) && !awards.some(award => award.vicio_id === addiction.id),
                    valor_economizado: progresso.economia_sequencia.valor_estimado == null ? null : progresso.economia_sequencia.valor_estimado.toFixed(2),
                };
            });
            return res.json({
                server_time: now.toISOString(),
                usuario: userResult.data,
                vicios: enrichedAddictions,
                registros: recordRows,
                recaidas: relapsesResult.data || [],
                metas: goalsResult.data || [],
                conquistas: awards,
                mensagem: messages.length ? messages[Math.floor(Math.random() * messages.length)] : null
            });
        } catch (error) {
            console.error('mobile bootstrap failed', { code: error?.code });
            return apiError(res, 500, 'ERRO_INTERNO', 'Nao foi possivel carregar seus dados.');
        }
    });

    router.delete('/account', authenticate, async (req, res) => {
        try {
            const { error } = await supabase.rpc('delete_revive_account', { p_usuario_id: req.usuarioId });
            if (error) throw error;
            webAuth.clear(res);
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

    router.get('/registros', authenticate, async (req, res) => {
        const { inicio, fim, vicio_id, cursor } = req.query;
        const limit = req.query.limit === undefined ? 50 : Number(req.query.limit);
        const after = cursor === undefined ? null : parseRecordCursor(cursor);
        if (!isValidLocalDate(inicio) || !isValidLocalDate(fim) || fim < inicio
            || (new Date(fim) - new Date(inicio)) / MS_PER_DAY > 3660
            || (vicio_id !== undefined && (typeof vicio_id !== 'string' || !UUID_PATTERN.test(vicio_id)))
            || !Number.isInteger(limit) || limit < 1 || limit > 100 || (cursor !== undefined && !after)) {
            return apiError(res, 422, 'DADOS_INVALIDOS', 'Informe hábito, intervalo e cursor válidos.');
        }
        try {
            const { data, error } = await supabase.rpc('list_diary_records', {
                p_usuario_id: req.usuarioId, p_vicio_id: vicio_id || null, p_inicio: inicio, p_fim: fim,
                p_limit: limit + 1, p_cursor_date: after?.date || null, p_cursor_id: after?.id || null,
            });
            if (error) throw error;
            const rows = data || [];
            const records = rows.slice(0, limit);
            const last = records.at(-1);
            return res.json({ registros: records, next_cursor: rows.length > limit
                ? Buffer.from(JSON.stringify({ date: last.data_registro, id: last.id })).toString('base64url') : null });
        } catch { return apiError(res, 503, 'CONSULTA_INDISPONIVEL', 'Não foi possível consultar o diário.'); }
    });

    router.get('/registros/:id', authenticate, async (req, res) => {
        if (!UUID_PATTERN.test(req.params.id)) return apiError(res, 404, 'REGISTRO_NAO_ENCONTRADO', 'Registro não encontrado.');
        try {
            const { data, error } = await supabase.from('registros_diarios').select('*, vicios!inner(usuario_id)')
                .eq('id', req.params.id).eq('vicios.usuario_id', req.usuarioId).maybeSingle();
            if (error) throw error;
            if (!data) return apiError(res, 404, 'REGISTRO_NAO_ENCONTRADO', 'Registro não encontrado.');
            const { vicios: _habit, ...registro } = data;
            return res.json({ registro });
        } catch { return apiError(res, 503, 'CONSULTA_INDISPONIVEL', 'Não foi possível consultar o registro.'); }
    });

    router.patch('/registros/:id', authenticate, async (req, res) => {
        if (!UUID_PATTERN.test(req.params.id)) return apiError(res, 404, 'REGISTRO_NAO_ENCONTRADO', 'Registro não encontrado.');
        if (!validateRecordFields(req.body, true)) return apiError(res, 422, 'DADOS_INVALIDOS', 'Revise os campos e a versão do registro.');
        try {
            return await executeIdempotent(req, res, 'record.update', { ...req.body, recordId: req.params.id }, 'execute_diary_record_update');
        } catch { return apiError(res, 503, 'EDICAO_INDISPONIVEL', 'Não foi possível corrigir o registro.'); }
    });

    router.post('/registros', authenticate, async (req, res) => {
        try {
            if (!validateRecordFields(req.body)) return apiError(res, 422, 'DADOS_INVALIDOS', 'Revise os campos do registro.');
            const payload = { ...req.body, data_registro: clean(req.body.data_registro) || new Date().toISOString().slice(0, 10) };
            return await executeIdempotent(req, res, 'record.create', payload);
        } catch (error) {
            console.error('mobile record failed', { code: error?.code, message: error?.message });
            return apiError(res, 500, 'ERRO_INTERNO', 'Nao foi possivel criar o registro.');
        }
    });

    router.post('/vontades', authenticate, async (req, res) => {
        try {
            const input = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
            const allowed = new Set(['vicio_id', 'occurred_at', 'timezone', 'intensidade', 'gatilhos', 'nota', 'acao_realizada', 'resultado']);
            const unknown = Object.keys(input).some(key => !allowed.has(key));
            const habitId = clean(input.vicio_id);
            const occurredAt = clean(input.occurred_at) || new Date().toISOString();
            const parsedTime = new Date(occurredAt);
            const timezone = clean(input.timezone);
            const triggers = input.gatilhos === undefined ? [] : input.gatilhos;
            const textFields = ['nota', 'acao_realizada', 'resultado'];
            const invalidText = textFields.some(key => input[key] !== undefined
                && input[key] !== null
                && (typeof input[key] !== 'string' || input[key].trim().length > 1000));
            const fields = {};
            if (unknown) fields.dados = 'Remova campos que nao fazem parte do contrato.';
            if (!UUID_PATTERN.test(habitId || '')) fields.vicio_id = 'Informe um habito valido.';
            if (!Number.isFinite(parsedTime.getTime()) || !/(Z|[+-]\d{2}:\d{2})$/i.test(occurredAt)) {
                fields.occurred_at = 'Informe data e hora ISO 8601 com fuso.';
            } else if (parsedTime.getTime() > Date.now() + 5 * 60_000) {
                fields.occurred_at = 'O momento nao pode estar mais de cinco minutos no futuro.';
            }
            if (!isValidTimezone(timezone)) fields.timezone = 'Informe um fuso IANA valido.';
            if (!Number.isInteger(input.intensidade) || input.intensidade < 0 || input.intensidade > 10) {
                fields.intensidade = 'Use um numero inteiro de 0 a 10.';
            }
            if (!Array.isArray(triggers) || triggers.length > 10
                || triggers.some(code => typeof code !== 'string' || !/^[a-z][a-z0-9_]{0,39}$/.test(code))
                || new Set(triggers).size !== triggers.length) {
                fields.gatilhos = 'Informe ate dez codigos de gatilho, sem repeticoes.';
            }
            if (invalidText) fields.texto = 'Cada campo livre pode conter ate 1000 caracteres.';
            if (Object.keys(fields).length) return apiError(res, 422, 'DADOS_INVALIDOS', 'Revise os campos informados.', fields);

            const payload = {
                vicio_id: habitId,
                occurred_at: parsedTime.toISOString(),
                timezone,
                intensidade: input.intensidade,
                gatilhos: triggers,
                nota: typeof input.nota === 'string' ? input.nota.trim() || null : null,
                acao_realizada: typeof input.acao_realizada === 'string' ? input.acao_realizada.trim() || null : null,
                resultado: typeof input.resultado === 'string' ? input.resultado.trim() || null : null,
            };
            return await executeIdempotent(req, res, 'urge.create', payload, 'execute_mobile_urge_mutation');
        } catch (error) {
            console.error('mobile urge event failed', { code: error?.code, message: error?.message });
            return apiError(res, 500, 'ERRO_INTERNO', 'Nao foi possivel registrar a vontade.');
        }
    });

    router.get('/vontades', authenticate, async (req, res) => {
        const query = req.query || {};
        const allowed = new Set(['vicio_id', 'inicio', 'fim', 'timezone', 'limit', 'cursor']);
        const habitId = typeof query.vicio_id === 'string' ? query.vicio_id : '';
        const start = typeof query.inicio === 'string' ? query.inicio : '';
        const end = typeof query.fim === 'string' ? query.fim : '';
        const timezone = typeof query.timezone === 'string' ? query.timezone : '';
        const limitText = query.limit === undefined ? '50' : typeof query.limit === 'string' ? query.limit : '';
        const limit = /^\d{1,3}$/.test(limitText) ? Number(limitText) : NaN;
        const cursor = query.cursor === undefined ? null : parseUrgeCursor(query.cursor);
        const startTime = isValidLocalDate(start) ? Date.parse(`${start}T00:00:00.000Z`) : NaN;
        const endTime = isValidLocalDate(end) ? Date.parse(`${end}T00:00:00.000Z`) : NaN;
        const fields = {};
        if (Object.keys(query).some(key => !allowed.has(key))) fields.filtros = 'Remova filtros desconhecidos.';
        if (!UUID_PATTERN.test(habitId)) fields.vicio_id = 'Informe um habito valido.';
        if (!isValidLocalDate(start)) fields.inicio = 'Use uma data local YYYY-MM-DD valida.';
        if (!isValidLocalDate(end) || endTime < startTime || endTime - startTime > 3660 * MS_PER_DAY) {
            fields.fim = 'Informe um intervalo local de ate dez anos.';
        }
        if (!isValidTimezone(timezone)) fields.timezone = 'Informe um fuso IANA valido.';
        if (!Number.isInteger(limit) || limit < 1 || limit > 100) fields.limit = 'Use um limite de 1 a 100.';
        if (query.cursor !== undefined && !cursor) fields.cursor = 'Cursor de pagina invalido.';
        if (Object.keys(fields).length) return apiError(res, 422, 'DADOS_INVALIDOS', 'Revise os filtros informados.', fields);

        try {
            const { data, error } = await supabase.rpc('list_urge_events', {
                p_usuario_id: req.usuarioId,
                p_vicio_id: habitId,
                p_inicio: start,
                p_fim: end,
                p_timezone: timezone,
                p_limit: limit + 1,
                p_cursor_time: cursor?.occurredAt ?? null,
                p_cursor_id: cursor?.id ?? null,
            });
            if (error) throw error;
            const rows = Array.isArray(data) ? data : [];
            if (!rows[0]?.habit_found) return apiError(res, 404, 'VICIO_NAO_ENCONTRADO', 'Vicio nao encontrado.');
            const hasMore = rows.length > limit;
            const events = rows.filter(row => row.id).slice(0, limit).map(({ habit_found, total_count, ...event }) => event);
            const last = events.at(-1);
            const nextCursor = hasMore && last
                ? Buffer.from(JSON.stringify({ occurred_at: new Date(last.occurred_at).toISOString(), id: last.id })).toString('base64url')
                : null;
            return res.json({
                vontades: events,
                next_cursor: nextCursor,
                cobertura: {
                    total: Number(rows[0].total_count || 0),
                    retornados: events.length,
                    tem_mais: hasMore,
                },
                atualizado_em: new Date().toISOString(),
            });
        } catch (error) {
            console.error('mobile urge events query failed', { code: error?.code, message: error?.message });
            return apiError(res, 500, 'ERRO_INTERNO', 'Nao foi possivel consultar as vontades.');
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
