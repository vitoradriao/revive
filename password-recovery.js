const crypto = require('node:crypto');
const express = require('express');
const { createRecoveryEmail } = require('./recovery-email');
const { createWebAuthTransport } = require('./web-auth-transport');

const NEUTRAL_MESSAGE = 'Se houver uma conta com este e-mail, você receberá um código. Verifique também a pasta de spam.';
const normalizeEmail = value => typeof value === 'string' ? value.trim().toLowerCase() : '';
const validEmail = email => email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const validPassword = value => typeof value === 'string' && value.length >= 6
    && Buffer.byteLength(value, 'utf8') <= 72 && /[A-Z]/.test(value) && /[!@#$%^&*(),.?":{}|<>]/.test(value);
const digest = (secret, kind, ...values) => crypto.createHmac('sha256', secret)
    .update(JSON.stringify([kind, ...values])).digest('hex');

function createPasswordRecovery({ supabase, bcrypt, jwtSecret, email = createRecoveryEmail(), responseFloorMs = 3000,
    enabled = process.env.PASSWORD_RECOVERY_ENABLED === 'true',
    observe = event => console.warn('password_recovery', { event }) }) {
    const router = express.Router();
    const webAuth = createWebAuthTransport();
    const fail = (res, status, codigo, mensagem) => res.status(status).json({ codigo, mensagem });
    router.post('/request', async (req, res) => {
        const started = Date.now();
        const address = normalizeEmail(req.body?.email);
        if (!validEmail(address)) return fail(res, 422, 'DADOS_INVALIDOS', 'Informe um e-mail válido.');
        const requestId = crypto.randomUUID();
        const code = crypto.randomInt(0, 100_000_000).toString().padStart(8, '0');
        try {
            if (!enabled) { observe('recovery_disabled'); throw new Error('RECOVERY_DISABLED'); }
            const { data, error } = await supabase.rpc('request_password_recovery', {
                p_email: address, p_email_key: digest(jwtSecret, 'email', address),
                p_origin_key: digest(jwtSecret, 'origin', req.ip || ''),
                p_request_id: requestId, p_code_hash: digest(jwtSecret, 'code', requestId, address, code),
            });
            if (error) throw new Error('DATABASE_UNAVAILABLE');
            if (!email.configured) observe('email_not_configured');
            else if (data?.status === 'created') {
                try { await email.send({ email: data.email, code, requestId }); }
                catch {
                    observe('email_delivery_failed');
                    // A rejected/timeout message must never leave a usable code behind.
                    const invalidated = await supabase.from('password_recovery_requests')
                        .update({ consumed_at: new Date().toISOString() }).eq('id', requestId);
                    if (invalidated.error) observe('email_failure_cleanup_failed');
                }
            }
            if (!email.configured && data?.status === 'created') {
                const invalidated = await supabase.from('password_recovery_requests')
                    .update({ consumed_at: new Date().toISOString() }).eq('id', requestId);
                if (invalidated.error) observe('email_failure_cleanup_failed');
            }
        } catch { if (enabled) observe('recovery_request_unavailable'); }
        // Same envelope and minimum latency for known/unknown/throttled/unavailable.
        await new Promise(resolve => setTimeout(resolve, Math.max(0, responseFloorMs - (Date.now() - started))));
        return res.status(202).json({ mensagem: NEUTRAL_MESSAGE, request_id: requestId, reenviar_apos: 60 });
    });
    router.post('/confirm', async (req, res) => {
        const address = normalizeEmail(req.body?.email);
        const { request_id: requestId, codigo: code, senha: password } = req.body || {};
        if (!validEmail(address) || typeof requestId !== 'string'
            || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)
            || typeof code !== 'string' || !/^\d{8}$/.test(code)) {
            return fail(res, 422, 'DADOS_INVALIDOS', 'Revise o e-mail e o código de oito dígitos.');
        }
        if (!validPassword(password)) return fail(res, 422, 'SENHA_INVALIDA', 'Use de 6 a 72 bytes, uma letra maiúscula e um caractere especial.');
        if (!enabled) {
            observe('recovery_disabled');
            return fail(res, 503, 'RECUPERACAO_INDISPONIVEL', 'Não foi possível redefinir a senha. Tente novamente.');
        }
        try {
            const hash = await bcrypt.hash(password, 10);
            const { data, error } = await supabase.rpc('confirm_password_recovery', {
                p_email_key: digest(jwtSecret, 'email', address),
                p_origin_key: digest(jwtSecret, 'origin', req.ip || ''), p_request_id: requestId,
                p_code_hash: digest(jwtSecret, 'code', requestId, address, code), p_password_hash: hash,
            });
            if (error) throw new Error('DATABASE_UNAVAILABLE');
            if (data?.status === 'limited') return fail(res, 429, 'RECUPERACAO_LIMITADA', 'Muitas tentativas. Aguarde uma hora antes de tentar novamente.');
            if (data?.status !== 'changed') return fail(res, 400, 'CODIGO_INVALIDO', 'Código inválido, expirado ou já utilizado. Solicite um novo código.');
            webAuth.clear(res);
            return res.json({ mensagem: 'Senha redefinida. Entre novamente com a nova senha.' });
        } catch {
            observe('recovery_confirmation_unavailable');
            return fail(res, 503, 'RECUPERACAO_INDISPONIVEL', 'Não foi possível redefinir a senha. Tente novamente.');
        }
    });
    return router;
}
module.exports = { createPasswordRecovery, digest, validPassword, NEUTRAL_MESSAGE };
