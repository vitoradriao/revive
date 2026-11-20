const crypto = require('node:crypto');
const { ipKeyGenerator } = require('express-rate-limit');

// Reuse the database's atomic counters across serverless instances.
function distributedLimit({ supabase, secret, kind, seconds, max }) {
    if (!secret) throw new Error('JWT_SECRET is required for rate limit keys');
    return async (req, res, next) => {
        const key = crypto.createHmac('sha256', secret).update(ipKeyGenerator(req.ip || 'unknown')).digest('hex');
        try {
            const { data, error } = await supabase.rpc('take_recovery_limit', {
                p_kind: `api_${kind}`, p_key: key, p_window: seconds, p_max: max, p_cooldown: 0,
            });
            if (error || typeof data !== 'boolean') throw new Error('Counter unavailable');
            if (!data) return res.set('Retry-After', String(seconds)).status(429).json({ erro: 'Limite de requisições excedido. Tente mais tarde.' });
            return next();
        } catch {
            return res.status(503).json({ erro: 'Não foi possível verificar o limite de acesso.' });
        }
    };
}

function healthCheck(supabase) {
    return async (_req, res) => {
        try {
            const { error } = await supabase.from('usuarios').select('id', { head: true }).limit(1)
                .abortSignal(AbortSignal.timeout(3000));
            if (error) throw new Error('Database unavailable');
            return res.json({ status: 'ok', database: 'ok', timestamp: new Date().toISOString() });
        } catch {
            return res.status(503).json({ status: 'unavailable', database: 'unavailable', timestamp: new Date().toISOString() });
        }
    };
}

function deleteHabit(supabase) {
    return async (req, res) => {
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(req.params.id)) {
            return res.status(400).json({ erro: 'Identificador inválido.' });
        }
        try {
            const { data, error } = await supabase.rpc('delete_revive_habit', { p_usuario_id: req.usuarioId, p_vicio_id: req.params.id });
            if (error) throw new Error('Deletion failed');
            if (data !== true) return res.status(404).json({ erro: 'Hábito não encontrado.' });
            return res.json({ mensagem: 'Hábito excluído com sucesso.' });
        } catch {
            return res.status(503).json({ erro: 'Não foi possível excluir o hábito. Nenhuma exclusão parcial foi confirmada.' });
        }
    };
}
module.exports = { distributedLimit, healthCheck, deleteHabit };
