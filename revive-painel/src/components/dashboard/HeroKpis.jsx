import React from 'react';
import { coverageLabel, metricText } from '../../utils/progressMetrics';

export default function HeroKpis({ progress }) {
    const metrics = [
        ['Maior sequência atual entre hábitos ativos', progress.current, false],
        ['Recorde histórico entre hábitos disponíveis', progress.record, false],
        ['Economia estimada da sequência em destaque', progress.sequenceSavings, true],
        ['Economia estimada acumulada dos hábitos disponíveis', progress.savings, true],
    ];
    return (
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {metrics.map(([label, metric, currency]) => (
                <div key={label} className="surface-muted rounded-[26px] p-4">
                    <dt className="text-xs font-black text-muted">{label}</dt>
                    <dd className="mt-1 text-2xl font-black text-app">{metricText(metric, currency)}</dd>
                    <dd className="text-xs text-muted">{coverageLabel(metric.coverage)}</dd>
                </div>
            ))}
        </dl>
    );
}
