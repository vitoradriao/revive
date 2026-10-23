export const normalizePersonalReason = value => value?.replace(/\r\n?/g, '\n').trim() || null;
export const personalReasonLength = value => [...(normalizePersonalReason(value) || '')].length;

// Exportação padrão por projeção explícita: campos privados e futuros ficam de fora.
export function exportHabit(habit) {
    const fields = ['id', 'usuario_id', 'nome_vicio', 'data_inicio', 'data_ultima_recaida',
        'ativo', 'revision', 'valor_economizado_por_dia', 'dias_abstinencia', 'valor_economizado',
        'tempo_formatado', 'data_criacao', 'data_modificacao', 'progresso', 'pending', 'sync_status'];
    return Object.fromEntries(fields.filter(field => field in habit).map(field => [field, habit[field]]));
}
