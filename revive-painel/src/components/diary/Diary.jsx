import React, { useEffect, useRef, useState } from 'react';
import { useOffline } from '../../contexts/OfflineContext';
import { listDiaryRecords } from '../../services/registros.service';
import { getLocalDateString } from '../../utils/goalProgress';
import { validateSearchTerm } from '../../utils/diarySearch';
import { mergeRecords } from '../../utils/diary';
import { fieldBase, glassSurface } from '../../utils/constants';
import RecordContent from './RecordContent';
import RecordEditor from './RecordEditor';
import Button from '../ui/Button';

export default function Diary({ habitId, accountKey, todayOnly = false }) {
    const { client, queue = [], localOnly, loading: storageLoading, snapshot } = useOffline();
    const snapshotVersion = snapshot?.updatedAt;
    const today = getLocalDateString();
    const [filters, setFilters] = useState({ inicio: todayOnly ? today : today.slice(0, 7) + '-01', fim: today, vicio_id: habitId, limit: 20, ...(!todayOnly ? { termo: '' } : {}) });
    const [inputs, setInputs] = useState(filters), [page, setPage] = useState(null), [selected, setSelected] = useState(null);
    const [busy, setBusy] = useState(false), [error, setError] = useState(''), [reload, setReload] = useState(0);
    const [allHistory, setAllHistory] = useState(false);
    const ticket = useRef(null), opener = useRef(null), heading = useRef(null), loadingMore = useRef(false);
    const queueKey = JSON.stringify(queue.map(item => [item.id, item.status]));
    const applyQuery = (nextInputs = inputs, history = allHistory) => {
        if (ticket.current) ticket.current.active = false;
        setPage(null); setSelected(null);
        setFilters({ ...nextInputs, ...(history ? { inicio: undefined, fim: undefined } : {}) });
    };
    useEffect(() => {
        if (storageLoading || !accountKey) { setBusy(true); return; }
        const request = { active: true };
        ticket.current = request;
        setBusy(true); setError(''); setPage(null);
        try { if ('termo' in filters) validateSearchTerm(filters.termo); }
        catch (caught) { setBusy(false); setError(caught.message); return () => { request.active = false; }; }
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
            if (request.active && request === ticket.current) setPage(previous => ({ ...result, partial: previous.partial || result.partial, records: result.restarted ? result.records : mergeRecords(previous.records, result.records) }));
        } catch (caught) { if (request.active && request === ticket.current) setError(caught.message); }
        finally { loadingMore.current = false; if (request.active && request === ticket.current) setBusy(false); }
    };
    return <section aria-label={todayOnly ? 'Registros de hoje' : 'Diário por período'} className={`${glassSurface} rounded-3xl p-6 space-y-4`}>
        <h2 ref={heading} tabIndex={-1} className="text-2xl font-bold">{todayOnly ? 'Registros de hoje' : 'Diário por período'}</h2>
        {!todayOnly && <form onSubmit={event => { event.preventDefault(); applyQuery(); }} className="flex flex-wrap items-end gap-3">
            <label className="w-full">Buscar no diário<input type="search" value={inputs.termo} aria-describedby="diary-search-help"
                onChange={event => {
                    const next = { ...inputs, termo: event.target.value };
                    setInputs(next); applyQuery(next);
                }} className={fieldBase} /></label>
            <p id="diary-search-help">Até 100 caracteres. Busca literal em humor, gatilhos, conquistas e observações, sem diferença de caixa ou acentos. HTML é texto.</p>
            <label><input type="checkbox" checked={allHistory} onChange={event => {
                const checked = event.target.checked; setAllHistory(checked);
                applyQuery(inputs, checked);
            }} /> Buscar em todo o histórico</label>
            <label>Início<input type="date" required disabled={allHistory} value={inputs.inicio} onChange={event => setInputs({ ...inputs, inicio: event.target.value })} className={fieldBase} /></label>
            <label>Fim<input type="date" required disabled={allHistory} value={inputs.fim} onChange={event => setInputs({ ...inputs, fim: event.target.value })} className={fieldBase} /></label>
            <Button type="submit">Consultar período</Button>
        </form>}
        <p role="status">{busy ? 'Consultando diário…' : error ? 'Consulta não concluída.' : localOnly ? 'Offline. Exibindo a cópia disponível neste navegador.' : 'Consulta do diário concluída.'}</p>
        {(page?.partial || page?.nextCursor) && <p role="status">Cobertura parcial: {page.partial ? 'a cópia local pode não conter todos os registros do período.' : 'há mais páginas neste período.'}</p>}
        {page?.restarted && <p role="status">A paginação remota foi reiniciada na cópia local disponível.</p>}
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
