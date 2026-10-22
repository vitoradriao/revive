import React from 'react';

export default function ActivityHeatmap({ heatmapData }) {
    const activeDays = new Set(heatmapData.filter(day => day.count > 0).map(day => day.date)).size;
    return (
        <section className="surface-sand rounded-[34px] p-6" aria-label="Presença nos últimos 28 dias">
            <p className="eyebrow">Atividade disponível</p>
            <h3 className="mt-2 text-3xl font-black text-app">Últimos 28 dias</h3>
            <p className="text-muted">{activeDays}/28 dias com check-in. Uma recaída não remove a presença.</p>
            <div className="grid grid-cols-7 gap-1.5 mt-5" aria-hidden="true">
                {heatmapData.map(day => <div key={day.date}
                    className={`aspect-square rounded-lg ${day.count > 0 ? 'bg-[#121212]/70' : 'bg-[#121212]/10'} ${day.hasRelapse ? 'ring-2 ring-rose-500 ring-inset' : ''}`}
                    title={`${day.date}: ${day.count} registro(s)${day.hasRelapse ? ', com recaída' : ''}`}
                />)}
            </div>
            <p className="mt-3 text-xs text-muted">Preenchimento: check-in. Contorno: recaída. Sem registro disponível não significa ausência confirmada.</p>
            <details className="mt-3 text-sm text-app">
                <summary>Consultar atividade em texto</summary>
                <ul>{heatmapData.map(day => <li key={day.date}>{day.date}: {day.count} registro(s) de check-in{day.hasRelapse ? '; com recaída registrada' : ''}.</li>)}</ul>
            </details>
        </section>
    );
}
