const messages = {
    VICIO_NAO_ENCONTRADO: 'Hábito não encontrado.',
    REVISAO_CONFLITO: 'O hábito mudou em outro aparelho. Recarregue os dados e revise sua edição.',
    INICIO_COM_HISTORICO: 'A data de início não pode mudar após registros, metas, conquistas ou alterações de economia.',
    DATA_INICIO_INVALIDA: 'Informe uma data de início válida, sem data futura.',
    HABITO_ARQUIVADO: 'Reative o hábito antes de registrar novos eventos. Operações pendentes podem ser reenviadas após a reativação.',
    DADOS_INVALIDOS: 'Revise os campos informados.',
};

function validateHabitPatch(body) {
    const fields = {};
    if (!body || typeof body !== 'object' || Array.isArray(body)) return { fields: { revision: 'Informe a revisão do hábito.' } };
    const { revision, ...patch } = body;
    const allowed = new Set(['nome_vicio', 'data_inicio', 'valor_economizado_por_dia', 'ativo', 'motivo_pessoal']);
    if (!Number.isInteger(revision) || revision < 1 || revision > 2147483647) fields.revision = 'Recarregue o hábito antes de editar.';
    if (!Object.keys(patch).length || Object.keys(patch).some(key => !allowed.has(key))) fields.patch = 'Selecione somente os campos editáveis.';
    if ('nome_vicio' in patch) {
        if (typeof patch.nome_vicio !== 'string' || patch.nome_vicio.trim().length < 2 || patch.nome_vicio.trim().length > 120) fields.nome_vicio = 'Use de 2 a 120 caracteres.';
        else patch.nome_vicio = patch.nome_vicio.trim();
    }
    if ('data_inicio' in patch) {
        const value = patch.data_inicio;
        const date = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00Z`) : new Date(NaN);
        if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value || value > new Date().toISOString().slice(0, 10)) fields.data_inicio = messages.DATA_INICIO_INVALIDA;
    }
    if ('valor_economizado_por_dia' in patch) {
        const value = patch.valor_economizado_por_dia;
        if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 99999999.99 || Math.abs(value * 100 - Math.round(value * 100)) > 0.00001) fields.valor_economizado_por_dia = 'Informe um valor entre zero e R$99.999.999,99, com até duas casas decimais.';
    }
    if ('motivo_pessoal' in patch) {
        const value = patch.motivo_pessoal;
        if (value !== null && typeof value !== 'string') fields.motivo_pessoal = 'Informe um texto de até 1000 caracteres ou vazio para remover.';
        else {
            patch.motivo_pessoal = normalizePersonalReason(value);
            if ([...(patch.motivo_pessoal || '')].length > 1000 || (patch.motivo_pessoal || '').includes('\0') || /[\uD800-\uDFFF]/u.test(patch.motivo_pessoal || '')) fields.motivo_pessoal = 'Use até 1000 caracteres válidos, sem truncamento.';
        }
    }
    if ('ativo' in patch && typeof patch.ativo !== 'boolean') fields.ativo = 'Informe ativo ou arquivado.';
    return { revision, patch, fields };
}
async function listEditableHabits(supabase, userId) {
    const query = fields => supabase.from('vicios').select(fields).eq('usuario_id', userId).order('data_criacao', { ascending: false });
    const result = await query('*, inicio_editavel:habit_start_editable');
    // API instances can be deployed before the additive SQL/schema-cache rollout.
    if (['PGRST204', '42703'].includes(result.error?.code) && String(result.error?.message).includes('habit_start_editable')) return query('*');
    return result;
}
// Mesma lista explícita de espaços no painel e no PostgreSQL; conta pontos de código.
function normalizePersonalReason(value) {
    return value?.replace(/\r\n?/g, '\n').trim() || null;
}
function omitPersonalReasons(value) {
    if (Array.isArray(value)) return value.map(omitPersonalReasons);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
        .filter(([key]) => key !== 'motivo_pessoal').map(([key, item]) => [key, omitPersonalReasons(item)]));
    return value;
}
// Clientes antigos exportam o bootstrap bruto. A leitura privada exige capacidade explícita.
function privateHabitResponse(req, res, next) {
    res.vary('X-Revive-Include-Personal-Reason');
    res.set('Cache-Control', 'no-store');
    const json = res.json;
    res.json = function (body) {
        // Erros (codigo) precisam manter campos.motivo_pessoal; so omitir DTOs de habito.
        if (body && typeof body === 'object' && body.codigo) return json.call(this, body);
        const readsHabit = req.method === 'GET' || req.method === 'PATCH' && /\/vicios\/[^/?]+(?:\?.*)?$/.test(req.originalUrl);
        const include = readsHabit && req.get('X-Revive-Include-Personal-Reason') === 'true';
        return json.call(this, include ? body : omitPersonalReasons(body));
    };
    next();
}
module.exports = { normalizePersonalReason, omitPersonalReasons, privateHabitResponse, validateHabitPatch, listEditableHabits, habitEditMessages: messages };
