import { describe, expect, it, vi } from 'vitest';
import { createUrgeOperations } from '../offline/urge-operations';
import { createSyncCoordinator } from '../offline/sync-coordinator';
import { createUrgeEvent, listUrgeEvents } from './vontades.service';
import { deferred, diaryFixture, diaryHabit } from '../test/diaryFixture';
const filters = { vicio_id: diaryHabit.id, inicio: '2026-10-01', fim: '2026-10-31', timezone: 'UTC', limit: 20 };
const event = { id: '20000000-0000-4000-8000-000000000001', vicio_id: diaryHabit.id, occurred_at: '2026-10-22T10:00:00Z', timezone: 'UTC', intensidade: 0, gatilhos: ['future_code'] };
const fixture = () => {
    const f = diaryFixture(); f.state.receipts = []; f.state.draft = null;
    Object.assign(f.store, { userId: 'a', getUrgeDraft: async () => f.state.draft, getReceipts: async () => f.state.receipts, getReceipt: async id => f.state.receipts.find(row => row.key === id), saveUrgeDraft: async (_id, draft) => { f.state.draft = draft; } });
    return { ...f, make: (options = {}) => createUrgeOperations({ store: f.store, check: () => { if (!f.state.active) throw Object.assign(new Error('Conta trocada'), { code: 'SESSAO_ALTERADA' }); }, request: async () => ({ vontades: [event], next_cursor: null }), isOnline: () => f.state.online, ...options }) };
};
describe('serviço de vontades e intenções', () => {
    it('persiste draft antes da intenção e não altera hábito, recaída ou diário', async () => {
        const f = fixture(), draft = { eventId: 'stable-key' }, before = structuredClone(f.state.snapshot);
        const enqueue = vi.spyOn(f.store, 'enqueue');
        await f.make().create(event, draft);
        expect(f.state.draft).toEqual(draft); expect(enqueue).toHaveBeenCalledWith('urge.create', expect.objectContaining({ intensidade: 0 }), { id: 'stable-key' });
        expect(f.state.snapshot).toEqual(before);
    });
    it('archive preserva draft e recusa nova intenção; falha de storage nunca vira sucesso', async () => {
        const f = fixture(); f.state.snapshot.data.vicios[0].ativo = false;
        f.state.draft = { eventId: 'draft', note: 'Sintético' };
        await expect(f.make().create(event, f.state.draft)).rejects.toMatchObject({ code: 'HABITO_ARQUIVADO' });
        expect(f.state.queue).toHaveLength(0); expect(f.state.draft.note).toBe('Sintético');
        f.state.snapshot.data.vicios[0].ativo = true;
        vi.spyOn(f.store, 'saveUrgeDraft').mockRejectedValue(new Error('Storage indisponível'));
        await expect(f.make().create(event, f.state.draft)).rejects.toThrow('Storage indisponível'); expect(f.state.queue).toHaveLength(0);
    });
    it('une recibos com páginas por ID sem presumir eventos no bootstrap', async () => {
        const f = fixture(); f.state.online = true;
        f.state.receipts.push({ key: 'key', kind: 'confirmed', type: 'urge.create', response: { vontade: event } });
        f.state.snapshot.data.vontades = [{ ...event, id: 'bootstrap-only' }];
        const request = vi.fn(async () => ({ vontades: [event, event], next_cursor: 'opaque', cobertura: { total: 2, tem_mais: true } }));
        expect(await f.make({ request }).list(filters)).toMatchObject({ events: [event], nextCursor: 'opaque', partial: false });
        await f.make({ request }).list({ ...filters, cursor: 'opaque' });
        expect(request.mock.calls[1][0]).toContain('cursor=opaque');
    });
    it('offline nunca transforma cache parcial em histórico completo e filtra hábito/período', async () => {
        const f = fixture();
        f.state.pages.push({ kind: 'urges', payloadVersion: 1, data: { vontades: [event, { ...event, id: 'other', vicio_id: 'other' }] } });
        expect(await f.make().list(filters)).toMatchObject({ partial: true, offline: true, events: [event] });
        f.state.online = true;
        expect(await f.make({ request: async () => { throw new Error('Falha de consulta'); } }).list(filters)).toMatchObject({ partial: true, error: 'Falha de consulta' });
        await expect(f.make({ request: async () => { throw Object.assign(new Error('Sem acesso'), { status: 404 }); } }).list(filters)).rejects.toThrow('Sem acesso');
    });
    it('resposta tardia de A não grava páginas após troca para B', async () => {
        const f = fixture(); f.state.online = true; const wait = deferred(), save = vi.spyOn(f.store, 'savePage');
        const promise = f.make({ request: () => wait.promise }).list(filters);
        f.state.active = false; wait.resolve({ vontades: [event] });
        await expect(promise).rejects.toMatchObject({ code: 'SESSAO_ALTERADA' }); expect(save).not.toHaveBeenCalled();
    });
    it('recibo de criação tardio de A não é reconciliado na conta B', async () => {
        const auth = { user: { id: 'a' }, epoch: 'a', token: 'synthetic' }, wait = deferred();
        const intent = { id: 'stable', type: 'urge.create', payload: event };
        const store = { userId: 'a', recoverInterrupted: vi.fn(), getQueue: vi.fn(async () => [intent]), markSending: vi.fn(async () => intent), acknowledge: vi.fn(), markFailed: vi.fn() };
        const request = vi.fn(() => wait.promise);
        const coordinator = createSyncCoordinator({ store, session: { getSnapshot: () => auth, ensureToken: async () => {} }, locks: { request: (_name, task) => task() }, request, isOnline: () => true });
        const run = coordinator.run(); await vi.waitFor(() => expect(request).toHaveBeenCalled());
        expect(request.mock.calls[0][1].headers['Idempotency-Key']).toBe('stable');
        auth.user = { id: 'b' }; auth.epoch = 'b'; wait.resolve({ vontade: event }); await run;
        expect(store.acknowledge).not.toHaveBeenCalled(); expect(store.markFailed).not.toHaveBeenCalled();
    });
    it('recupera somente recusa definitiva como rascunho após consultar hábito ativo', async () => {
        const f = fixture(); f.state.online = true;
        const item = { id: 'refused', type: 'urge.create', payload: event, status: 'recovery', lastError: { status: 404, code: 'VICIO_NAO_ENCONTRADO', outcomeUnknown: false } };
        f.state.queue.push(item); f.state.draft = { eventId: item.id };
        f.store.recoverUrgeDraft = vi.fn(async () => diaryHabit.id); f.store.saveSnapshot = vi.fn();
        const snapshot = { usuario: { id: 'a' }, vicios: [diaryHabit] };
        const ops = f.make({ request: async () => snapshot });
        expect(await ops.recover(item.id)).toBe(diaryHabit.id);
        expect(f.store.recoverUrgeDraft).toHaveBeenCalledWith(item.id, expect.objectContaining({ intensity: '0', triggers: ['future_code'], initial: expect.objectContaining({ instant: event.occurred_at }) }));
        item.lastError.outcomeUnknown = true;
        await expect(ops.recover(item.id)).rejects.toThrow('recusa definitiva');
        item.lastError.outcomeUnknown = false; snapshot.vicios = [{ ...diaryHabit, ativo: false }];
        await expect(ops.recover(item.id)).rejects.toThrow('Reative');
        snapshot.vicios = [diaryHabit]; f.state.draft = { eventId: 'another-draft' };
        await expect(ops.recover(item.id)).rejects.toThrow('outro rascunho');
        expect(f.store.recoverUrgeDraft).toHaveBeenCalledTimes(1);
        f.state.receipts.push({ key: 'another-draft', kind: 'confirmed' });
        expect(await ops.recover(item.id)).toBe(diaryHabit.id);
    });
    it('encaminha conta e argumentos pelo serviço', async () => {
        const client = { urges: vi.fn() }; await listUrgeEvents(client, 'a:1', filters); await createUrgeEvent(client, 'a:1', event, { eventId: 'key' });
        expect(client.urges.mock.calls).toEqual([['list', [filters], 'a:1'], ['create', [event, { eventId: 'key' }], 'a:1']]);
    });
});
