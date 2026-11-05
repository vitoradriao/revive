import React from 'react';
import { visibleIndicators } from '../../utils/journeyPreferences';
import { coverageLabel, metricText } from '../../utils/progressMetrics';

export default function HeroKpis({ progress, order }) {
    const metrics = {
        current_streak: [progress.current, false], historical_record: [progress.record, false],
        sequence_savings: [progress.sequenceSavings, true], accumulated_savings: [progress.savings, true],
    };
    return (
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {visibleIndicators(order).map(({ id, label }) => {
                const [metric, currency] = metrics[id];
                return (
                    <div key={id} data-indicator-id={id} className="surface-muted rounded-[26px] p-4">
                        <dt className="text-xs font-black text-muted">{label}</dt>
                        <dd className="mt-1 text-2xl font-black text-app">{metricText(metric, currency)}</dd>
                        <dd className="text-xs text-muted">{coverageLabel(metric.coverage)}</dd>
                    </div>
                );
            })}
        </dl>
    );
}
