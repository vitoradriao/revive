import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useOffline } from '../../contexts/OfflineContext';
import { createUrgeEvent } from '../../services/vontades.service';
import { civilTimeToInstant, dateTimeInZone, deviceTimezone } from '../../utils/urge-time';
import { URGE_TRIGGER_CATALOG, urgeTriggerLabel } from '../../utils/urge-triggers';
import { InputField, TextAreaField } from '../ui/Field';
import Button from '../ui/Button';
import { glassSurface } from '../../utils/constants';

const newUrgeDraft = () => {
    const instant = new Date().toISOString(), timezone = deviceTimezone();
    const initial = { instant, timezone, ...dateTimeInZone(instant, timezone) };
    return { eventId: crypto.randomUUID(), initial, date: initial.date, time: initial.time, intensity: '', triggers: [], note: '', action: '', result: '' };
};
export default function UrgeForm({ habit, accountKey }) {
    const { client, queue = [], receipts = [] } = useOffline();
    const [draft, setDraft] = useState(newUrgeDraft), [ready, setReady] = useState(false);
    const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [savedId, setSavedId] = useState(null);
    const limitId = React.useId();
    const active = useRef(false), inFlight = useRef(false), intensityRef = useRef(null);
    useEffect(() => {
        active.current = true;
        client.getUrgeDraft(habit.id, accountKey).then(value => {
            if (active.current) { if (value) setDraft(value); setReady(true); }
        }, error => { if (active.current) setMessage(error.message); });
        return () => { active.current = false; };
    }, [accountKey, client, habit.id]);
    const pending = queue.find(item => item.id === draft.eventId);
    const receipt = receipts.find(item => item.key === draft.eventId);
    const saved = Boolean(pending || receipt || savedId === draft.eventId);
    const change = patch => {
        const next = { ...draft, ...patch }; setDraft(next); setMessage('Gravando rascunho…');
        void client.saveUrgeDraft(habit.id, next, accountKey).then(() => {
            if (active.current) setMessage('Rascunho salvo neste navegador.');
        }, error => { if (active.current) setMessage(error.message); });
    };
    const submit = async event => {
        event.preventDefault();
        if (inFlight.current || saved || habit.ativo === false) return;
        const occurred_at = draft.date === draft.initial.date && draft.time === draft.initial.time ? draft.initial.instant : civilTimeToInstant(draft.date, draft.time, draft.initial.timezone);
        if (!occurred_at) return setMessage('Informe data e horário válidos. Horários inexistentes ou repetidos na mudança de fuso são recusados.');
        if (!/^\d{1,2}$/.test(draft.intensity)) { intensityRef.current?.focus(); return setMessage('Use uma intensidade inteira de 0 a 10.'); }
        // The initial instant remains fixed while the form is open; future scheduling is unavailable.
        if (Date.parse(occurred_at) > Date.now()) return setMessage('Escolha o momento atual ou um episódio passado. Não é possível agendar vontades.');
        inFlight.current = true; setBusy(true); setMessage('');
        try {
            const intent = await createUrgeEvent(client, accountKey, { vicio_id: habit.id, occurred_at, timezone: draft.initial.timezone,
                intensidade: Number(draft.intensity), gatilhos: draft.triggers, nota: draft.note, acao_realizada: draft.action, resultado: draft.result }, draft);
            if (active.current) { setSavedId(intent.id); setMessage('Vontade salva neste navegador; aguardando confirmação.'); }
        } catch (error) { if (active.current) setMessage(error.message); }
        finally { inFlight.current = false; if (active.current) setBusy(false); }
    };
    const status = receipt?.kind === 'replaced' ? 'Esta intenção foi preservada na recuperação de um rascunho. Reabra os detalhes para revisar o novo envio.' : receipt?.kind === 'confirmed' ? 'Vontade confirmada no servidor. O contador não foi reiniciado.' : receipt?.kind === 'discarded' ? 'Envio descartado na Sincronização. Não há confirmação local deste envio.' : pending ? ['retry', 'recovery'].includes(pending.status) ? 'Falha na sincronização. A intenção e a chave foram preservadas; resolva na Sincronização.' : 'Vontade salva neste navegador; aguardando confirmação.' : message;
    return <section aria-label="Registrar vontade" className={`${glassSurface} rounded-3xl p-6 space-y-4`}>
        <h2 className="text-2xl font-bold">Registrar vontade</h2>
        <p>Este registro é descritivo: não cria recaída e não reinicia o contador.</p>
        {habit.ativo === false && <p role="status">Hábito arquivado. Seu rascunho foi preservado; reative o hábito para registrar novos eventos.</p>}
        <form onSubmit={submit} noValidate className="space-y-4">
            <fieldset disabled={!ready || busy || saved || habit.ativo === false} className="space-y-4">
                <label className="block">Intensidade (0 a 10)<input ref={intensityRef} className="block border rounded-xl p-3 bg-transparent" type="number" min="0" max="10" step="1" required value={draft.intensity} onChange={event => change({ intensity: event.target.value })} /></label>
                <fieldset className="flex flex-wrap gap-4"><legend>Gatilhos (opcional, até 10)</legend>
                    {[...URGE_TRIGGER_CATALOG, ...draft.triggers.filter(code => !URGE_TRIGGER_CATALOG.some(row => row.code === code)).map(code => ({ code, label: urgeTriggerLabel(code) }))].map(({ code, label }) => <label key={code} className="flex items-center gap-2 min-h-11"><input type="checkbox" checked={draft.triggers.includes(code)} onChange={() => change({ triggers: draft.triggers.includes(code) ? draft.triggers.filter(item => item !== code) : [...draft.triggers, code] })} />{label}</label>)}
                </fieldset>
                <div className="grid sm:grid-cols-2 gap-4">
                    <InputField label="Data do episódio" type="date" value={draft.date} max={dateTimeInZone(new Date(), draft.initial.timezone).date} onChange={event => change({ date: event.target.value })} />
                    <InputField label="Horário do episódio" type="time" value={draft.time} onChange={event => change({ time: event.target.value })} />
                </div>
                <p>Fuso deste registro: {draft.initial.timezone}. O momento inicial foi definido ao abrir o formulário; ajuste para relatar o passado. Horários repetidos ou inexistentes na mudança de horário de verão são recusados, sem ajuste silencioso.</p>
                {[['note', 'Nota (opcional)'], ['action', 'Ação realizada (opcional)'], ['result', 'Resultado (opcional)']].map(([key, label]) => <TextAreaField key={key} label={label} aria-describedby={limitId} value={draft[key]} maxLength={1000} onChange={event => change({ [key]: event.target.value })} />)}
                <p id={limitId}>Cada campo opcional aceita até 1000 caracteres.</p>
                <Button type="submit" disabled={!ready || busy || saved || habit.ativo === false}>Salvar vontade</Button>
            </fieldset>
        </form>
        <p role="status" aria-live="polite">{!ready ? message || 'Carregando rascunho…' : status}</p>
        {saved && <><Link className="underline" to="/sincronizacao">Ver Sincronização</Link><Button disabled={busy || habit.ativo === false} onClick={() => { const next = newUrgeDraft(); setSavedId(null); change(next); requestAnimationFrame(() => intensityRef.current?.focus()); }}>Registrar outra vontade</Button></>}
    </section>;
}
