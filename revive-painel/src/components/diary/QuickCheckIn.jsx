import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useOffline } from '../../contexts/OfflineContext';
import { createDiaryRecord, listDiaryRecords } from '../../services/registros.service';
import { getLocalDateString } from '../../utils/goalProgress';
import { recordValues } from '../../utils/diary';
import { fieldBase, glassSurface, moodOptions } from '../../utils/constants';
import Button from '../ui/Button';
import RecordFields from './RecordFields';
import Diary from './Diary';

export default function QuickCheckIn({ habits, full = false }) {
    const { accountKey } = useOffline();
    const [selected, setSelected] = useState('');
    const habit = habits.find(item => item.id === selected) || habits[0];
    return <section aria-label={full ? 'Novo registro diário' : 'Check-in rápido'} className={`${glassSurface} rounded-3xl p-6 space-y-4`}>
        <h2 className="text-2xl font-bold">{full ? 'Novo registro diário' : 'Check-in rápido'}</h2>
        {habits.length > 1 && <label>Hábito do check-in<select className={fieldBase} value={habit?.id || ''} onChange={event => setSelected(event.target.value)}>
            {habits.map(item => <option key={item.id} value={item.id}>{item.nome_vicio}</option>)}
        </select></label>}
        {!habit ? <p>Cadastre um hábito ativo para registrar como você está.</p> : <CheckInForm key={accountKey + ':' + habit.id} habit={habit} accountKey={accountKey} full={full} />}
    </section>;
}

function CheckInForm({ habit, accountKey, full }) {
    const { client, queue = [], receipts = [], localOnly, loading: storageLoading, snapshot } = useOffline();
    const snapshotVersion = snapshot?.updatedAt;
    const [values, setValues] = useState(() => recordValues()), [expanded, setExpanded] = useState(full);
    const [today, setToday] = useState(getLocalDateString), [another, setAnother] = useState(null), [consulting, setConsulting] = useState(false);
    const [result, setResult] = useState(null), [saved, setSaved] = useState(null), [error, setError] = useState('');
    const [busy, setBusy] = useState(false), [loading, setLoading] = useState(true);
    const inFlight = useRef(false), alive = useRef(false);
    const queueKey = JSON.stringify(queue.map(item => [item.id, item.status]));
    useEffect(() => {
        alive.current = true;
        const timer = setInterval(() => setToday(getLocalDateString()), 10000);
        return () => { alive.current = false; clearInterval(timer); };
    }, []);
    useEffect(() => {
        if (storageLoading || !accountKey) { setLoading(true); return; }
        let cancelled = false; setLoading(true); setError('');
        listDiaryRecords(client, accountKey, { inicio: today, fim: today, vicio_id: habit.id, limit: 100 }).then(page => {
            if (!cancelled) setResult(page);
        }, caught => { if (!cancelled) setError(caught.message); }).finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [accountKey, client, habit.id, today, queueKey, localOnly, storageLoading, snapshotVersion]);
    const hasToday = result?.records.length > 0 || saved?.payload.data_registro === today;
    const save = async event => {
        event.preventDefault();
        if (inFlight.current) return;
        const day = getLocalDateString(); setToday(day);
        inFlight.current = true; setBusy(true); setError('');
        try {
            const intent = await createDiaryRecord(client, accountKey, values, habit.id, another);
            if (!alive.current) return;
            setSaved(intent); setValues(recordValues()); setAnother(null);
        } catch (caught) { if (alive.current) setError(caught.message); }
        finally { inFlight.current = false; if (alive.current) setBusy(false); }
    };
    const pending = saved && queue.find(item => item.id === saved.id);
    const confirmed = saved && receipts.some(item => item.key === saved.id && item.kind === 'confirmed');
    return <div className="space-y-4">
        <p>Hábito: {habit.nome_vicio} · dia local {today.split('-').reverse().join('/')}</p>
        <p role="status">{loading ? 'Consultando registros de hoje…' : hasToday ? 'Já existe registro para este hábito hoje.' : 'Nenhum registro de hoje nos dados disponíveis.'}</p>
        {(localOnly || result?.partial) && <p role="status">Cobertura local parcial. Pode haver registros ainda não consultados.</p>}
        {result?.error && <p role="alert">{result.error}</p>}
        <Button disabled={busy} aria-expanded={consulting} onClick={() => setConsulting(value => !value)}>{consulting ? 'Ocultar registros de hoje' : 'Consultar registros de hoje'}</Button>
        {consulting && <Diary key={accountKey + habit.id + today} habitId={habit.id} accountKey={accountKey} todayOnly />}
        {hasToday && another !== today && <Button disabled={busy || habit.ativo === false} onClick={() => { setAnother(today); setError(''); }}>Adicionar outro registro hoje</Button>}
        <form onSubmit={save} className="space-y-4">
            <fieldset disabled={busy || loading || habit.ativo === false || (hasToday && another !== today)} className="space-y-4">
                <div role="group" aria-label="Sugestões de humor" className="flex flex-wrap gap-2">
                    {moodOptions.map(mood => <Button key={mood.value} type="button" aria-pressed={values.humor === mood.value} onClick={() => setValues({ ...values, humor: mood.value })}>{mood.label}</Button>)}
                </div>
                <RecordFields values={values} quick={!expanded} onChange={(key, value) => setValues({ ...values, [key]: value })} />
                {!full && <Button type="button" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>{expanded ? 'Recolher reflexão opcional' : 'Adicionar reflexão opcional'}</Button>}
                <Button type="submit" disabled={!values.humor.trim()}>{full ? 'Salvar registro' : 'Salvar check-in'}</Button>
            </fieldset>
        </form>
        {error && <p role="alert">{error}</p>}
        {saved && <p role="status">{confirmed ? 'Registro confirmado no servidor.' : pending?.status === 'recovery' || pending?.status === 'retry' ? 'Salvo neste navegador. O envio falhou; consulte a sincronização.' : pending ? 'Salvo neste navegador · confirmação pendente' : 'Intenção salva. Consulte o diário para verificar o resultado.'}</p>}
        <Link to="/sincronizacao" className="underline">Ver pendências de sincronização</Link>
    </div>;
}
