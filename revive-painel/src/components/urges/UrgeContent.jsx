import React from 'react';
import { displayZonedMoment } from '../../utils/urge-time';
import { urgeTriggerLabel } from '../../utils/urge-triggers';
export default function UrgeContent({ event }) {
    return <article className="rounded-xl border border-violet-400/30 p-3 space-y-2">
        <h3 className="font-semibold">Vontade · intensidade {event.intensidade}/10</h3>
        <p><time dateTime={event.occurred_at}>{displayZonedMoment(event.occurred_at, event.timezone)}</time> · {event.timezone}</p>
        {!!event.gatilhos?.length && <p>Gatilhos: {event.gatilhos.map(urgeTriggerLabel).join(', ')}</p>}
        {['nota', 'acao_realizada', 'resultado'].map((key, index) => event[key] && <p key={key} className="whitespace-pre-wrap break-words">{['Nota', 'Ação realizada', 'Resultado'][index]}: {event[key]}</p>)}
        {event.pending && <p role="status">{['recovery', 'retry'].includes(event.pending.status) ? 'Falha no envio. Conteúdo preservado; consulte a Sincronização.' : 'Salvo neste navegador · confirmação pendente'}</p>}
    </article>;
}
