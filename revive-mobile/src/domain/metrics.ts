import type { Addiction, BootstrapData, Goal, ProgressCoverage } from './types';
import { describeMood } from './moods';

export const asNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const formatCurrency = (value: unknown) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(asNumber(value));

export const formatDate = (value?: string | null) => {
  if (!value) return '—';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' }).format(new Date(value));
};

export type ProgressValue = { value: number | null; coverage: ProgressCoverage; legacy?: boolean };

export const currentStreak = (habit: Addiction): ProgressValue => {
  if (habit.progresso) return {
    value: habit.progresso.sequencia_atual_dias,
    coverage: habit.progresso.sequencia_atual_cobertura,
    legacy: false,
  };
  return {
    value: habit.dias_abstinencia == null ? null : asNumber(habit.dias_abstinencia),
    coverage: 'unknown',
    legacy: true,
  };
};

export const sequenceSavings = (habit: Addiction): ProgressValue => ({
  value: habit.progresso?.economia_sequencia.valor_estimado ?? null,
  coverage: habit.progresso?.economia_sequencia.cobertura || 'unknown',
  legacy: !habit.progresso,
});

export const accountCurrentStreak = (habits: Addiction[]) => {
  habits = habits.filter(habit => habit.ativo !== false);
  if (!habits.length) return null;
  const values = habits.map(currentStreak);
  if (values.some((item) => item.value == null || item.legacy || item.coverage === 'unknown')) return null;
  return habits.reduce<Addiction | null>((best, habit) => {
    if (!best) return habit;
    return (currentStreak(habit).value || 0) > (currentStreak(best).value || 0) ? habit : best;
  }, null);
};

export const accountRecordHolder = (habits: Addiction[]) => {
  if (!habits.length || habits.some((habit) => !habit.progresso
    || habit.progresso.recorde_dias == null || habit.progresso.recorde_cobertura === 'unknown')) return null;
  return habits.reduce<Addiction | null>((best, habit) => {
    if (!best) return habit;
    return (habit.progresso?.recorde_dias || 0) > (best.progresso?.recorde_dias || 0) ? habit : best;
  }, null);
};

export const accountAccumulatedSavings = (habits: Addiction[]): ProgressValue => {
  if (!habits.length || habits.some((habit) => !habit.progresso
    || habit.progresso.economia_acumulada.valor_estimado == null
    || habit.progresso.economia_acumulada.cobertura === 'unknown')) {
    return { value: null, coverage: 'unknown' };
  }
  const coverage: ProgressCoverage = habits.some((habit) => habit.progresso?.economia_acumulada.cobertura === 'inferred')
    ? 'inferred' : 'confirmed';
  return {
    value: habits.reduce((sum, habit) => sum + (habit.progresso?.economia_acumulada.valor_estimado || 0), 0),
    coverage,
  };
};

export const distinctCheckinDays = (records: BootstrapData['registros'], habitId?: string) => new Set(
  records.filter((record) => !habitId || record.vicio_id === habitId)
    .map((record) => String(record.data_registro || '').slice(0, 10))
    .filter(Boolean),
).size;

export const coverageLabel = (coverage: ProgressCoverage) => ({
  confirmed: 'Dados confirmados',
  inferred: 'Estimativa com histórico parcial',
  unknown: 'Indisponível: histórico incompleto',
}[coverage]);

export const milestoneCategoryLabel = (category: string) => ({
  streak: 'dias consecutivos',
  savings: 'economia estimada',
  goals: 'metas concluídas',
  consistency: 'dias com check-in',
}[category as 'streak' | 'savings' | 'goals' | 'consistency'] || 'marco');

export const milestoneOriginLabel = (origin: string) => ({
  legacy: 'registro legado',
  period_threshold: 'período confirmado',
  snapshot_observation: 'reconhecido na sincronização',
}[origin as 'legacy' | 'period_threshold' | 'snapshot_observation'] || 'origem registrada');

export const maxStreak = (addictions: Addiction[]) => Math.max(0, ...addictions.map((item) => asNumber(item.dias_abstinencia)));
export const totalSavings = (addictions: Addiction[]) => addictions.reduce((sum, item) => sum + asNumber(item.valor_economizado), 0);
export const completedGoals = (goals: Goal[]) => goals.filter((goal) => Boolean(goal.concluida)).length;

export const moodDistribution = (data: BootstrapData) => {
  // Group by accent/case-insensitive key so "Bom", "bom" and web/mobile
  // spellings of the same mood are counted together.
  const result = new Map<string, { label: string; count: number }>();
  for (const record of data.registros) {
    const mood = describeMood(record.humor) ?? { key: '', label: 'Não informado' };
    const entry = result.get(mood.key) ?? { label: mood.label, count: 0 };
    entry.count += 1;
    result.set(mood.key, entry);
  }
  return [...result.values()].map(({ label, count }) => [label, count] as [string, number]).sort((a, b) => b[1] - a[1]);
};
