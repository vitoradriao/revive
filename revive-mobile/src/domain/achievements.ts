import type { BootstrapData } from './types';
import { accountAccumulatedSavings, accountCurrentStreak, completedGoals, currentStreak, distinctCheckinDays, formatCurrency } from './metrics';

// Thresholds match revive-painel/src/utils/constants.js.
const groups = [
  { category: 'streak', label: 'Dias consecutivos', thresholds: [1, 7, 30, 90, 180, 365] },
  { category: 'savings', label: 'Economia estimada acumulada', thresholds: [50, 100, 500, 1000] },
  { category: 'goals', label: 'Metas concluídas', thresholds: [1, 5, 10] },
  { category: 'consistency', label: 'Registros diários', thresholds: [7, 30] },
] as const;

export function achievementProgress(data: BootstrapData) {
  const streakLeader = accountCurrentStreak(data.vicios);
  const savings = accountAccumulatedSavings(data.vicios);
  const values = {
    streak: streakLeader ? currentStreak(streakLeader).value : null,
    savings: savings.value,
    goals: completedGoals(data.metas),
    consistency: distinctCheckinDays(data.registros),
  };
  return groups.flatMap((group) => group.thresholds.map((target) => {
    const current = values[group.category];
    return {
      id: `${group.category}-${target}`,
      categoryKey: group.category,
      label: group.category === 'streak' ? `${target} dias consecutivos`
        : group.category === 'savings' ? `${formatCurrency(target)} de economia estimada acumulada`
          : group.category === 'goals' ? `${target} metas concluídas`
            : `${target} dias distintos com check-in`,
      category: group.label, target, current,
      award: data.conquistas?.find((item) => item.vicio_id == null
        && item.categoria === group.category && Number(item.valor_alvo) === target)
        || data.conquistas?.find((item) => item.categoria === group.category && Number(item.valor_alvo) === target),
      earned: Boolean(data.conquistas?.some((item) => item.categoria === group.category && Number(item.valor_alvo) === target)),
      unavailable: current == null,
      legacyHistory: data.conquistas === undefined,
      percent: current == null ? 0 : Math.min(100, Math.max(0, current / target * 100)),
    };
  }));
}
