import { inRecordPeriod, recordFields, mergeRecords, projectRecords, recordCreation, recordPatch, validateRecordFilters } from '../utils/diary.js';

const failure = (code, message) => Object.assign(new Error(message), { code });
export function createDiaryOperations({ store, check, request, isOnline }) {
    const cachedRecords = async () => {
        const [snapshot, pages] = await Promise.all([store.getSnapshot(), store.getPages()]);
        check();
        return mergeRecords(snapshot?.data.registros || [], ...pages.filter(page => page.kind === 'records').map(page => page.data.registros));
    };
    const list = async filters => {
        validateRecordFilters(filters);
        let page, error, local = false;
        if (isOnline()) {
            try {
                const data = await request('/v2/registros?' + new URLSearchParams(Object.entries(filters).filter(([, value]) => value !== '' && value != null)));
                check();
                await store.savePage('records', filters, data); check();
                page = { data };
            } catch (caught) { check(); error = caught; }
        }
        if (!page) { local = true; page = await store.getPage('records', filters); check(); }
        const queue = await store.getQueue(); check();
        const records = local && !filters.cursor ? mergeRecords(page?.data.registros || [], await cachedRecords()) : page?.data.registros || [];
        check();
        return { records: projectRecords(records, filters.cursor ? queue.filter(item => item.type === 'record.update') : queue).filter(record => inRecordPeriod(record, filters)),
            nextCursor: page?.data.next_cursor || null, partial: local, offline: !isOnline(), error: error?.message || null };
    };
    const resolveId = async id => {
        if (!id.startsWith('local:')) return id;
        const mapping = await store.getMapping(id.slice(6)); check();
        return mapping?.entityId || id;
    };
    const detail = async (id, remoteOnly = false) => {
        id = await resolveId(id);
        let record, error;
        if (!id.startsWith('local:') && isOnline()) {
            try {
                const data = await request('/v2/registros/' + encodeURIComponent(id)); check();
                if (data.registro?.id !== id) throw failure('RECORD_INVALID', 'Não foi possível confirmar o detalhe.');
                record = data.registro;
                await store.savePage('records', { detail: id }, { registros: [record] }); check();
            } catch (caught) { check(); if (remoteOnly) throw caught; error = caught; }
        } else if (remoteOnly) throw failure('OFFLINE', 'Conecte-se para comparar com a versão remota.');
        const queue = await store.getQueue(); check();
        if (!record) record = (await cachedRecords()).find(row => row.id === id);
        if (!record) {
            const creation = queue.find(item => item.type === 'record.create' && item.localId === id);
            if (creation) record = { ...creation.payload, id, revision: null };
        }
        check();
        if (!record) throw error || failure('RECORD_UNAVAILABLE', 'Registro indisponível nesta cópia. Conecte-se e tente novamente.');
        return { record, pending: queue.find(item => item.type === 'record.update' && item.payload.recordId === id) || queue.find(item => item.type === 'record.create' && item.localId === id), error: error?.message || null };
    };
    return {
        list, detail,
        create: async (values, habitId, anotherDay) => {
            check();
            const payload = recordCreation(values, habitId);
            const snapshot = await store.getSnapshot(); check();
            if (!snapshot?.data.vicios.some(habit => habit.id === habitId && habit.ativo !== false)) throw failure('HABITO_ARQUIVADO', 'Selecione um hábito ativo para criar um registro.');
            const filters = { inicio: payload.data_registro, fim: payload.data_registro, vicio_id: habitId, limit: 100 };
            const today = await list(filters);
            const local = projectRecords(await cachedRecords(), await store.getQueue()).filter(record => inRecordPeriod(record, filters));
            check();
            if ((today.records.length || local.length) && anotherDay !== payload.data_registro) throw failure('TODAY_EXISTS', 'Já existe registro neste dia. Consulte o diário ou escolha explicitamente adicionar outro registro.');
            return store.enqueue('record.create', payload);
        },
        edit: async (base, values, replaceId, remote) => {
            const recordId = await resolveId(base.id);
            const queue = await store.getQueue(); check();
            const existing = queue.find(item => item.type === 'record.update' && item.payload.recordId === recordId);
            if (existing && existing.id !== replaceId) throw failure('EDIT_PENDING', 'Este registro já tem uma correção pendente. Acompanhe a sincronização antes de editar novamente.');
            let patch = recordPatch(base, values);
            if (replaceId) {
                if (!existing || remote?.id !== recordId || !Number.isSafeInteger(remote.revision)) throw failure('CONFLICT_CHANGED', 'Consulte a versão remota antes de reaplicar.');
                const prior = Object.fromEntries(Object.entries(existing.payload).filter(([key]) => key in recordFields));
                patch = { ...prior, ...patch };
            }
            if (!Object.keys(patch).length) throw failure('EDIT_EMPTY', 'Nenhum campo foi alterado.');
            const creation = queue.find(item => item.type === 'record.create' && item.localId === base.id);
            // A creation can commit between opening the editor and saving its correction.
            const mapping = base.id.startsWith('local:') ? await store.getMapping(base.id.slice(6)) : null;
            const payload = { ...patch, recordId, expected_version: remote?.revision || mapping?.revision || base.revision };
            check();
            if (!creation && !Number.isSafeInteger(payload.expected_version)) throw failure('REVISION_UNKNOWN', 'Consulte o registro para obter a revisão antes de corrigir.');
            return replaceId ? store.replaceRecordEdit(replaceId, payload) : store.enqueue('record.update', payload, creation ? { dependsOn: creation.id } : undefined);
        }
    };
}
