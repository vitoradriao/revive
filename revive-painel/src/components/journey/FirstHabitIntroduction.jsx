import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useOffline } from '../../contexts/OfflineContext';
import { INTRO_VERSION, shouldIntroduce } from '../../utils/introduction';
import { glassSurface } from '../../utils/constants';
import Button from '../ui/Button';
import NovoVicioWizard from '../modals/NovoVicioWizard';
import HabitManagement from '../habits/HabitManagement';

export default function FirstHabitIntroduction({ review = false }) {
    const offline = useOffline();
    return <Introduction key={offline.accountKey || 'loading'} offline={offline} review={review} />;
}

function Introduction({ offline, review }) {
    const navigate = useNavigate();
    const { client, accountKey, preferences, snapshot, localOnly, loading } = offline;
    const data = snapshot?.data, intro = preferences?.intro;
    const [opened, setOpened] = useState(false), [hidden, setHidden] = useState(false), [wizard, setWizard] = useState(false);
    const [marker, setMarker] = useState(null), [ready, setReady] = useState(false), [busy, setBusy] = useState(false);
    const [error, setError] = useState(''), [reviewRequired, setReviewRequired] = useState(false);
    const alive = useRef(false), inFlight = useRef(false), heading = useRef(null);
    useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
    useEffect(() => {
        if (loading || !accountKey || !client.introduction) return;
        let cancelled = false;
        const load = async () => {
            try {
                const local = await client.introduction('read', null, accountKey);
                if (!cancelled) setMarker(local);
                if (!localOnly) await client.preferences(null, accountKey);
                if (!cancelled) setReady(true);
            } catch (caught) { if (!cancelled) setError(caught.message); }
        };
        void load();
        return () => { cancelled = true; };
    }, [accountKey, client, loading, localOnly]);

    const visible = review ? opened : !hidden && shouldIntroduce(preferences, data);
    const habitId = intro?.habit_id || marker?.habitId;
    const habit = data?.vicios.find(item => item.id === habitId);
    const step = habitId && (!intro?.step || intro.step === 'habit') ? 'reason' : intro?.step || 'habit';
    const readOnly = intro?.version > INTRO_VERSION || (intro?.state !== 'pending' && !!intro);
    const disabled = busy || !ready || loading || localOnly || !preferences;

    const consult = async () => {
        if (inFlight.current) return;
        inFlight.current = true; setBusy(true); setError('');
        try {
            await client.refresh();
            const local = await client.introduction('read', null, accountKey);
            await client.preferences(null, accountKey);
            if (!alive.current) return;
            setMarker(local); setReady(true); setReviewRequired(false);
        } catch (caught) { if (alive.current) setError(caught.message); }
        finally { inFlight.current = false; if (alive.current) setBusy(false); }
    };
    const advance = async (nextStep, state = 'pending', selectedId = habitId) => {
        if (inFlight.current || readOnly) return false;
        inFlight.current = true; setBusy(true); setError('');
        try {
            await client.preferences({ revision: preferences.revision, intro: {
                version: INTRO_VERSION, state, step: nextStep,
                ...(nextStep !== 'habit' ? { habit_id: selectedId } : {}),
            } }, accountKey);
            if (!alive.current) return false;
            setReviewRequired(false);
            if (state !== 'pending') {
                setHidden(true); setOpened(false);
                if (review) navigate('/');
                else document.getElementById('journey-content')?.focus();
            }
            else heading.current?.focus();
            return true;
        } catch (caught) {
            if (alive.current) { setError(caught.message); setReviewRequired(true); }
            return false;
        } finally { inFlight.current = false; if (alive.current) setBusy(false); }
    };
    const create = async payload => {
        const response = await client.introduction('createHabit', payload, accountKey);
        if (!alive.current) return;
        setMarker({ status: 'confirmed', habitId: response.vicio.id });
        // A falha deste checkpoint nunca transforma o cadastro confirmado em um novo POST.
        await advance('reason', 'pending', response.vicio.id);
    };
    const leave = () => {
        setHidden(true); setOpened(false);
        if (review) navigate('/');
        else document.getElementById('journey-content')?.focus();
    };

    if (review && !opened) return <section className={`${glassSurface} rounded-3xl p-6 space-y-3`} aria-label="Introdução à Jornada">
        <h2 className="text-xl font-bold">Introdução à Jornada</h2>
        <p>Reveja as orientações sobre hábitos, motivo e check-in. Suas etapas confirmadas serão preservadas.</p>
        <Button onClick={() => setOpened(true)}>Rever introdução</Button>
    </section>;
    if (!visible) return null;
    return <section aria-label="Primeiros passos" className={`${glassSurface} min-w-0 rounded-3xl p-4 sm:p-6 space-y-4 [overflow-wrap:anywhere]`} aria-busy={busy}>
        <h2 ref={heading} tabIndex={-1} className="text-2xl font-bold">Um passo de cada vez</h2>
        <p>Cadastre o hábito que deseja acompanhar e registre como está. Seu histórico continua guardado quando um hábito é arquivado.</p>
        <p>Motivo, reflexão, economia e metas são opcionais. Você pode seguir para a Jornada a qualquer momento e rever estas orientações no Perfil.</p>
        <ol aria-label="Etapas da introdução" className="list-decimal pl-6">
            <li aria-current={!readOnly && step === 'habit' ? 'step' : undefined}>Cadastrar ou escolher um hábito{habitId ? ' · cadastro confirmado' : ''}</li>
            <li aria-current={!readOnly && step === 'reason' ? 'step' : undefined}>Motivo pessoal opcional</li>
            <li aria-current={!readOnly && step === 'checkin' ? 'step' : undefined}>Primeiro check-in, sem precisar escrever</li>
        </ol>
        <p role="status" aria-live="polite">{localOnly ? 'Offline: etapas remotas não foram alteradas. Os demais recursos da Jornada continuam disponíveis.' : !ready ? 'Consultando etapas confirmadas…' : readOnly ? 'Estado salvo preservado. Você está revendo as orientações.' : 'Etapas disponíveis. Suas escolhas acompanham sua conta após a confirmação.'}</p>
        {readOnly ? <>
            <p>Para um check-in, escolha uma sugestão de humor e salve. A confirmação do servidor pode chegar depois do salvamento neste navegador.</p>
            <Link to="/">Ir para a Jornada</Link>
        </> : <>
            {step === 'habit' && <div className="space-y-3">
                {!intro?.step && <Button disabled={disabled || reviewRequired} onClick={() => advance('habit')}>Começar introdução</Button>}
                {intro?.step === 'habit' && !data?.vicios.length && <Button disabled={disabled || reviewRequired || (marker && marker.status !== 'rejected')} onClick={() => setWizard(true)}>Cadastrar primeiro hábito</Button>}
                {marker?.status === 'creating' && <p role="status">O cadastro anterior não foi confirmado e pode ter sido salvo. Consulte os hábitos antes de continuar. Não há reenvio automático.</p>}
                {data?.vicios.map(item => <Button key={item.id} disabled={disabled || reviewRequired} onClick={() => advance('reason', 'pending', item.id)}>Continuar com {item.nome_vicio}{item.ativo === false ? ' (arquivado)' : ''}</Button>)}
            </div>}
            {habitId && !habit && <p role="status">Hábito confirmado indisponível nesta cópia. Consulte os dados; nenhum novo cadastro será enviado.</p>}
            {step === 'reason' && habit && <>
                <p>Hábito confirmado: {habit.nome_vicio}. Uma falha ao salvar o motivo preserva este cadastro.</p>
                <HabitManagement key={habit.id} habit={habit} accountKey={accountKey} reasonOnly onConfirmed={() => advance('checkin')} />
                <Button disabled={disabled || reviewRequired} onClick={() => advance('checkin')}>{habit.motivo_pessoal ? 'Continuar para check-in' : 'Pular motivo'}</Button>
            </>}
            {step === 'checkin' && <>
                <p>Escolha um humor no check-in rápido da Jornada. Nenhum texto é obrigatório. Registros e intenções anteriores são preservados; consulte a sincronização para confirmar o envio.</p>
                {habit?.ativo === false && <p>Este hábito está arquivado. Reative nos detalhes para novos registros.</p>}
                <Button onClick={() => { const target = document.getElementById('introduction-checkin'); if (target) { target.focus(); target.scrollIntoView(); } else navigate('/'); }}>Ir para check-in rápido</Button>
                <Button disabled={disabled || reviewRequired} onClick={() => advance('checkin', 'completed')}>Concluir introdução</Button>
            </>}
            <Button disabled={disabled || reviewRequired} onClick={() => advance(step, 'dismissed')}>Pular introdução e ir à Jornada</Button>
        </>}
        <div className="flex flex-wrap gap-3">
            <Button disabled={busy || loading || localOnly} onClick={consult}>Consultar etapas atuais</Button>
            <Button onClick={leave}>Continuar na Jornada</Button>
        </div>
        {reviewRequired && <p role="status">A etapa não foi confirmada. Consulte a versão atual e revise antes de continuar; não houve repetição do cadastro ou do check-in.</p>}
        {error && <p role="alert">{error}</p>}
        {wizard && <NovoVicioWizard isOpen allowUncertainRetry={false} onClose={() => { setWizard(false); heading.current?.focus(); }} onSubmit={create}
            onCheckHabits={async () => { await consult(); return client.getSnapshot().snapshot?.data.vicios || []; }} />}
    </section>;
}
