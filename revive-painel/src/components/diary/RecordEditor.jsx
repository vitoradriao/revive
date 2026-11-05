import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useOffline } from '../../contexts/OfflineContext';
import { editDiaryRecord, getDiaryRecord } from '../../services/registros.service';
import { recordValues } from '../../utils/diary';
import RecordFields from './RecordFields';
import RecordContent from './RecordContent';
import Button from '../ui/Button';

export default function RecordEditor({ recordId, accountKey, onClose }) {
    const { client, queue = [], receipts = [] } = useOffline();
    const [draft, setDraft] = useState(null), [remote, setRemote] = useState(null);
    const [error, setError] = useState(''), [message, setMessage] = useState(''), [busy, setBusy] = useState(false);
    const alive = useRef(false), inFlight = useRef(false), writes = useRef(Promise.resolve()), draftId = useRef(null);
    const heading = useRef(null);
    useEffect(() => {
        alive.current = true;
        let cancelled = false;
        const load = async () => {
            try {
                const { record, pending, error: readError } = await getDiaryRecord(client, accountKey, recordId);
                const key = 'revive-record-editor:' + accountKey.split(':')[0] + ':' + recordId;
                const previousId = sessionStorage.getItem(key);
                const stored = previousId ? await client.getRecordDraft(previousId, accountKey) : null;
                if (cancelled) return;
                const next = stored && !stored.submitted ? stored : { base: record, values: recordValues({ ...record, ...(pending?.type === 'record.update' ? pending.payload : {}) }) };
                const id = crypto.randomUUID();
                await client.saveRecordDraft(id, next, accountKey);
                if (cancelled) return;
                draftId.current = id; sessionStorage.setItem(key, id); setDraft(next);
                if (readError) setError(readError);
            } catch (caught) { if (!cancelled) setError(caught.message); }
        };
        void load();
        heading.current?.focus();
        return () => { cancelled = true; alive.current = false; };
    }, [accountKey, client, recordId]);
    const persist = next => {
        setDraft(next);
        const task = writes.current.catch(() => {}).then(() => client.saveRecordDraft(draftId.current, next, accountKey));
        writes.current = task;
        task.catch(caught => { if (alive.current) setError(caught.message); });
        return task;
    };
    const creationId = recordId.startsWith('local:') ? recordId.slice(6) : null;
    const canonicalId = receipts.find(item => item.key === creationId)?.response?.registro?.id || draft?.base.id || recordId;
    const pending = queue.find(item => item.type === 'record.update' && [recordId, canonicalId].includes(item.payload.recordId));
    const conflict = pending?.lastError?.code === 'REVISAO_CONFLITO';
    const confirmed = draft?.submitted && receipts.some(item => item.key === draft.submitted && item.kind === 'confirmed');
    const run = async reapply => {
        if (!draft || inFlight.current) return;
        inFlight.current = true; setBusy(true); setError('');
        try {
            await writes.current;
            const intent = await editDiaryRecord(client, accountKey, draft.base, draft.values, reapply ? pending?.id : undefined, reapply ? remote : undefined);
            if (!alive.current) return;
            setMessage('Correção salva neste navegador. Acompanhe a confirmação na sincronização.');
            setRemote(null);
            await persist({ ...draft, submitted: intent.id });
        } catch (caught) { if (alive.current) setError(caught.message); }
        finally { inFlight.current = false; if (alive.current) setBusy(false); }
    };
    const compare = async () => {
        if (inFlight.current) return;
        inFlight.current = true; setBusy(true); setError('');
        try {
            const result = await getDiaryRecord(client, accountKey, canonicalId, true);
            if (alive.current) { setRemote(result.record); setMessage('Compare as versões. Seu texto local foi mantido.'); }
        } catch (caught) { if (alive.current) setError(caught.message); }
        finally { inFlight.current = false; if (alive.current) setBusy(false); }
    };
    return <section aria-label="Corrigir registro" className="space-y-4 border rounded-2xl p-5">
        <h3 ref={heading} tabIndex={-1} className="text-xl font-bold">Corrigir registro</h3>
        <p>Hábito e data são imutáveis. A correção não reinicia contadores.</p>
        {error && <p role="alert">{error}</p>}
        {!draft ? <p role="status">{error ? 'Detalhe indisponível. Feche e tente novamente.' : 'Carregando detalhe…'}</p> : <>
            <p>Data: {draft.base.data_registro.slice(0, 10).split('-').reverse().join('/')}</p>
            <form onSubmit={event => { event.preventDefault(); void run(false); }}>
                <fieldset disabled={busy} className="space-y-4">
                    <RecordFields values={draft.values} editing readOnly={!!pending || !!draft.submitted} onChange={(key, value) => { void persist({ ...draft, values: { ...draft.values, [key]: value } }); }} />
                    <Button type="submit" disabled={!!remote || !!pending || !!draft.submitted}>Salvar correção</Button>
                </fieldset>
            </form>
            {pending && <p role="status">{conflict ? 'Conflito: seu texto está preservado neste navegador.' : pending.status === 'recovery' || pending.status === 'retry' ? 'Falha no envio. Correção preservada; revise a sincronização.' : 'Correção pendente de confirmação.'}</p>}
            <p role="status">{confirmed ? 'Correção confirmada no servidor. Feche e reabra o detalhe para editar novamente.' : message}</p>
            {conflict && <Button onClick={compare} disabled={busy}>Consultar versão remota sem apagar meu texto</Button>}
            {remote && <section aria-label="Comparação local e remota" className="space-y-4">
                <h4 className="font-bold">Versão remota · revisão {remote.revision}</h4>
                <RecordContent record={remote} />
                <p>O texto local está nos campos acima. Somente os campos da sua correção serão reaplicados.</p>
                <Button disabled={busy || !conflict} onClick={() => void run(true)}>Reaplicar minha correção nesta versão</Button>
            </section>}
            <Link to="/sincronizacao" className="underline">Ver pendências de sincronização</Link>
        </>}
        <Button onClick={onClose} disabled={busy}>Fechar detalhe</Button>
    </section>;
}
