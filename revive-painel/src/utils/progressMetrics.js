import { badgeDefinitions } from './constants';

const unavailable = () => ({ value: null, coverage: 'unknown' });
const asNumber = value => Number.isFinite(Number(value)) ? Number(value) : 0;

export const currentStreak = habit => habit.progresso ? {
    value: habit.progresso.sequencia_atual_dias,
    coverage: habit.progresso.sequencia_atual_cobertura,
    legacy: false,
} : {
    value: habit.dias_abstinencia == null ? null : asNumber(habit.dias_abstinencia),
    coverage: 'unknown',
    legacy: true,
};

export const sequenceSavings = habit => ({
    value: habit.progresso?.economia_sequencia.valor_estimado ?? null,
    coverage: habit.progresso?.economia_sequencia.cobertura || 'unknown',
    legacy: !habit.progresso,
});

export function accountCurrentStreak(habits) {
    const active = habits.filter(habit => habit.ativo !== false);
    if (!active.length || active.some(habit => {
        const metric = currentStreak(habit);
        return metric.value == null || metric.legacy || metric.coverage === 'unknown';
    })) return null;
    return active.reduce((best, habit) => !best || currentStreak(habit).value > currentStreak(best).value ? habit : best, null);
}

export function accountRecordHolder(habits) {
    if (!habits.length || habits.some(habit => !habit.progresso
        || habit.progresso.recorde_dias == null || habit.progresso.recorde_cobertura === 'unknown')) return null;
    return habits.reduce((best, habit) => !best || habit.progresso.recorde_dias > best.progresso.recorde_dias ? habit : best, null);
}

export function accountAccumulatedSavings(habits) {
    if (!habits.length || habits.some(habit => !habit.progresso
        || habit.progresso.economia_acumulada.valor_estimado == null
        || habit.progresso.economia_acumulada.cobertura === 'unknown')) return unavailable();
    return {
        value: habits.reduce((sum, habit) => sum + habit.progresso.economia_acumulada.valor_estimado, 0),
        coverage: habits.some(habit => habit.progresso.economia_acumulada.cobertura === 'inferred') ? 'inferred' : 'confirmed',
    };
}

export const distinctCheckinDays = (records, habitId) => new Set(records
    .filter(record => !habitId || record.vicio_id === habitId)
    .map(record => String(record.data_registro || '').slice(0, 10)).filter(Boolean)).size;

export const coverageLabel = coverage => ({
    confirmed: 'Dados confirmados',
    inferred: 'Estimativa com histórico parcial',
    unknown: 'Indisponível: histórico incompleto',
}[coverage] || 'Indisponível: histórico incompleto');

export const milestoneOriginLabel = origin => ({
    legacy: 'registro legado',
    period_threshold: 'período confirmado',
    snapshot_observation: 'reconhecido na sincronização',
}[origin] || 'origem registrada');

export const milestoneCategoryLabel = category => ({
    streak: 'dias consecutivos', savings: 'economia estimada', goals: 'metas concluídas', consistency: 'dias com check-in',
}[category] || 'marco');

export function metricText(metric, currency = false) {
    if (metric?.value == null || !['confirmed', 'inferred'].includes(metric.coverage)) return 'Indisponível';
    return currency ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(metric.value) : `${metric.value} dias`;
}

// O bootstrap não declara a completude das coleções; seu tamanho não comprova cobertura total.
export function buildProgressView({ data, loading = false, error = null, localOnly = false, queue = [], updatedAt, stale = false } = {}) {
    const habits = (data?.vicios || []).filter(item => !item.pending);
    const records = (data?.registros || []).filter(item => !item.pending);
    const goals = (data?.metas || []).filter(item => !item.pending);
    const relapses = (data?.recaidas || []).filter(item => !item.pending);
    const awards = data?.conquistas;
    const leader = accountCurrentStreak(habits);
    const recordHolder = accountRecordHolder(habits);
    const current = leader ? currentStreak(leader) : unavailable();
    const savings = accountAccumulatedSavings(habits);
    const values = { streak: current.value, savings: savings.value, goals: data ? goals.filter(goal => goal.concluida).length : null, consistency: data ? distinctCheckinDays(records) : null };
    const badges = badgeDefinitions.map(badge => {
        const award = awards?.find(item => item.vicio_id == null && item.categoria === badge.category && Number(item.valor_alvo) === badge.requirement)
            || awards?.find(item => item.categoria === badge.category && Number(item.valor_alvo) === badge.requirement);
        const value = values[badge.category];
        return { ...badge, award, earned: !!award, current: value, progress: value == null ? 0 : Math.min(100, Math.max(0, value / badge.requirement * 100)) };
    });
    return {
        habits, records, goals, relapses, awards, badges, leader, current, savings,
        record: recordHolder ? { value: recordHolder.progresso.recorde_dias, coverage: recordHolder.progresso.recorde_cobertura } : unavailable(),
        sequenceSavings: leader ? sequenceSavings(leader) : unavailable(),
        activeCount: habits.filter(habit => habit.ativo !== false).length,
        checkinDays: distinctCheckinDays(records), completedGoals: values.goals,
        available: !!data, loading, error, localOnly, pendingCount: queue.length,
        conflictCount: queue.filter(intent => intent.status === 'recovery' && intent.lastError?.status === 409).length,
        updatedAt: data?.server_time || updatedAt, stale,
        scope: 'Cópia parcial: contagens e comparações consideram somente os dados disponíveis; o bootstrap não garante todo o histórico.',
    };
}

export function recordsInPeriod(records, field, days, now = new Date()) {
    const end = now.toISOString().slice(0, 10);
    const startDate = new Date(`${end}T00:00:00Z`);
    startDate.setUTCDate(startDate.getUTCDate() - days + 1);
    const start = startDate.toISOString().slice(0, 10);
    return records.filter(record => {
        const date = String(record[field] || '').slice(0, 10);
        return date >= start && date <= end;
    });
}

export function activityDays(records, relapses, now = new Date()) {
    const end = now.toISOString().slice(0, 10);
    return Array.from({ length: 28 }, (_, index) => {
        const date = new Date(`${end}T00:00:00Z`);
        date.setUTCDate(date.getUTCDate() - 27 + index);
        const key = date.toISOString().slice(0, 10);
        return { date: key, count: records.filter(record => String(record.data_registro).slice(0, 10) === key).length,
            hasRelapse: relapses.some(relapse => String(relapse.data_recaida).slice(0, 10) === key) };
    });
}
