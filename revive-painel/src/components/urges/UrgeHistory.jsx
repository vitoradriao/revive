import React, { useEffect, useRef, useState } from 'react';
import { useOffline } from '../../contexts/OfflineContext';
import { listUrgeEvents } from '../../services/vontades.service';
import { mergeUrges } from '../../utils/urges';
import { dateInZone, deviceTimezone } from '../../utils/urge-time';
import UrgeContent from './UrgeContent';
import Button from '../ui/Button';
import { fieldBase, glassSurface } from '../../utils/constants';

export default function UrgeHistory({ habitId, accountKey, period, onEvents, showEvents = true }) {
    const { client, queue = [], receipts = [], localOnly, loading, snapshot } = useOffline();
    const timezone = deviceTimezone(), today = dateInZone(new Date(), timezone);
    const [filters, setFilters] = useState({ inicio: today.slice(0, 7) + '-01', fim: today, timezone, vicio_id: habitId, limit: 20 });
    const [inputs, setInputs] = useState(filters), [page, setPage] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [reload, setReload] = useState(0);
    const ticket = useRef(null), moreBusy = useRef(false);
    const start = period?.inicio, end = period?.fim;
    const query = React.useMemo(() => ({ ...filters, vicio_id: habitId, ...(start ? { inicio: start, fim: end } : {}) }), [filters, habitId, start, end]);
    const version = JSON.stringify([queue.map(row => [row.id, row.status]), receipts.map(row => row.key), snapshot?.updatedAt]);
    useEffect(() => {
        const request = { active: true }; ticket.current = request;
        setPage(null); onEvents?.([]); setError(''); setBusy(true);
        if (!loading && accountKey && habitId) {
            listUrgeEvents(client, accountKey, query).then(result => {
                if (request.active) { setPage(result); onEvents?.(result.events); }
            }, caught => { if (request.active) setError(caught.message); }).finally(() => { if (request.active) setBusy(false); });
        } else if (!habitId) setBusy(false);
        return () => { request.active = false; };
    }, [accountKey, client, query, version, localOnly, reload, loading, habitId, onEvents]);
    const more = async () => {
        if (moreBusy.current || !page?.nextCursor || !ticket.current?.active) return;
        moreBusy.current = true; setBusy(true); setError(''); const request = ticket.current;
        try {
            const result = await listUrgeEvents(client, accountKey, { ...query, cursor: page.nextCursor });
            if (request.active) { const next = { ...result, partial: page.partial || result.partial, events: mergeUrges(page.events, result.events) }; setPage(next); onEvents?.(next.events); }
        } catch (caught) { if (request.active) setError(caught.message); }
        finally { moreBusy.current = false; if (request.active) setBusy(false); }
    };
    return <section aria-label="Histórico de vontades" className={`${glassSurface} rounded-3xl p-6 space-y-4`}>
        <h2 className="text-2xl font-bold">Histórico de vontades</h2>
        {!period && <form className="flex flex-wrap gap-3 items-end" onSubmit={event => { event.preventDefault(); setFilters({ ...inputs }); }}>
            <label>Início<input className={fieldBase} type="date" required value={inputs.inicio} onChange={event => setInputs({ ...inputs, inicio: event.target.value })} /></label>
            <label>Fim<input className={fieldBase} type="date" required value={inputs.fim} onChange={event => setInputs({ ...inputs, fim: event.target.value })} /></label>
            <Button type="submit">Consultar vontades</Button>
        </form>}
        <p>Período no fuso {query.timezone}. Eventos exibem também o fuso original.</p>
        <p role="status">{busy ? 'Consultando vontades…' : !habitId ? 'Selecione um hábito para consultar vontades.' : error ? 'Consulta não concluída.' : page?.offline ? 'Offline. Exibindo os eventos disponíveis neste navegador.' : 'Consulta de vontades concluída.'}</p>
        <p role="status">{page?.partial || page?.nextCursor || !page ? 'Cobertura parcial: a cópia ou as páginas carregadas podem não conter todos os eventos do período.' : 'Todas as páginas desta consulta foram carregadas.'}</p>
        {(error || page?.error) && <p role="alert">{error || page.error}</p>}
        <Button disabled={busy || !habitId} onClick={() => setReload(value => value + 1)}>Atualizar vontades</Button>
        {page && !page.events.length && !busy && <p>Nenhuma vontade neste período nos dados disponíveis.</p>}
        {showEvents && <ul className="space-y-3">{page?.events.map(event => <li key={event.id}><UrgeContent event={event} /></li>)}</ul>}
        {page?.nextCursor && <Button disabled={busy} onClick={more}>Carregar mais vontades</Button>}
    </section>;
}
