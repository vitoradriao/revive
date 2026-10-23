import React, { useEffect, useRef, useState } from 'react';
import { useOffline } from '../../contexts/OfflineContext';
import { defaultPreferences, mergeIndicatorOrder, resolvePrimary, validPreferences, visibleIndicators } from '../../utils/journeyPreferences';
import { fieldBase, glassSurface } from '../../utils/constants';
import Button from '../ui/Button';

export default function JourneyPreferences({ habits }) {
    const offline = useOffline();
    return <PreferencesEditor key={offline.accountKey || 'loading'} offline={offline} habits={habits} />;
}
function PreferencesEditor({ offline, habits }) {
    const { client, accountKey, preferences, localOnly, loading } = offline;
    const draftKey = 'revive-journey-draft:' + accountKey;
    const [draft, setDraft] = useState(() => {
        try {
            const stored = JSON.parse(sessionStorage.getItem(draftKey));
            if (validPreferences(stored?.values)) return { ...stored, review: true };
        } catch { /* Uma cópia ilegível não substitui as preferências sincronizadas. */ }
        return null;
    });
    const [remote, setRemote] = useState(null), [error, setError] = useState(''), [message, setMessage] = useState('');
    const [busy, setBusy] = useState(false), [consulted, setConsulted] = useState(false);
    const alive = useRef(false), inFlight = useRef(false), orderList = useRef(null), movedButton = useRef(null);
    const current = draft?.values || preferences || defaultPreferences();
    useEffect(() => {
        const moved = movedButton.current;
        if (!moved) return;
        const row = orderList.current?.querySelector(`[data-preference-indicator="${moved.id}"]`);
        const requested = row?.querySelector(`[data-direction="${moved.offset}"]`);
        (requested && !requested.disabled ? requested : row?.querySelector('button:not(:disabled)'))?.focus();
        movedButton.current = null;
    }, [current.indicator_order]);
    useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
    useEffect(() => {
        if (!accountKey || loading || localOnly || !client.preferences) return;
        let cancelled = false;
        const read = async () => {
            try {
                await client.preferences(null, accountKey);
                if (!cancelled) { setConsulted(true); setError(''); }
            } catch (caught) { if (!cancelled) setError(caught.message); }
        };
        void read(); window.addEventListener('focus', read);
        return () => { cancelled = true; window.removeEventListener('focus', read); };
    }, [accountKey, client, loading, localOnly]);
    const persist = next => {
        setDraft(next); setMessage('');
        try { sessionStorage.setItem(draftKey, JSON.stringify(next)); return true; }
        catch { setError('Não foi possível preservar as escolhas nesta aba. Mantenha a página aberta e tente novamente.'); return false; }
    };
    const change = patch => { setError(''); persist({ values: { ...current, ...patch }, review: draft?.review || false }); };
    const move = (id, offset) => {
        const visible = visibleIndicators(current.indicator_order), index = visible.findIndex(item => item.id === id);
        const order = mergeIndicatorOrder(current.indicator_order), from = order.indexOf(id), to = order.indexOf(visible[index + offset].id);
        movedButton.current = { id, offset };
        [order[from], order[to]] = [order[to], order[from]];
        change({ indicator_order: order });
        setMessage(`${visible[index].label}: posição ${index + offset + 1} de ${visible.length}.`);
    };
    const run = async readOnly => {
        if (inFlight.current) return;
        inFlight.current = true; setBusy(true); setError(''); setMessage('');
        try {
            // Marcador anterior ao PATCH: resposta perdida ou reload exige consulta, sem repetição automática.
            if (!readOnly && !persist({ values: current, review: true })) return;
            const input = { revision: current.revision, indicator_order: current.indicator_order };
            if (current.primary_habit_id !== (preferences?.primary_habit_id ?? null)) input.primary_habit_id = current.primary_habit_id;
            const result = await client.preferences(readOnly ? null : input, accountKey);
            if (!alive.current) return;
            if (readOnly) { setRemote(result); setConsulted(true); setMessage('Versão atual consultada. Revise as escolhas antes de reaplicar.'); }
            else { sessionStorage.removeItem(draftKey); setDraft(null); setRemote(null); setMessage('Preferências confirmadas no servidor.'); }
        } catch (caught) {
            if (!alive.current) return;
            setError(caught.message);
            if (!readOnly) setRemote(null);
        } finally { inFlight.current = false; if (alive.current) setBusy(false); }
    };
    const { needsReview } = resolvePrimary(preferences, habits);
    const disabled = busy || loading || !accountKey;
    return <section aria-label="Preferências da Jornada" className={`${glassSurface} rounded-3xl p-6 space-y-4`}>
        <h2 className="text-2xl font-bold">Preferências da Jornada</h2>
        <p>Escolha o hábito principal e a ordem dos indicadores. A escolha manual do check-in continua valendo enquanto estiver disponível.</p>
        <p role="status">{loading ? 'Carregando preferências…' : localOnly ? preferences ? 'Offline: última configuração sincronizada. Alterações exigem conexão.' : 'Offline: sem configuração sincronizada; exibindo padrão.' : !consulted ? 'Consultando preferências…' : 'Configuração sincronizada disponível.'}</p>
        {needsReview && <p role="status">Principal arquivado ou indisponível. Usando o primeiro hábito ativo disponível; revise sua preferência.</p>}
        <fieldset disabled={disabled || localOnly} className="space-y-4">
            <label htmlFor="journey-primary-habit" className="block space-y-2">Hábito principal
                <select id="journey-primary-habit" className={fieldBase} value={current.primary_habit_id || ''} onChange={event => change({ primary_habit_id: event.target.value || null })}>
                    <option value="">Padrão: primeiro hábito ativo disponível</option>
                    {habits.map(habit => <option key={habit.id} value={habit.id} disabled={habit.ativo === false}>{habit.nome_vicio}{habit.ativo === false ? ' (arquivado)' : ''}</option>)}
                </select>
            </label>
            {!habits.some(habit => habit.ativo !== false) && <p>Nenhum hábito ativo. Adicione ou reative um hábito para escolher o principal.</p>}
            <ol ref={orderList} aria-label="Ordem dos indicadores" className="space-y-2">
                {visibleIndicators(current.indicator_order).map((item, index, rows) => <li key={item.id} data-preference-indicator={item.id} className="flex flex-wrap items-center gap-3">
                    <span>{index + 1}. {item.label}</span>
                    <Button data-direction="-1" disabled={index === 0} aria-label={`Subir ${item.label}`} onClick={() => move(item.id, -1)}>Subir</Button>
                    <Button data-direction="1" disabled={index === rows.length - 1} aria-label={`Descer ${item.label}`} onClick={() => move(item.id, 1)}>Descer</Button>
                </li>)}
            </ol>
            <Button onClick={() => change({ indicator_order: defaultPreferences().indicator_order })}>Restaurar ordem padrão</Button>
        </fieldset>
        <div className="flex flex-wrap gap-3">
            <Button disabled={disabled || localOnly || !draft || draft.review || !consulted} onClick={() => run(false)}>Salvar preferências</Button>
            <Button disabled={disabled || localOnly} onClick={() => run(true)}>Consultar preferências atuais</Button>
        </div>
        {draft?.review && <div role="region" aria-label="Revisar preferências" className="space-y-3">
            <p>Escolhas locais preservadas. Consulte a versão atual antes de salvar novamente.</p>
            {remote && <>
                <p>Versão atual: revisão {remote.revision}. Principal: {habits.find(habit => habit.id === remote.primary_habit_id)?.nome_vicio || 'Padrão ou indisponível'}.</p>
                <ol aria-label="Ordem atual no servidor">{visibleIndicators(remote.indicator_order).map(item => <li key={item.id}>{item.label}</li>)}</ol>
                <Button disabled={disabled || localOnly} onClick={() => {
                    persist({ values: { ...current, revision: remote.revision, intro: remote.intro,
                        indicator_order: mergeIndicatorOrder([...current.indicator_order, ...remote.indicator_order]) }, review: false });
                    setRemote(null);
                }}>Manter escolhas locais e revisar com esta versão</Button>
                <Button disabled={disabled || localOnly} onClick={() => { sessionStorage.removeItem(draftKey); setDraft(null); setRemote(null); }}>Usar versão do servidor</Button>
            </>}
        </div>}
        {error && <p role="alert">{error}</p>}
        <p role="status" aria-live="polite">{message}</p>
    </section>;
}
