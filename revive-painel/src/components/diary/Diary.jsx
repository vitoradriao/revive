import React, { useEffect, useRef, useState } from 'react';
import { useOffline } from '../../contexts/OfflineContext';
import { listDiaryRecords } from '../../services/registros.service';
import { getLocalDateString } from '../../utils/goalProgress';
import { mergeRecords } from '../../utils/diary';
import { fieldBase, glassSurface } from '../../utils/constants';
import RecordContent from './RecordContent';
import RecordEditor from './RecordEditor';
import Button from '../ui/Button';

export default function Diary({ habitId, accountKey, todayOnly = false }) {
    const { client, queue = [], localOnly, loading: storageLoading, snapshot } = useOffline();
    const snapshotVersion = snapshot?.updatedAt;
    const today = getLocalDateString();
    const [filters, setFilters] = useState({ inicio: todayOnly ? today : today.slice(0, 7) + '-01', fim: today, vicio_id: habitId, limit: 20 });
    const [inputs, setInputs] = useState(filters), [page, setPage] = useState(null), [selected, setSelected] = useState(null);
    const [busy, setBusy] = useState(false), [error, setError] = useState(''), [reload, setReload] = useState(0);
    const ticket = useRef(null), opener = useRef(null), heading = useRef(null), loadingMore = useRef(false);
    const queueKey = JSON.stringify(queue.map(item => [item.id, item.status]));
    useEffect(() => {
        if (storageLoading || !accountKey) { setBusy(true); return; }
        const request = { active: true };
        ticket.current = request;
        setBusy(true); setError('');
        listDiaryRecords(client, accountKey, filters).then(result => {
            if (request.active && request === ticket.current) setPage(result);
        }, caught => { if (request.active && request === ticket.current) setError(caught.message); })
            .finally(() => { if (request.active && request === ticket.current) setBusy(false); });
        return () => { request.active = false; };
    }, [accountKey, client, filters, queueKey, localOnly, reload, storageLoading, snapshotVersion]);
    const more = async () => {
        if (loadingMore.current || !page?.nextCursor || !ticket.current?.active) return;
        loadingMore.current = true; setBusy(true); setError('');
        const request = ticket.current;
        try {
            const result = await listDiaryRecords(client, accountKey, { ...filters, cursor: page.nextCursor });
            if (request.active && request === ticket.current) setPage(previous => ({ ...result, partial: previous.partial || result.partial, records: mergeRecords(previous.records, result.records) }));
        } catch (caught) { if (request.active && request === ticket.current) setError(caught.message); }
        finally { loadingMore.current = false; if (request.active && request === ticket.current) setBusy(false); }
    };
    return <section aria-label={todayOnly ? 'Registros de hoje' : 'Diário por período'} className={`${glassSurface} rounded-3xl p-6 space-y-4`}>
        <h2 ref={heading} tabIndex={-1} className="text-2xl font-bold">{todayOnly ? 'Registros de hoje' : 'Diário por período'}</h2>
        {!todayOnly && <form onSubmit={event => { event.preventDefault(); setPage(null); setFilters({ ...inputs }); setSelected(null); }} className="flex flex-wrap items-end gap-3">
            <label>Início<input type="date" required value={inputs.inicio} onChange={event => setInputs({ ...inputs, inicio: event.target.value })} className={fieldBase} /></label>
            <label>Fim<input type="date" required value={inputs.fim} onChange={event => setInputs({ ...inputs, fim: event.target.value })} className={fieldBase} /></label>
            <Button type="submit">Consultar período</Button>
        </form>}
        <p role="status">{busy ? 'Consultando diário…' : error ? 'Consulta não concluída.' : localOnly ? 'Offline. Exibindo a cópia disponível neste navegador.' : 'Consulta do diário concluída.'}</p>
        {(page?.partial || page?.nextCursor) && <p role="status">Cobertura parcial: {page.partial ? 'a cópia local pode não conter todos os registros do período.' : 'há mais páginas neste período.'}</p>}
        {(error || page?.error) && <p role="alert">{error || page.error}</p>}
        <Button disabled={busy} onClick={() => setReload(value => value + 1)}>Atualizar diário</Button>
        {page && !page.records.length && !busy && <p>Nenhum registro neste período nos dados disponíveis.</p>}
        <ul className="space-y-4">
            {page?.records.map(record => <li key={record.id} className="border rounded-2xl p-4 space-y-3">
                <RecordContent record={record} />
                {record.pending && <p role="status">{record.pending.lastError?.code === 'REVISAO_CONFLITO' ? 'Conflito: correção local preservada.' : ['recovery', 'retry'].includes(record.pending.status) ? 'Falha no envio. Conteúdo preservado neste navegador.' : 'Salvo neste navegador · confirmação pendente'}</p>}
                <Button onClick={event => { opener.current = event.currentTarget; setSelected(record.id); }}>Abrir registro de {record.data_registro.slice(0, 10).split('-').reverse().join('/')}</Button>
            </li>)}
        </ul>
        {page?.nextCursor && <Button disabled={busy} onClick={more}>Carregar mais registros</Button>}
        {selected && <RecordEditor key={accountKey + ':' + selected} accountKey={accountKey} recordId={selected} onClose={() => { setSelected(null); (opener.current?.isConnected ? opener.current : heading.current)?.focus(); setReload(value => value + 1); }} />}
    </section>;
}
