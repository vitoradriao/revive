import React from 'react';
import { useData } from '../../contexts/DataContext';
import { displayZonedMoment, validTimezone } from '../../utils/urge-time';
import { intentStatusLabel } from '../../utils/goalIntent';

export default function RelapseHistory({ habitId }) {
    const { relapses = [] } = useData();
    const events = relapses.filter(event => !habitId || event.vicio_id === habitId);
    const eventMoment = event => {
        const instant = event.data_recaida || event.occurred_at;
        const timezone = validTimezone(event.timezone) ? event.timezone : 'UTC';
        return Number.isFinite(Date.parse(instant)) ? `${displayZonedMoment(instant, timezone)} · ${timezone}${event.timezone ? '' : ' (fuso original indisponível)'}` : 'Momento indisponível';
    };
    return <section className="surface-card rounded-3xl p-5 space-y-3" aria-label="Registros de recaída">
        <h2 className="text-lg font-bold">Registros de recaída</h2>
        <p>Os contadores, recordes e conquistas exibem apenas dados confirmados.</p>
        {!events.length && <p>Nenhuma recaída nesta cópia.</p>}
        {events.map(event => <div key={event.id} className="border rounded-xl p-3">
            <p>{eventMoment(event)}</p>
            <p>{event.resetarContador === true || event.resetar_contador === true ? 'Com reinício do contador' : 'Sem reinício do contador'}</p>
            <p role="status">{intentStatusLabel(event.sync_status)}</p>
        </div>)}
        {events.some(event => event.pending) && <a href="/sincronizacao">Revisar pendências de recaída</a>}
    </section>;
}
