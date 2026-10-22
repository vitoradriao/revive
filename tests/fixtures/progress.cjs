const { buildProgressSnapshot, observedAwards } = require('../../progress-metrics');
const now = new Date('2026-02-02T12:00:00Z');
const userId = '00000000-0000-4000-8000-000000000001';
const habitId = '10000000-0000-4000-8000-000000000001';

function progressFixture({ reset = true, archived = false, legacy = false, unknown = false, prospective = false, duplicateRecords = true } = {}) {
    const periods = reset ? [
        { id: 'first', started_at: '2026-01-01T12:00:00Z', ended_at: '2026-01-31T12:00:00Z', cobertura: 'confirmed' },
        { id: 'current', started_at: '2026-01-31T12:00:00Z', ended_at: null, cobertura: 'confirmed' },
    ] : [{ id: 'first', started_at: '2026-01-01T12:00:00Z', ended_at: null, cobertura: 'confirmed' }];
    if (unknown) periods[0].cobertura = 'unknown';
    const economySegments = prospective ? [
        { id: 'old-rate', effective_from: '2026-01-01T12:00:00Z', effective_to: '2026-02-01T12:00:00Z', valor_diario: 10, cobertura: 'confirmed' },
        { id: 'new-rate', effective_from: '2026-02-01T12:00:00Z', effective_to: null, valor_diario: 20, cobertura: 'confirmed' },
    ] : [{ id: 'rate', effective_from: '2026-01-01T12:00:00Z', effective_to: null, valor_diario: 10, cobertura: 'inferred' }];
    const records = [
        { id: 'r1', vicio_id: habitId, data_registro: '2026-02-01', humor: 'bom' },
        ...(duplicateRecords ? [{ id: 'r2', vicio_id: habitId, data_registro: '2026-02-01T15:00:00Z', humor: 'bom' }] : []),
        { id: 'r3', vicio_id: habitId, data_registro: '2026-02-02', humor: 'excelente' },
    ];
    const awards = observedAwards({ usuarioId: userId, vicioId: habitId, periods, economySegments, now })
        .map((award, index) => ({ ...award, id: `award-${index}` }));
    const habit = {
        id: habitId, usuario_id: userId, nome_vicio: 'Hábito sintético', data_inicio: '2026-01-01', ativo: !archived,
        dias_abstinencia: reset ? 2 : 32, valor_economizado: reset ? 20 : 320,
        ...(!legacy ? { progresso: buildProgressSnapshot({ periods, economySegments, records, awards, now }) } : {}),
    };
    return {
        server_time: now.toISOString(), usuario: { id: userId, nome: 'Conta sintética', email: 'fixture@example.invalid' },
        vicios: [habit], registros: records,
        recaidas: [{ id: 'relapse', vicio_id: habitId, data_recaida: '2026-02-01T12:00:00Z', reset_counter: reset }],
        metas: [{ id: 'goal', usuario_id: userId, concluida: true, descricao_meta: 'Meta sintética' }],
        ...(!legacy ? { conquistas: awards } : {}), mensagem: null,
    };
}
module.exports = { progressFixture };
