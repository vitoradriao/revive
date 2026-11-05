import { afterEach, describe, expect, it, vi } from 'vitest';
import { managementFixture } from '../test/habitManagementFixture';
import { createHabitDraft, habitEditPatch, habitHasPending } from '../utils/habitEdit';
import { patchHabit } from './vicios.service';
import fixtures from '../../../tests/fixtures/progress.cjs';
import { accountAccumulatedSavings } from '../utils/progressMetrics';

afterEach(() => vi.useRealTimers());
const patchCalls = fixture => fixture.request.mock.calls.filter(([, options]) => options?.method === 'PATCH');

describe('edição versionada e coordenação do hábito', () => {
    it('duas abas com a mesma revisão produzem um sucesso e um conflito durável, sem sobrescrita', async () => {
        const f = managementFixture();
        await f.prepare('tab-a', { name: 'Nome A' });
        await f.prepare('tab-b', { name: 'Nome B' });
        const a = f.makeCoordinator(), b = f.makeCoordinator();
        const result = await Promise.all([
            a.manageHabit('habit-1', 'tab-a', { revision: 1, nome_vicio: 'Nome A' }),
            b.manageHabit('habit-1', 'tab-b', { revision: 1, nome_vicio: 'Nome B' })
        ]);
        expect(result.map(item => item.status)).toEqual(['confirmed', 'conflict']);
        expect(f.data.vicios[0]).toMatchObject({ nome_vicio: 'Nome A', revision: 2 });
        expect(patchCalls(f)).toHaveLength(1);
        b.dispose();
        const reloaded = await f.store.getHabitDraft('tab-b');
        expect(reloaded).toMatchObject({ values: { name: 'Nome B' }, base: { revision: 1 }, remote: { nome_vicio: 'Nome A', revision: 2 } });
        const resumed = f.makeCoordinator();
        await expect(resumed.manageHabit('habit-1', 'tab-b', { revision: 2, nome_vicio: 'Nome B' })).rejects.toMatchObject({ code: 'REVIEW_REQUIRED' });
        await f.store.saveHabitDraft('tab-b', { ...reloaded, base: reloaded.remote, remote: null, status: 'draft' });
        expect((await resumed.manageHabit('habit-1', 'tab-b', { revision: 2, nome_vicio: 'Nome B' })).status).toBe('confirmed');
        expect(f.data.vicios[0].revision).toBe(3);
    });
    it('trata disputa de outra sessão entre consulta e PATCH como conflito, sem repetir', async () => {
        const f = managementFixture(); await f.prepare('tab-a', { name: 'Meu rascunho' });
        const original = f.request.getMockImplementation();
        f.request.mockImplementation(async (path, options) => {
            if (options?.method === 'PATCH') Object.assign(f.data.vicios[0], { revision: 2, nome_vicio: 'Outra sessão' });
            return original(path, options);
        });
        const result = await f.makeCoordinator().manageHabit('habit-1', 'tab-a', { revision: 1, nome_vicio: 'Meu rascunho' });
        expect(result).toMatchObject({ status: 'conflict', values: { name: 'Meu rascunho' }, remote: { revision: 2 } });
        expect(patchCalls(f)).toHaveLength(1);
    });
    it('reconcilia registros antes de arquivar e preserva histórico, metas, conquistas e início', async () => {
        const f = managementFixture(); await f.prepare('tab-a', { name: 'Edição ainda não enviada' });
        f.data.metas.push({ id: 'goal', vicio_id: 'habit-1' }); f.data.conquistas.push({ id: 'award' });
        const coordinator = f.makeCoordinator();
        await coordinator.enqueue('record.create', { vicio_id: 'habit-1' }, { id: 'event' });
        const result = await coordinator.manageHabit('habit-1', 'tab-a', { revision: 1, ativo: false });
        expect(result).toMatchObject({ status: 'confirmed', values: { name: 'Edição ainda não enviada' } });
        expect(await f.store.getQueue()).toEqual([]);
        const cached = (await f.store.getSnapshot()).data;
        expect(cached.vicios[0]).toMatchObject({ ativo: false, data_inicio: '2026-01-01' });
        expect(cached.registros).toHaveLength(1); expect(cached.metas).toHaveLength(1); expect(cached.conquistas).toHaveLength(1);
        expect(f.request.mock.calls.findIndex(([path]) => path === '/v2/registros')).toBeLessThan(f.request.mock.calls.findIndex(([, options]) => options?.method === 'PATCH'));
    });
    it('bloqueia arquivo com pendência incompatível sem descarte e bloqueia novo evento após arquivo', async () => {
        const f = managementFixture(); await f.prepare();
        const c = f.makeCoordinator();
        await c.enqueue('record.create', { vicio_id: 'habit-1' }, { id: 'event' });
        await f.store.markFailed('event', { code: 'VALIDACAO' });
        await expect(c.manageHabit('habit-1', 'tab-a', { revision: 1, ativo: false })).rejects.toMatchObject({ code: 'PENDING_INTENTS' });
        expect(await f.store.getQueue()).toHaveLength(1); expect(patchCalls(f)).toHaveLength(0);
        await f.store.saveSnapshot({ ...f.data, vicios: [{ ...f.data.vicios[0], ativo: false }] });
        await expect(c.enqueue('record.create', { vicio_id: 'habit-1' }, { id: 'new' })).rejects.toMatchObject({ code: 'HABITO_ARQUIVADO' });
    });
    it('reativação isolada desbloqueia evento recusado, sem reenviá-lo automaticamente', async () => {
        const f = managementFixture(); const c = f.makeCoordinator();
        await c.enqueue('record.create', { vicio_id: 'habit-1' }, { id: 'event' });
        f.data.vicios[0].ativo = false;
        await c.run();
        expect((await f.store.getQueue())[0]).toMatchObject({ status: 'recovery', lastError: { code: 'HABITO_ARQUIVADO' } });
        await f.prepare();
        expect((await c.manageHabit('habit-1', 'tab-a', { revision: 1, ativo: true })).status).toBe('confirmed');
        expect(f.data.registros).toHaveLength(0); expect(await f.store.getQueue()).toHaveLength(1);
        await c.retry('event');
        expect(f.data.registros).toHaveLength(1); expect(await f.store.getQueue()).toEqual([]);
    });
    it('não permite usar reativação com outros campos para contornar pendências', async () => {
        const f = managementFixture(); await f.prepare();
        const c = f.makeCoordinator();
        await c.enqueue('record.create', { vicio_id: 'habit-1' }, { id: 'event' });
        f.data.vicios[0].ativo = false; await c.run();
        await expect(c.manageHabit('habit-1', 'tab-a', { revision: 1, ativo: true, nome_vicio: 'Novo nome' })).rejects.toMatchObject({ code: 'PENDING_INTENTS' });
    });
    it('permite início sem histórico e recusa após reconciliação criar histórico', async () => {
        const f = managementFixture(); await f.prepare(); const c = f.makeCoordinator();
        expect((await c.manageHabit('habit-1', 'tab-a', { revision: 1, data_inicio: '2026-01-02' })).status).toBe('confirmed');
        await c.enqueue('record.create', { vicio_id: 'habit-1' }, { id: 'event' });
        const result = await c.manageHabit('habit-1', 'tab-a', { revision: 2, data_inicio: '2026-01-03' });
        expect(result.status).toBe('conflict'); expect(result.remote.inicio_editavel).toBe(false);
        expect(f.data.vicios[0].data_inicio).toBe('2026-01-02'); expect(patchCalls(f)).toHaveLength(1);
    });
    it('preserva restrição de início quando o servidor ganha a corrida após consulta', async () => {
        const f = managementFixture(); await f.prepare();
        const original = f.request.getMockImplementation();
        f.request.mockImplementation(async (path, options) => {
            if (options?.method === 'PATCH') f.data.vicios[0].inicio_editavel = false;
            return original(path, options);
        });
        const result = await f.makeCoordinator().manageHabit('habit-1', 'tab-a', { revision: 1, data_inicio: '2026-01-03' });
        expect(result).toMatchObject({ status: 'conflict', remote: { inicio_editavel: false } });
        expect(f.data.vicios[0].data_inicio).toBe('2026-01-01');
    });
    it('serializa enqueue durante PATCH e impede novo evento no hábito arquivado', async () => {
        const f = managementFixture(); await f.prepare();
        let release, started;
        const entered = new Promise(resolve => { started = resolve; });
        const barrier = new Promise(resolve => { release = resolve; });
        const original = f.request.getMockImplementation();
        f.request.mockImplementation(async (path, options) => {
            if (options?.method === 'PATCH') { started(); await barrier; }
            return original(path, options);
        });
        const a = f.makeCoordinator(), b = f.makeCoordinator();
        const archive = a.manageHabit('habit-1', 'tab-a', { revision: 1, ativo: false });
        await entered;
        const event = b.enqueue('record.create', { vicio_id: 'habit-1' }, { id: 'event' }).catch(error => error);
        expect(f.store.enqueue).not.toHaveBeenCalled();
        release(); await archive;
        expect(await event).toMatchObject({ code: 'HABITO_ARQUIVADO' });
    });
    it('offline não envia PATCH e não altera a fila', async () => {
        const f = managementFixture(); await f.prepare();
        await expect(f.makeCoordinator({ isOnline: () => false }).manageHabit('habit-1', 'tab-a', { revision: 1, ativo: false })).rejects.toMatchObject({ code: 'OFFLINE' });
        expect(f.request).not.toHaveBeenCalled(); expect(f.drafts.get('tab-a').status).toBe('draft');
    });
    it('resposta perdida mantém estado incerto após reload; consulta não reaplica nem alega confirmação', async () => {
        const f = managementFixture(); await f.prepare();
        const original = f.request.getMockImplementation();
        f.request.mockImplementation(async (path, options) => {
            const response = await original(path, options);
            if (options?.method === 'PATCH') throw Object.assign(new Error('Resposta perdida'), { outcomeUnknown: true });
            return response;
        });
        const c = f.makeCoordinator();
        expect((await c.manageHabit('habit-1', 'tab-a', { revision: 1, ativo: false })).status).toBe('uncertain');
        expect((await f.store.getHabitDraft('tab-a')).status).toBe('uncertain');
        c.dispose(); const resumed = f.makeCoordinator();
        const review = await resumed.manageHabit('habit-1', 'tab-a', null);
        expect(review).toMatchObject({ status: 'review', remote: { ativo: false, revision: 2 } });
        expect(patchCalls(f)).toHaveLength(1);
    });
    it('troca A/B durante PATCH impede publicação e mantém marcador de A para recuperação', async () => {
        const f = managementFixture(); await f.prepare(); const notify = vi.fn();
        const original = f.request.getMockImplementation();
        f.request.mockImplementation(async (path, options) => {
            const response = await original(path, options);
            if (options?.method === 'PATCH') { notify.mockClear(); Object.assign(f.auth, { user: { id: 'account-b' }, epoch: 'generation-b' }); }
            return response;
        });
        await expect(f.makeCoordinator({ onChange: notify }).manageHabit('habit-1', 'tab-a', { revision: 1, ativo: false })).rejects.toMatchObject({ code: 'SESSAO_ALTERADA' });
        expect(f.drafts.get('tab-a').status).toBe('uncertain'); expect(notify).not.toHaveBeenCalled();
        expect((await f.store.getSnapshot()).data.vicios[0].ativo).toBe(true);
    });
    it('timeout cancela transporte em 20 segundos e nunca confirma nem repete', async () => {
        vi.useFakeTimers();
        const request = vi.fn((_path, options) => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('Tempo esgotado')))));
        const result = patchHabit('habit-1', { revision: 1, ativo: false }, request).catch(error => error);
        await vi.advanceTimersByTimeAsync(20000);
        expect(await result).toBeInstanceOf(Error); expect(request).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
    });
    it('falha na consulta após PATCH confirmado ainda exige consulta antes de reaplicar', async () => {
        const f = managementFixture(); await f.prepare();
        const original = f.request.getMockImplementation();
        let applied = false;
        f.request.mockImplementation(async (path, options) => {
            if (path === '/v2/bootstrap' && applied) throw Object.assign(new Error('Sessão expirada'), { status: 401 });
            const result = await original(path, options);
            if (options?.method === 'PATCH') applied = true;
            return result;
        });
        const result = await f.makeCoordinator().manageHabit('habit-1', 'tab-a', { revision: 1, ativo: false });
        expect(result.status).toBe('uncertain');
        expect((await f.store.getHabitDraft('tab-a')).status).toBe('uncertain');
        expect(patchCalls(f)).toHaveLength(1);
    });
    it('falha ao persistir marcador impede PATCH', async () => {
        const f = managementFixture(); await f.prepare(); f.store.saveHabitDraft.mockRejectedValue(new Error('Armazenamento indisponível'));
        await expect(f.makeCoordinator().manageHabit('habit-1', 'tab-a', { revision: 1, ativo: false })).rejects.toThrow('Armazenamento');
        expect(patchCalls(f)).toHaveLength(0);
    });
});

describe('campos alterados, economia prospectiva e dependências', () => {
    it('envia apenas taxa alterada; o progresso antes/depois usa segmentos canônicos, como no mobile', async () => {
        const f = managementFixture(); const draft = await f.prepare('tab-a', { dailySavings: '20,00' });
        const patch = habitEditPatch(draft);
        expect(patch).toEqual({ revision: 1, valor_economizado_por_dia: 20 });
        const before = fixtures.progressFixture(), after = fixtures.progressFixture({ prospective: true });
        expect(accountAccumulatedSavings(before.vicios).value).toBe(320);
        const original = f.request.getMockImplementation();
        f.request.mockImplementation(async (path, options) => {
            const result = await original(path, options);
            if (options?.method === 'PATCH') f.data.vicios[0].progresso = after.vicios[0].progresso;
            return result;
        });
        await f.makeCoordinator().manageHabit('habit-1', 'tab-a', patch);
        const cached = (await f.store.getSnapshot()).data.vicios;
        expect(accountAccumulatedSavings(cached).value).toBe(330);
        expect(cached[0].valor_economizado_por_dia).toBe(20);
        expect(accountAccumulatedSavings(cached).value).not.toBe(32 * 20);
    });
    it('não envia campos inalterados nem permite início bloqueado ou taxa fora do contrato', () => {
        const f = managementFixture(), draft = createHabitDraft(f.data.vicios[0]);
        expect(habitEditPatch(draft)).toEqual({ revision: 1 });
        draft.values.dailySavings = '100000000'; expect(() => habitEditPatch(draft)).toThrow('limite');
        draft.values.dailySavings = '10'; draft.values.startDate = '2026-01-03'; draft.base.inicio_editavel = false;
        expect(() => habitEditPatch(draft)).toThrow('histórico');
    });
    it('resolve metas, registros em páginas, dependências e referências desconhecidas sem descartar', () => {
        const data = { metas: [{ id: 'goal', vicio_id: 'habit-1' }], registros: [] };
        expect(habitHasPending('habit-1', [{ type: 'goal.complete', payload: { goalId: 'goal' } }], data)).toBe(true);
        const record = [{ type: 'record.update', payload: { recordId: 'record' } }];
        expect(habitHasPending('habit-1', record, data)).toBe(true);
        expect(habitHasPending('habit-1', record, data, [{ data: { registros: [{ id: 'record', vicio_id: 'other' }] } }])).toBe(false);
        expect(habitHasPending('habit-1', [{ type: 'goal.complete', dependsOn: 'create', payload: {} }, { id: 'create', type: 'goal.create', payload: { vicio_id: 'habit-1' } }], data)).toBe(true);
    });
});
