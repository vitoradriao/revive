import React from 'react';
import { coverageLabel, currentStreak, metricText, sequenceSavings } from '../../utils/progressMetrics';

export default function HabitProgress({ habit }) {
    const metrics = [
        ['Sequência atual', currentStreak(habit)],
        ['Recorde histórico', { value: habit.progresso?.recorde_dias, coverage: habit.progresso?.recorde_cobertura }],
        ['Economia estimada da sequência', sequenceSavings(habit), true],
        ['Economia estimada acumulada', { value: habit.progresso?.economia_acumulada.valor_estimado, coverage: habit.progresso?.economia_acumulada.cobertura }, true],
    ];
    return (
        <dl className="grid grid-cols-2 gap-3">
            {metrics.map(([label, metric, currency]) => <div key={label}>
                <dt className="text-xs text-muted">{label}</dt>
                <dd className="font-bold text-app">{metricText(metric, currency)}</dd>
                <dd className="text-xs text-muted">{coverageLabel(metric.coverage)}</dd>
            </div>)}
        </dl>
    );
}
