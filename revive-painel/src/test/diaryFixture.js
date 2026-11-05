import { createDiaryOperations } from '../offline/diary-operations.js';
import { recordValues } from '../utils/diary.js';

export const diaryHabit = { id: '10000000-0000-4000-8000-000000000001', ativo: true, nome_vicio: 'Hábito sintético' };
export const diaryRecord = { id: '20000000-0000-4000-8000-000000000001', vicio_id: diaryHabit.id,
    data_registro: '2026-10-22', revision: 1, humor: 'bom', gatilhos: null, conquistas: null, observacoes: 'Texto sintético' };
export const deferred = () => {
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
};
export function diaryFixture() {
    const state = { online: false, active: true, queue: [], records: [], pages: [], mappings: new Map(), replaced: [],
        snapshot: { data: { vicios: [structuredClone(diaryHabit)], registros: [] } } };
    const store = {
        getSnapshot: async () => structuredClone(state.snapshot),
        getPages: async () => structuredClone(state.pages),
        getPage: async (_kind, filters) => state.pages.find(page => JSON.stringify(page.filters) === JSON.stringify(filters)),
        savePage: async (kind, filters, data) => { state.pages.push({ kind, filters, data: structuredClone(data) }); },
        getQueue: async () => structuredClone(state.queue),
        getMapping: async id => state.mappings.get(id),
        enqueue: async (type, payload, options = {}) => {
            const id = crypto.randomUUID();
            const intent = { id, localId: 'local:' + id, type, payload, status: 'pending', ...options };
            state.queue.push(intent); return intent;
        },
        replaceRecordEdit: async (id, payload) => {
            state.replaced.push(id); state.queue = state.queue.filter(item => item.id !== id);
            return store.enqueue('record.update', payload);
        }
    };
    const check = () => { if (!state.active) throw Object.assign(new Error('Conta trocada'), { code: 'SESSAO_ALTERADA' }); };
    const request = async path => path.includes('?') ? { registros: structuredClone(state.records), next_cursor: null } : { registro: structuredClone(state.records.find(record => path.endsWith(record.id))) };
    const make = (options = {}) => createDiaryOperations({ store, check, request, isOnline: () => state.online, ...options });
    return { state, store, make, values: recordValues(diaryRecord) };
}
