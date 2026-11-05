import React, { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useOffline } from '../../contexts/OfflineContext';
import { createHabitDraft, habitEditPatch } from '../../utils/habitEdit';
import { localDateKey } from '../../utils/habitForm';
import { fieldBase, glassSurface } from '../../utils/constants';
import Button from '../ui/Button';
import { personalReasonLength } from '../../utils/personalReason';

export default function HabitManagement({ habit, accountKey, reasonOnly = false, onConfirmed }) {
    const { client, localOnly } = useOffline();
    const reasonId = useId();
    const [draft, setDraft] = useState(null);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [saving, setSaving] = useState(false);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const draftId = useRef(null), alive = useRef(false), inFlight = useRef(false);
    const writes = useRef(Promise.resolve()), latest = useRef(null);
    const dialog = useRef(null), archiveButton = useRef(null);
    const initialHabit = useRef(habit);
    useEffect(() => {
        alive.current = true;
        let cancelled = false;
        const load = async () => {
            try {
                // Somente o identificador fica na sessão da aba; o conteúdo fica no banco da conta.
                const key = (reasonOnly ? 'revive-introduction-reason:' : 'revive-habit-editor:') + accountKey.split(':')[0] + ':' + initialHabit.current.id;
                const priorId = sessionStorage.getItem(key);
                const stored = priorId ? await client.getHabitDraft(priorId, accountKey) : null;
                if (cancelled) return;
                const next = stored || createHabitDraft(initialHabit.current);
                // Uma aba duplicada herda sessionStorage; cada montagem passa a escrever sua própria cópia.
                const nextId = crypto.randomUUID();
                await client.saveHabitDraft(nextId, next, accountKey);
                if (cancelled) return;
                sessionStorage.setItem(key, nextId);
                draftId.current = nextId;
                latest.current = next; setDraft(next);
            } catch (caught) { if (!cancelled) setError(caught.message); }
        };
        void load();
        return () => { cancelled = true; alive.current = false; };
    }, [accountKey, client, reasonOnly]);
    useEffect(() => {
        if (confirmOpen) {
            dialog.current?.showModal();
            dialog.current?.querySelector('button')?.focus();
        } else if (dialog.current?.open) {
            dialog.current.close();
            archiveButton.current?.focus();
        }
    }, [confirmOpen]);

    const persist = next => {
        latest.current = next; setDraft(next); setSaving(true); setError('');
        const task = writes.current.catch(() => {}).then(() => client.saveHabitDraft(draftId.current, next, accountKey));
        writes.current = task;
        task.then(() => {
            if (alive.current && latest.current === next) setSaving(false);
        }, caught => {
            if (alive.current) { setError(caught.message); setSaving(false); }
        });
        return task;
    };
    const change = (field, value) => {
        void persist({ ...draft, values: { ...draft.values, [field]: value }, message: '' });
    };
    const run = async input => {
        if (inFlight.current) return;
        inFlight.current = true; setBusy(true); setError(''); setConfirmOpen(false);
        let submitted = false;
        try {
            await writes.current.catch(() => {});
            await client.saveHabitDraft(draftId.current, latest.current, accountKey);
            submitted = true;
            const result = await client.manageHabit(habit.id, draftId.current, input, accountKey);
            if (!alive.current) return;
            latest.current = result; setDraft(result);
            if (result.status === 'confirmed') await onConfirmed?.();
        } catch (caught) {
            if (!alive.current) return;
            setError(caught.message);
            // Se a publicação do cache falhou após o PATCH, recupere o marcador durável.
            try {
                if (!submitted) return;
                const stored = await client.getHabitDraft(draftId.current, accountKey);
                if (alive.current && stored) { latest.current = stored; setDraft(stored); }
            } catch { /* O formulário em memória continua disponível. */ }
        } finally { inFlight.current = false; if (alive.current) setBusy(false); }
    };
    const save = event => {
        event.preventDefault();
        try {
            const input = habitEditPatch(reasonOnly ? { ...draft, values: {
                ...createHabitDraft(draft.base).values, personalReason: draft.values.personalReason,
            } } : draft);
            if (Object.keys(input).length === 1) { setError('Nenhum campo foi alterado.'); return; }
            void run(input);
        } catch (caught) { setError(caught.message); }
    };
    if (!draft) return <section aria-label="Gerenciar hábito" role="status">{error || 'Carregando edição…'}</section>;
    const reviewing = ['uncertain', 'conflict', 'review'].includes(draft.status);
    const disabled = busy || saving || localOnly || !draft.base.revision;
    const remote = draft.remote;
    const rebase = replace => {
        const next = createHabitDraft(remote);
        void persist({ ...next, values: replace ? next.values : draft.values,
            message: 'Versão remota adotada como base. Revise os campos e confirme o próximo envio.' });
    };
    return <section className={`${glassSurface} rounded-3xl p-6 space-y-4`} aria-labelledby="habit-management-title">
        <h2 id="habit-management-title" className="text-xl font-bold">{reasonOnly ? 'Seu motivo (opcional)' : 'Gerenciar hábito'}</h2>
        <p>{habit.ativo === false ? 'Arquivado: histórico preservado. Reative para novos eventos.' : 'Hábito ativo'}</p>
        {!reasonOnly && <p>A nova economia vale a partir da confirmação. Os valores anteriores permanecem no histórico.</p>}
        {localOnly && <p role="status">Conecte-se para editar, arquivar ou reativar. O rascunho local não é uma alteração confirmada.</p>}
        {!draft.base.revision && <p role="status">Consulte o estado remoto para habilitar a edição.</p>}
        <div aria-label="Motivo pessoal sincronizado" className="space-y-2">
            <h3 className="font-semibold">Motivo pessoal</h3>
            <p className="whitespace-pre-wrap break-words">{habit.motivo_pessoal || 'Nenhum motivo pessoal salvo.'}</p>
            <p>Privado, opcional e disponível offline na última versão sincronizada. Não aparece em notificações ou exportações padrão.</p>
        </div>
        <form onSubmit={save} className="space-y-4">
            <fieldset disabled={busy || reviewing} className="space-y-4">
                <label className="block" htmlFor={reasonId}>Motivo pessoal (opcional)</label>
                <textarea id={reasonId} className={fieldBase} rows={5} value={draft.values.personalReason ?? ''} aria-describedby="personal-reason-help personal-reason-count" aria-invalid={personalReasonLength(draft.values.personalReason) > 1000} onChange={event => change('personalReason', event.target.value)} />
                <p id="personal-reason-help">Deixe vazio para remover. A alteração exige conexão; o rascunho fica neste navegador até a confirmação.</p>
                <p id="personal-reason-count" role="status">{personalReasonLength(draft.values.personalReason)} / 1000 caracteres</p>
                <Button type="button" onClick={() => change('personalReason', '')}>Limpar motivo pessoal</Button>
                {!reasonOnly && <><label className="block">Nome do hábito<input className={fieldBase} value={draft.values.name} maxLength={120} onChange={event => change('name', event.target.value)} /></label>
                <label className="block">Economia diária (R$)<input className={fieldBase} inputMode="decimal" value={draft.values.dailySavings} onChange={event => change('dailySavings', event.target.value)} /></label>
                <label className="block">Data de início<input className={fieldBase} type="date" max={localDateKey()} disabled={!draft.base.inicio_editavel} value={draft.values.startDate} onChange={event => change('startDate', event.target.value)} /></label>
                {!draft.base.inicio_editavel && <p>A data de início exige ausência de registros, metas, conquistas e alterações de economia.
                    {draft.values.startDate !== draft.base.data_inicio.slice(0, 10) && <Button type="button" onClick={() => change('startDate', draft.base.data_inicio.slice(0, 10))}>Usar data remota</Button>}
                </p>}</>}
            </fieldset>
            <p role="status">{saving ? 'Salvando rascunho neste navegador…' : draft.message}</p>
            {error && <p role="alert">{error}</p>}
            {reviewing && <div className="border rounded-xl p-4 space-y-3" role="region" aria-label="Revisão da edição">
                <p>Seu rascunho: {draft.values.name} · R$ {draft.values.dailySavings} · início {draft.values.startDate}</p>
                <p className="whitespace-pre-wrap break-words">Motivo no rascunho: {draft.values.personalReason || 'Sem conteúdo'}</p>
                {draft.attempted?.ativo !== undefined && <p>Ação solicitada: {draft.attempted.ativo ? 'reativar' : 'arquivar'}.</p>}
                {remote && <>
                    <p>Versão remota (revisão {remote.revision}): {remote.nome_vicio} · R$ {Number(remote.valor_economizado_por_dia).toFixed(2)} · início {remote.data_inicio.slice(0, 10)} · {remote.ativo === false ? 'Arquivado' : 'Ativo'}</p>
                    <p className="whitespace-pre-wrap break-words">Motivo remoto: {remote.motivo_pessoal || 'Sem conteúdo'}</p>
                    <div className="flex flex-wrap gap-3"><Button type="button" disabled={disabled} onClick={() => rebase(false)}>Manter rascunho e revisar com esta versão</Button>
                    <Button type="button" disabled={disabled} onClick={() => rebase(true)}>Substituir rascunho pela versão remota</Button></div>
                </>}
            </div>}
            <div className="flex flex-wrap gap-3">
                <Button type="submit" disabled={disabled || reviewing}>{reasonOnly ? 'Salvar motivo' : 'Salvar alterações'}</Button>
                {!reasonOnly && <Button ref={archiveButton} type="button" disabled={disabled || reviewing} onClick={() => setConfirmOpen(true)}>{draft.base.ativo === false ? 'Reativar hábito' : 'Arquivar hábito'}</Button>}
                <Button type="button" disabled={busy || saving || localOnly} onClick={() => void run(null)}>Consultar estado remoto</Button>
                <Link to="/sincronizacao">Resolver operações pendentes</Link>
            </div>
        </form>
        <dialog ref={dialog} aria-labelledby="habit-confirm-title" aria-describedby="habit-confirm-description" onCancel={() => setConfirmOpen(false)} onKeyDown={event => {
            if (event.key !== 'Tab') return;
            const buttons = [...event.currentTarget.querySelectorAll('button:not(:disabled)')];
            const first = buttons[0], last = buttons.at(-1);
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        }} className="rounded-2xl p-6 max-w-lg surface-card text-app">
            <h3 id="habit-confirm-title">{draft.base.ativo === false ? 'Reativar hábito?' : 'Arquivar hábito?'}</h3>
            <p id="habit-confirm-description">Histórico, conquistas e metas serão preservados. Arquivar não registra recaída nem reinicia a sequência. Após reativar, use Sincronização para tentar novamente os eventos recusados.</p>
            <div className="flex gap-3 mt-4">
                <Button type="button" onClick={() => setConfirmOpen(false)}>Cancelar</Button>
                <Button type="button" onClick={() => void run({ revision: draft.base.revision, ativo: draft.base.ativo === false })}>{draft.base.ativo === false ? 'Confirmar reativação' : 'Confirmar arquivamento'}</Button>
            </div>
        </dialog>
    </section>;
}
