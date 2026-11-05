import { vi } from 'vitest';
import { createSyncCoordinator } from '../offline/sync-coordinator';

export const goalInput = { vicio_id: 'habit', descricao_meta: 'Meta sintética', dias_objetivo: 30, iniciar_hoje: true, data_inicio_meta: '2026-10-23' };
export const relapseInput = { addictionId: 'habit', motivo: '', resetarContador: false, occurred_at: '2026-10-01T10:00:00-03:00', timezone: 'America/Sao_Paulo' };
export function goalFixture() {
    const auth = { user: { id: 'a' }, epoch: 'a', token: 'synthetic' };
    const data = { usuario: { id: 'a' }, vicios: [{ id: 'habit', ativo: true }], metas: [{ id: 'goal', vicio_id: 'habit' }], recaidas: [] };
    const queue = [], receipts = new Map(), mappings = new Map();
    let chain = Promise.resolve();
    const store = {
        userId: 'a', getSnapshot: vi.fn(async () => ({ data: structuredClone(data) })),
        getPages: vi.fn(async () => []), removeHabit: vi.fn(),
        getQueue: vi.fn(async () => structuredClone(queue)), getReceipt: vi.fn(async id => receipts.get(id)),
        getMapping: vi.fn(async id => mappings.get(id)), saveSnapshot: vi.fn(),
        enqueue: vi.fn(async (type, payload, options = {}) => {
            const id = options.id || crypto.randomUUID();
            const prior = queue.find(row => row.id === id);
            if (prior) return prior;
            const row = { id, type, localId: 'local:' + id, payload: structuredClone(payload), dependsOn: options.dependsOn || null, status: 'pending' };
            queue.push(row); return row;
        }),
        recoverInterrupted: vi.fn(), markSending: vi.fn(async id => queue.find(row => row.id === id)),
        markFailed: vi.fn(async (id, error) => Object.assign(queue.find(row => row.id === id), { status: error.status === 409 ? 'recovery' : 'retry' })),
        acknowledge: vi.fn(async (id, response) => { queue.splice(queue.findIndex(row => row.id === id), 1); receipts.set(id, { kind: 'confirmed', response }); }),
        removeGoal: vi.fn(async id => { data.metas = data.metas.filter(row => row.id !== id); })
    };
    const request = vi.fn(async path => path === '/v2/bootstrap' ? structuredClone(data) : path.startsWith('/metas/') ? { mensagem: 'Meta excluida com sucesso' } : { meta: { id: 'goal' } });
    const session = { getSnapshot: () => auth, ensureToken: vi.fn() };
    const locks = { request: (_name, task) => { const next = chain.catch(() => {}).then(task); chain = next; return next; } };
    const make = (options = {}) => createSyncCoordinator({ store, session, locks, request, isOnline: () => false, ...options });
    return { auth, data, queue, store, request, session, receipts, mappings, make };
}
