import { vi } from 'vitest';
import { createSyncCoordinator } from '../offline/sync-coordinator';
import { createHabitDraft } from '../utils/habitEdit';

export const habit = {
    id: 'habit-1', nome_vicio: 'Café', data_inicio: '2026-01-01', valor_economizado_por_dia: 10,
    revision: 1, inicio_editavel: true, ativo: true
};
export function managementFixture() {
    const data = { usuario: { id: 'account-a' }, vicios: [{ ...habit }], registros: [], metas: [], recaidas: [], conquistas: [] };
    const drafts = new Map();
    let snapshot = structuredClone(data), queue = [], chain = Promise.resolve();
    const auth = { user: { id: 'account-a' }, epoch: 'generation-a', token: 'local-test' };
    const session = { getSnapshot: () => auth, ensureToken: vi.fn() };
    const locks = { request: vi.fn((_name, task) => {
        const next = chain.catch(() => {}).then(task);
        chain = next; return next;
    }) };
    const store = {
        userId: 'account-a',
        getHabitDraft: vi.fn(async id => structuredClone(drafts.get(id))),
        saveHabitDraft: vi.fn(async (id, draft) => { drafts.set(id, structuredClone(draft)); }),
        getSnapshot: vi.fn(async () => ({ data: structuredClone(snapshot) })),
        saveSnapshot: vi.fn(async next => { snapshot = structuredClone(next); }),
        getPages: vi.fn(async () => []), getQueue: vi.fn(async () => structuredClone(queue)),
        recoverInterrupted: vi.fn(),
        enqueue: vi.fn(async (type, payload, options) => { const item = { id: options.id, type, payload, status: 'pending' }; queue.push(item); return item; }),
        markSending: vi.fn(async id => queue.find(item => item.id === id)),
        markFailed: vi.fn(async (id, error) => { Object.assign(queue.find(item => item.id === id), { status: 'recovery', lastError: { code: error.code } }); }),
        acknowledge: vi.fn(async id => { queue = queue.filter(item => item.id !== id); }),
        retry: vi.fn(async id => { queue.find(item => item.id === id).status = 'pending'; })
    };
    const request = vi.fn(async (path, options = {}) => {
        if (path === '/v2/bootstrap') return structuredClone(data);
        if (path === '/v2/vicios/habit-1') {
            const input = JSON.parse(options.body), current = data.vicios[0];
            if (input.revision !== current.revision) throw Object.assign(new Error('O hábito mudou.'), { code: 'REVISAO_CONFLITO', status: 409 });
            if (input.data_inicio && !current.inicio_editavel) throw Object.assign(new Error('Início com histórico.'), { code: 'INICIO_COM_HISTORICO', status: 409 });
            Object.assign(current, input, { revision: current.revision + 1 });
            return { vicio: structuredClone(current) };
        }
        if (path === '/v2/registros') {
            if (data.vicios[0].ativo === false) throw Object.assign(new Error('Reative o hábito.'), { code: 'HABITO_ARQUIVADO', status: 409 });
            const record = { id: 'record-1', ...JSON.parse(options.body) };
            data.registros.push(record); data.vicios[0].inicio_editavel = false;
            return { registro: record };
        }
        throw new Error('Rota de teste desconhecida.');
    });
    const makeCoordinator = (options = {}) => createSyncCoordinator({ store, session, locks, request, isOnline: () => true, ...options });
    const prepare = async (id = 'tab-a', fields = {}) => {
        const draft = createHabitDraft(data.vicios[0]);
        Object.assign(draft.values, fields);
        await store.saveHabitDraft(id, draft);
        return draft;
    };
    return { data, drafts, auth, store, session, locks, request, makeCoordinator, prepare };
}
