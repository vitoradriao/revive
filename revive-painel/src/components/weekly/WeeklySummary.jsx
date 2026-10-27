import React, { useEffect, useState } from 'react';
import { useOffline } from '../../contexts/OfflineContext';
import { deviceTimezone, displayZonedMoment } from '../../utils/urge-time';
import { weekStart, weekEnd, displayCivil } from '../../utils/weeklySummary';
import { fieldBase, glassSurface } from '../../utils/constants';
import Button from '../ui/Button';
import RecordEditor from '../diary/RecordEditor';
import UrgeContent from '../urges/UrgeContent';

function SourceDetail({ client, accountKey, source, timezone }) {
    const [state, setState] = useState({ loading: true });
    useEffect(() => {
        let active = true;
        client.weeklySource(source.type, source.id, accountKey).then(result => {
            if (active) setState({ record: result.registro });
        }, () => { if (active) setState({ error: 'Não foi possível abrir a origem. Conecte-se e tente novamente.' }); });
        return () => { active = false; };
    }, [client, accountKey, source.id, source.type]);
    if (state.loading) return <p role="status">Abrindo origem…</p>;
    if (state.error) return <p role="alert">{state.error}</p>;
    const record = state.record;
    return source.type === 'vontades' ? <UrgeContent event={{ ...record, timezone: record.timezone || timezone }} />
        : <article className="border rounded-xl p-3"><h4>Recaída registrada</h4><p>{displayZonedMoment(/(?:z|[+-]\d{2}:?\d{2})$/i.test(record.data_recaida) ? record.data_recaida : record.data_recaida + 'Z', timezone)} · {timezone}</p>{record.motivo && <p className="whitespace-pre-wrap">{record.motivo}</p>}</article>;
}
function SummaryResult({ summary, result, onOrigin }) {
    const s = summary;
    const link = (type, ids, label) => <a href="#weekly-origins" className="underline" onClick={() => onOrigin({ type, ids })}>{label}</a>;
    const metrics = [
        ['Dias distintos com check-in', `${s.dias_checkin.valor} de ${s.dias_checkin.denominador} dias observados`, 'registros', s.dias_checkin.ids],
        ['Episódios de vontade', s.episodios.quantidade, 'vontades', s.episodios.ids],
        ['Intensidade média (0 a 10)', s.intensidade.media == null ? 'Não informada' : s.intensidade.media.toLocaleString('pt-BR'), 'vontades', s.intensidade.ids],
        ['Recaídas registradas', s.recaidas.quantidade, 'recaidas', s.recaidas.ids],
    ];
    return <>
        <p className="font-semibold">{s.parcial ? 'Semana parcial: o período ainda está em andamento.' : 'Semana encerrada.'}</p>
        <p>Atualizado em <time dateTime={s.atualizado_em}>{displayZonedMoment(s.atualizado_em, s.timezone)}</time> · {s.timezone}</p>
        {(result.offline || result.error) && <p role="status">{result.offline ? 'Offline. ' : ''}Último resumo consolidado, com a data acima.</p>}
        {result.stale && <p role="status">Há confirmações posteriores a esta cópia. O consolidado aguarda atualização.</p>}
        <p>Cobertura: todas as páginas da consulta foram carregadas na data indicada. {s.cobertura.registros} check-ins, {s.cobertura.episodios} episódios de vontade e {s.cobertura.recaidas} recaídas.</p>
        <p>Intensidade informada: {s.intensidade.denominador} de {s.intensidade.total} episódios. Gatilhos estruturados: {s.cobertura.gatilhos_estruturados} de {s.episodios.quantidade} episódios. Humor categorizado: {s.cobertura.humor_categorizado} de {s.cobertura.registros} check-ins.</p>
        {!s.cobertura.registros && !s.episodios.quantidade && !s.recaidas.quantidade && <p>Nenhum registro nesta semana. Lacunas não confirmam ausência de eventos.</p>}
        <table className="w-full text-left"><caption className="text-left font-semibold">Indicadores e registros de origem</caption><thead><tr><th scope="col">Indicador</th><th scope="col">Valor</th><th scope="col">Origem</th></tr></thead><tbody>
            {metrics.map(([label, value, type, ids]) => <tr key={label}><th scope="row">{label}</th><td>{value}</td><td>{link(type, ids, `Ver origem: ${label.toLowerCase()}`)}</td></tr>)}
        </tbody></table>
        <ul>{s.frases.map(phrase => <li key={phrase.codigo}><span>{phrase.texto}</span> {link(phrase.origem.tipo, phrase.origem.ids, 'Ver registros da observação')}</li>)}</ul>
        <p>{s.comparacao.texto}</p>
        {s.comparacao.status === 'disponivel' && <p>Semana anterior: {displayCivil(s.comparacao.anterior.intervalo.inicio)} a {displayCivil(s.comparacao.anterior.intervalo.fim)}. {link('anterior', [], 'Ver origens da comparação')}</p>}
        <div className="space-y-3" aria-label="Gatilhos por episódio">
            <h3 className="font-semibold">Gatilhos por episódio registrado</h3>
            <div aria-hidden="true" className="space-y-2">{s.gatilhos.map(row => <div key={row.codigo}><span>{row.rotulo}: {row.quantidade}/{row.denominador}</span><div className="h-3 bg-violet-500 rounded" style={{ width: `${row.denominador ? row.quantidade / row.denominador * 100 : 0}%` }} /></div>)}</div>
            <table className="w-full text-left"><caption className="text-left">Alternativa textual ao gráfico de gatilhos</caption><thead><tr><th scope="col">Gatilho</th><th scope="col">Episódios com gatilho / total</th><th scope="col">Origem</th></tr></thead><tbody>
                {s.gatilhos.map(row => <tr key={row.codigo}><th scope="row">{row.rotulo}</th><td>{row.quantidade} de {row.denominador}</td><td>{link('vontades', row.ids, `Ver episódios: ${row.rotulo}`)}</td></tr>)}
            </tbody></table>
            {!s.gatilhos.length && <p>Nenhum gatilho estruturado registrado. Campos livres do diário não são categorizados.</p>}
        </div>
        <table className="w-full text-left"><caption className="text-left font-semibold">Humores por catálogo explícito</caption><thead><tr><th scope="col">Humor</th><th scope="col">Check-ins / total</th><th scope="col">Origem</th></tr></thead><tbody>
            {s.humores.map(row => <tr key={row.codigo}><th scope="row">{row.rotulo}</th><td>{row.quantidade} de {row.denominador}</td><td>{link('registros', row.ids, `Ver check-ins: ${row.rotulo}`)}</td></tr>)}
        </tbody></table>
        <p className="text-sm text-muted">As contagens descrevem registros, sem previsão, tendência ou causalidade. Dias sem check-in não comprovam abstinência. Texto livre permanece não categorizado.</p>
    </>;
}
function SummaryQuery({ filters, accountKey, offline }) {
    const { client, receipts = [], snapshot, loading, localOnly, queue = [] } = offline;
    const [result, setResult] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(true), [reload, setReload] = useState(0);
    const [origin, setOrigin] = useState(null), [source, setSource] = useState(null);
    const version = JSON.stringify(receipts.filter(row => row.kind === 'confirmed').map(row => row.key));
    const snapshotVersion = snapshot?.updatedAt;
    const { vicio_id: habitId, semana: week, timezone } = filters;
    useEffect(() => {
        const controller = new AbortController();
        setBusy(true); setError('');
        if (!loading && accountKey && habitId) {
            client.weeklySummary({ vicio_id: habitId, semana: week, timezone }, accountKey, { signal: controller.signal }).then(next => {
                if (!controller.signal.aborted) setResult(next);
            }, () => { if (!controller.signal.aborted) { setResult(null); setError('Não foi possível consultar o resumo semanal. Tente atualizar.'); } })
                .finally(() => { if (!controller.signal.aborted) setBusy(false); });
        }
        return () => controller.abort();
    }, [accountKey, client, habitId, week, timezone, loading, localOnly, reload, version, snapshotVersion]);
    const summary = result?.summary;
    const knownRecords = snapshot?.data?.registros || [];
    const pending = queue.filter(row => row.payload?.vicio_id === habitId || row.payload?.addictionId === habitId
        || row.type === 'record.update' && knownRecords.some(record => record.id === row.payload.recordId && record.vicio_id === habitId));
    const originRows = origin?.type === 'anterior' ? null : (summary?.origens[origin?.type] || []).filter(row => origin?.ids.includes(row.id));
    const openOrigin = next => { setOrigin(next); setSource(null); };
    return <>
        <p role="status">{busy ? 'Carregando resumo semanal…' : !summary ? localOnly || result?.offline ? 'Offline. Nenhum resumo salvo para esta consulta.' : 'Resumo indisponível.' : 'Resumo semanal disponível.'}</p>
        <p role="status">{pending.length} pendência(s) deste hábito na fila, separadas do consolidado. A fila pode conter registros de outros períodos.</p>
        {(error || result?.error) && <p role="alert">{error || result.error}</p>}
        <Button disabled={busy} onClick={() => setReload(value => value + 1)}>Atualizar resumo semanal</Button>
        {summary && <SummaryResult summary={summary} result={result} onOrigin={openOrigin} />}
        {origin && summary && <section id="weekly-origins" aria-label="Registros de origem" className="border rounded-xl p-4 space-y-3" tabIndex={-1}>
            <h3 className="font-semibold">Registros de origem</h3>
            <p>Filtros: {summary.origens.filtros.vicio_id} · {displayCivil(origin.type === 'anterior' ? summary.comparacao.anterior.intervalo.inicio : filters.semana)} · {timezone}. IDs identificam os registros que sustentam o indicador.</p>
            {origin.type === 'anterior' ? <ul>{['registros', 'vontades', 'recaidas'].flatMap(type => summary.comparacao.anterior.origens[type].map(row => <li key={type + row.id}><Button onClick={() => setSource({ type, id: row.id })}>Abrir {type}: {row.id}</Button></li>))}</ul> : <>
                {!originRows.length && <p>Nenhum registro sustenta este indicador no período.</p>}
                <ul>{originRows.map(row => <li key={row.id}><Button onClick={() => setSource({ type: origin.type, id: row.id })}>Abrir {origin.type} de {origin.type === 'registros' ? displayCivil(row.data) : displayZonedMoment(/(?:z|[+-]\d{2}:?\d{2})$/i.test(row.data) ? row.data : row.data + 'Z', timezone)} · {row.id}</Button></li>)}</ul>
            </>}
            {source?.type === 'registros' ? <RecordEditor key={accountKey + source.id} accountKey={accountKey} recordId={source.id} onClose={() => { setSource(null); setReload(value => value + 1); }} />
                : source && <SourceDetail key={source.type + source.id} client={client} accountKey={accountKey} source={source} timezone={timezone} />}
        </section>}
    </>;
}
export default function WeeklySummary({ habits = [] }) {
    const offline = useOffline(), { accountKey } = offline;
    const [selection, setSelection] = useState({}), [offset, setOffset] = useState(0), [timezone, setTimezone] = useState(deviceTimezone);
    const habitId = selection.accountKey === accountKey && habits.some(row => row.id === selection.id) ? selection.id : habits[0]?.id || '';
    const start = weekStart(timezone, offset);
    return <section aria-label="Resumo semanal" className={`${glassSurface} rounded-3xl p-6 space-y-4`}>
        <h2 className="text-2xl font-bold">Resumo semanal</h2>
        <div className="flex flex-wrap gap-3">
            <label>Hábito do resumo<select className={fieldBase} value={habitId} onChange={event => setSelection({ accountKey, id: event.target.value })}>
                {!habits.length && <option value="">Nenhum hábito disponível</option>}
                {habits.map(row => <option key={row.id} value={row.id}>{row.nome_vicio}{row.ativo === false ? ' (arquivado)' : ''}</option>)}
            </select></label>
            <label>Semana<select aria-label="Semana" className={fieldBase} value={offset} onChange={event => setOffset(Number(event.target.value))}><option value={0}>Semana atual</option><option value={-1}>Semana anterior</option></select></label>
            <label>Fuso horário IANA<input className={fieldBase} value={timezone} onChange={event => setTimezone(event.target.value)} list="weekly-timezones" /></label>
            <datalist id="weekly-timezones"><option value="America/Sao_Paulo" /><option value="UTC" /><option value="America/New_York" /></datalist>
        </div>
        {start ? <p>De {displayCivil(start)} a {displayCivil(weekEnd(start))} · segunda a domingo · {timezone}</p> : <p role="alert">Informe um fuso IANA válido.</p>}
        {!habitId ? <p>Selecione um hábito para consultar o resumo.</p> : start && <SummaryQuery key={JSON.stringify([accountKey, habitId, start, timezone])} filters={{ vicio_id: habitId, semana: start, timezone }} accountKey={accountKey} offline={offline} />}
    </section>;
}
