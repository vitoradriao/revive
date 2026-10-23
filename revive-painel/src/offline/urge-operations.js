import { canRecoverUrge, rejectedUrgeDraft, inUrgePeriod, mergeUrges, urgePayload, validateUrgeFilters } from '../utils/urges';
export function createUrgeOperations({ store, check, request, isOnline }) {
    return {
        list: async filters => {
            validateUrgeFilters(filters); check();
            let data, error, local = false;
            if (isOnline()) {
                try {
                    data = await request('/v2/vontades?' + new URLSearchParams(Object.entries(filters).filter(([, value]) => value != null && value !== '')));
                    check(); await store.savePage('urges', filters, data); check();
                } catch (caught) {
                    check();
                    if (caught.status && caught.status < 500 && ![408, 425, 429].includes(caught.status)) throw caught;
                    error = caught;
                }
            }
            if (!data) {
                local = true;
                const cached = await store.getPage('urges', filters); check();
                if (cached && (cached.payloadVersion ?? 1) === 1) data = cached.data;
            }
            const [pages, receipts, queue] = await Promise.all([store.getPages(), store.getReceipts(), store.getQueue()]); check();
            const confirmed = receipts.filter(row => row.kind === 'confirmed' && row.type === 'urge.create' && (row.payloadVersion ?? 1) === 1).map(row => row.response.vontade);
            const pending = queue.filter(row => row.type === 'urge.create').map(row => ({ ...row.payload, id: row.localId, pending: row }));
            const cached = local && !filters.cursor ? pages.filter(row => row.kind === 'urges' && row.payloadVersion === 1).flatMap(row => row.data.vontades) : [];
            return { events: mergeUrges(cached, data?.vontades || [], confirmed, pending).filter(event => inUrgePeriod(event, filters)),
                nextCursor: data?.next_cursor || null, partial: local, offline: !isOnline(), error: error?.message || null,
                coverage: data?.cobertura || null };
        },
        recover: async id => {
            check();
            if (!isOnline()) throw new Error('Conecte-se para verificar o hábito antes de recuperar o rascunho.');
            const prior = (await store.getQueue()).find(item => item.id === id); check();
            if (!canRecoverUrge(prior)) throw new Error('Somente uma recusa definitiva pode ser recuperada como novo rascunho.');
            const snapshot = await request('/v2/bootstrap'); check();
            if (snapshot.usuario?.id !== store.userId) throw Object.assign(new Error('A conta mudou.'), { code: 'SESSAO_ALTERADA' });
            if (!snapshot.vicios.some(habit => habit.id === prior.payload.vicio_id && habit.ativo !== false)) throw new Error('Reative o hábito antes de recuperar o rascunho. A intenção foi preservada.');
            await store.saveSnapshot(snapshot); check();
            const existing = await store.getUrgeDraft(prior.payload.vicio_id); check();
            if (existing && existing.eventId !== prior.id) {
                const confirmed = await store.getReceipt(existing.eventId); check();
                if (confirmed?.kind !== 'confirmed') throw new Error('Já há outro rascunho deste hábito. Finalize-o antes de recuperar esta recusa.');
            }
            return store.recoverUrgeDraft(id, rejectedUrgeDraft(prior));
        },
        create: async (input, draft) => {
            check(); const payload = urgePayload(input);
            const snapshot = await store.getSnapshot(); check();
            if (!snapshot?.data.vicios.some(habit => habit.id === payload.vicio_id && habit.ativo !== false)) throw Object.assign(new Error('Hábito arquivado ou indisponível. O rascunho foi preservado; reative o hábito para registrar.'), { code: 'HABITO_ARQUIVADO' });
            await store.saveUrgeDraft(payload.vicio_id, draft); check();
            const receipt = await store.getReceipt(draft.eventId); check();
            if (receipt?.kind === 'confirmed') return { id: draft.eventId };
            return store.enqueue('urge.create', payload, { id: draft.eventId });
        }
    };
}
