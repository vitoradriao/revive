import { afterEach, describe, expect, it, vi } from 'vitest';
import { diaryFixture, diaryHabit, diaryRecord, deferred } from '../test/diaryFixture';
import { recordValues } from '../utils/diary';
import { createSyncCoordinator, mutationRequest } from '../offline/sync-coordinator';
import { listDiaryRecords, getDiaryRecord, createDiaryRecord, editDiaryRecord } from './registros.service';

afterEach(() => vi.useRealTimers());
const filters = { inicio: '2026-10-01', fim: '2026-10-31', vicio_id: diaryHabit.id, limit: 20 };
describe('operações duráveis do diário', () => {
    it('cria e corrige offline, encadeando a correção sem POST adicional', async () => {
        const f = diaryFixture(), ops = f.make();
        const create = await ops.create(f.values, diaryHabit.id);
        const base = (await ops.detail(create.localId)).record;
        const edit = await ops.edit(base, { ...recordValues(base), observacoes: 'Texto final sintético' });
        expect(edit).toMatchObject({ type: 'record.update', dependsOn: create.id,
            payload: { recordId: create.localId, expected_version: null, observacoes: 'Texto final sintético' } });
        expect(f.state.queue).toHaveLength(2);
        expect(mutationRequest(edit)[1]).toBe('PATCH');
    });
    it('resolve ID e revisão se a criação foi confirmada com o editor aberto', async () => {
        const f = diaryFixture(), ops = f.make(), create = await ops.create(f.values, diaryHabit.id);
        const base = (await ops.detail(create.localId)).record;
        f.state.mappings.set(create.id, { entityId: diaryRecord.id, revision: 2 }); f.state.queue = [];
        const edit = await ops.edit(base, { ...recordValues(base), humor: 'neutro' });
        expect(edit.payload).toEqual({ recordId: diaryRecord.id, expected_version: 2, humor: 'neutro' });
        expect(edit.dependsOn).toBeUndefined();
    });
    it('recusa segundo registro até confirmação explícita para o dia atual', async () => {
        vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 9, 22, 12));
        const f = diaryFixture(), ops = f.make();
        await ops.create(f.values, diaryHabit.id);
        await expect(ops.create(f.values, diaryHabit.id)).rejects.toMatchObject({ code: 'TODAY_EXISTS' });
        await expect(ops.create(f.values, diaryHabit.id, '2026-10-21')).rejects.toMatchObject({ code: 'TODAY_EXISTS' });
        await ops.create(f.values, diaryHabit.id, '2026-10-22');
        expect(f.state.queue).toHaveLength(2);
    });
    it('consulta histórico arquivado, mas recusa nova criação; correção continua permitida', async () => {
        const f = diaryFixture(); f.state.snapshot.data.vicios[0].ativo = false;
        f.state.snapshot.data.registros.push(diaryRecord);
        expect((await f.make().list(filters)).records).toHaveLength(1);
        await expect(f.make().create(f.values, diaryHabit.id)).rejects.toMatchObject({ code: 'HABITO_ARQUIVADO' });
        expect((await f.make().edit(diaryRecord, { ...f.values, humor: 'neutro' })).type).toBe('record.update');
    });
    it('reaplica conflito com nova intenção, mantendo campos remotos não alterados fora do PATCH', async () => {
        const f = diaryFixture(), ops = f.make();
        const first = await ops.edit(diaryRecord, { ...f.values, humor: 'neutro' });
        await expect(ops.edit(diaryRecord, { ...f.values, humor: 'ruim' })).rejects.toMatchObject({ code: 'EDIT_PENDING' });
        const remote = { ...diaryRecord, revision: 3, observacoes: 'Mudança remota' };
        const replacement = await ops.edit(diaryRecord, { ...f.values, humor: 'neutro' }, first.id, remote);
        expect(replacement.id).not.toBe(first.id); expect(f.state.replaced).toEqual([first.id]);
        expect(replacement.payload).toEqual({ humor: 'neutro', recordId: diaryRecord.id, expected_version: 3 });
    });
    it('marca cópia offline como parcial e preserva erro de GET ao retornar cache', async () => {
        const f = diaryFixture(); f.state.snapshot.data.registros.push(diaryRecord);
        expect(await f.make().list(filters)).toMatchObject({ partial: true, offline: true, records: [diaryRecord] });
        f.state.online = true;
        const ops = f.make({ request: async () => { throw new Error('Consulta indisponível'); } });
        expect(await ops.list(filters)).toMatchObject({ partial: true, error: 'Consulta indisponível' });
        await expect(ops.detail(diaryRecord.id, true)).rejects.toThrow('Consulta indisponível');
    });
    it('mantém cursor opaco e projeta correções também nas páginas seguintes', async () => {
        const f = diaryFixture(); f.state.online = true;
        const edit = await f.store.enqueue('record.update', { recordId: diaryRecord.id, humor: 'neutro' });
        await f.store.enqueue('record.create', diaryRecord);
        const request = vi.fn(async () => ({ registros: [diaryRecord], next_cursor: 'opaque-cursor' }));
        const page = await f.make({ request }).list({ ...filters, cursor: 'prior-cursor' });
        expect(page).toMatchObject({ nextCursor: 'opaque-cursor', partial: false });
        expect(page.records).toHaveLength(1); expect(page.records[0]).toMatchObject({ humor: 'neutro', pending: edit });
        expect(request.mock.calls[0][0]).toContain('cursor=prior-cursor');
    });
    it.each(['list', 'detail'])('isola A/B durante GET de %s, sem gravar resposta tardia', async method => {
        const f = diaryFixture(); f.state.online = true;
        const wait = deferred(), save = vi.spyOn(f.store, 'savePage');
        const promise = f.make({ request: () => wait.promise })[method](method === 'list' ? filters : diaryRecord.id);
        await vi.waitFor(() => {});
        f.state.active = false;
        wait.resolve({ registros: [diaryRecord], registro: diaryRecord });
        await expect(promise).rejects.toMatchObject({ code: 'SESSAO_ALTERADA' });
        expect(save).not.toHaveBeenCalled();
    });
    it('bloqueia ausência de revisão e propagação de erro de armazenamento sem criar registro', async () => {
        const f = diaryFixture(), ops = f.make();
        await expect(ops.edit({ ...diaryRecord, revision: null }, { humor: 'neutro' })).rejects.toMatchObject({ code: 'REVISION_UNKNOWN' });
        vi.spyOn(f.store, 'enqueue').mockRejectedValue(new Error('Armazenamento indisponível'));
        await expect(ops.edit(diaryRecord, { humor: 'neutro' })).rejects.toThrow('Armazenamento indisponível');
        expect(f.state.queue).toEqual([]);
    });
    it('não confirma PATCH de A depois de trocar para B e mantém a intenção recuperável', async () => {
        const auth = { user: { id: 'a' }, epoch: 'a', token: 'synthetic' }, wait = deferred();
        const intent = { id: 'intent', type: 'record.update', payload: { recordId: diaryRecord.id, expected_version: 1, humor: 'neutro' } };
        const store = { userId: 'a', recoverInterrupted: vi.fn(), getQueue: vi.fn(async () => [intent]), markSending: vi.fn(async () => intent), acknowledge: vi.fn(), markFailed: vi.fn() };
        const request = vi.fn(() => wait.promise);
        const coordinator = createSyncCoordinator({ store, session: { getSnapshot: () => auth, ensureToken: async () => {} },
            locks: { request: (_name, task) => task() }, request, isOnline: () => true });
        const run = coordinator.run(); await vi.waitFor(() => expect(request).toHaveBeenCalled());
        auth.user = { id: 'b' }; auth.epoch = 'b'; wait.resolve({ registro: { ...diaryRecord, revision: 2 } });
        await run; expect(store.acknowledge).not.toHaveBeenCalled(); expect(store.markFailed).not.toHaveBeenCalled();
    });
    it('serviço encaminha escopo de conta e argumentos para o coordenador', async () => {
        const client = { diary: vi.fn(async () => ({})) };
        await listDiaryRecords(client, 'a:1', filters); await getDiaryRecord(client, 'a:1', diaryRecord.id, true);
        await createDiaryRecord(client, 'a:1', {}, diaryHabit.id); await editDiaryRecord(client, 'a:1', diaryRecord, {}, 'old', { revision: 2 });
        expect(client.diary.mock.calls.map(call => [call[0], call[2]])).toEqual(['list', 'detail', 'create', 'edit'].map(method => [method, 'a:1']));
    });
});
