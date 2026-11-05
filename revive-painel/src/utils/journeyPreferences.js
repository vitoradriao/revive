export const indicatorCatalog = [
    { id: 'current_streak', label: 'Maior sequência atual entre hábitos ativos' },
    { id: 'historical_record', label: 'Recorde histórico entre hábitos disponíveis' },
    { id: 'sequence_savings', label: 'Economia estimada da sequência em destaque' },
    { id: 'accumulated_savings', label: 'Economia estimada acumulada dos hábitos disponíveis' },
];
export const defaultPreferences = () => ({ primary_habit_id: null, indicator_order: indicatorCatalog.map(item => item.id), intro: { version: 0, state: 'pending' }, revision: 0 });
// IDs futuros permanecem no documento; somente o catálogo conhecido é apresentado.
export function mergeIndicatorOrder(order = []) {
    return [...new Set([...order.filter(id => typeof id === 'string'), ...indicatorCatalog.map(item => item.id)])];
}
export function visibleIndicators(order) {
    return mergeIndicatorOrder(order).map(id => indicatorCatalog.find(item => item.id === id)).filter(Boolean);
}
export function resolvePrimary(preferences, habits) {
    const active = habits.filter(habit => habit.ativo !== false);
    const primary = active.find(habit => habit.id === preferences?.primary_habit_id);
    return { habit: primary || active[0], needsReview: !!preferences?.primary_habit_id && !primary };
}
export function validPreferences(value) {
    return value && Number.isInteger(value.revision) && value.revision >= 0 && Array.isArray(value.indicator_order)
        && value.indicator_order.length > 0 && value.indicator_order.every(id => typeof id === 'string')
        && (value.primary_habit_id === null || typeof value.primary_habit_id === 'string')
        && Number.isInteger(value.intro?.version) && ['pending', 'completed', 'dismissed'].includes(value.intro?.state);
}
