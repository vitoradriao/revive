import { describe, expect, it } from 'vitest';
import { calculateGoalProgress, getLocalDateString, goalUsesTodayBaseline } from './goalProgress';

describe('goalProgress', () => {
  it('uses full addiction history when no baseline is enabled', () => {
    const progress = calculateGoalProgress(
      { dias_objetivo: 30 },
      { dias_abstinencia: 15 }
    );

    expect(progress).toBe(50);
  });

  it('starts day goals from zero when the today baseline is enabled', () => {
    const progress = calculateGoalProgress(
      { dias_objetivo: 30, iniciar_hoje: true, dias_abstinencia_inicio: 63 },
      { dias_abstinencia: 63 }
    );

    expect(progress).toBe(0);
  });

  it('counts only savings after the baseline for value goals', () => {
    const progress = calculateGoalProgress(
      { valor_objetivo: 300, iniciar_hoje: true, valor_economizado_inicio: 995 },
      { valor_economizado: 1145 }
    );

    expect(progress).toBe(50);
  });

  it('accepts boolean values returned as strings from the API', () => {
    expect(goalUsesTodayBaseline({ iniciar_hoje: 'true' })).toBe(true);
  });

  it('formats local dates as yyyy-mm-dd', () => {
    expect(getLocalDateString(new Date(2026, 5, 16))).toBe('2026-06-16');
  });
});

it('preserves legacy goal bases after a prospective rate change using the mobile bootstrap metrics', () => {
  const goal = { valor_objetivo: '100', iniciar_hoje: 'true', valor_economizado_inicio: '320', data_inicio_meta: '2026-02-01' };
  const habit = { valor_economizado_por_dia: 20, dias_abstinencia: 32, valor_economizado: '9999',
    progresso: { sequencia_atual_dias: 32, economia_sequencia: { valor_estimado: 330 } } };
  expect(calculateGoalProgress(goal, habit)).toBe(10);
  expect(goal.valor_economizado_inicio).toBe('320');
  expect(calculateGoalProgress({ ...goal, iniciar_hoje: false, valor_objetivo: 660 }, habit)).toBe(50);
});
it('clamps day and savings baselines after reset without rewriting old goals', () => {
  expect(calculateGoalProgress({ dias_objetivo: 30, iniciar_hoje: true, dias_abstinencia_inicio: 63 }, { dias_abstinencia: 2 })).toBe(0);
  expect(calculateGoalProgress({ valor_objetivo: 100, iniciar_hoje: true, valor_economizado_inicio: 320 }, { valor_economizado: 20 })).toBe(0);
});
it('keeps confirmed completion without the habit and handles zero, unknown and excess progress', () => {
  expect(calculateGoalProgress({ concluida: true }, null)).toBe(100);
  expect(calculateGoalProgress({ concluida: 'false', dias_objetivo: 10 }, { dias_abstinencia: 5 })).toBe(50);
  expect(calculateGoalProgress({ valor_objetivo: 10 }, { progresso: { economia_sequencia: { valor_estimado: null } }, valor_economizado: 100 })).toBe(0);
  expect(calculateGoalProgress({ dias_objetivo: 0 }, { dias_abstinencia: 500 })).toBe(0);
  expect(calculateGoalProgress({ dias_objetivo: 10 }, { dias_abstinencia: 500, ativo: false })).toBe(100);
});
