import { afterEach, describe, expect, it, vi } from 'vitest';
import { goalPayload, relapsePayload } from '../utils/goalIntent';
import { goalFixture, goalInput, relapseInput } from '../test/goalFixture';
import { createGoalIntent, completeGoalIntent, deleteConfirmedGoal } from './metas.service';
import { createRelapseIntent } from './recaidas.service';

afterEach(() => vi.useRealTimers());
describe('metas e recaídas duráveis', () => {
    it('normaliza DTO como no mobile sem enviar bases numéricas nem campos de edição genérica', () => {
        expect(goalPayload({ ...goalInput, dias_objetivo: '30', dias_abstinencia_inicio: 200, valor_economizado_inicio: 500, usuario_id: 'other' })).toEqual(goalInput);
        expect(goalPayload({ ...goalInput, iniciar_hoje: false })).toEqual({ ...goalInput, iniciar_hoje: false, data_inicio_meta: null });
        for (const patch of [{ dias_objetivo: 1.5 }, { dias_objetivo: 36501 }, { dias_objetivo: '', valor_objetivo: '' }, { valor_objetivo: -1 }, { valor_objetivo: 1.234 }, { descricao_meta: ' '.repeat(2) }]) expect(() => goalPayload({ ...goalInput, ...patch })).toThrow();
    });
    it('mantém escolha explícita, instante e fuso da recaída', () => {
        expect(relapsePayload(relapseInput)).toEqual({ ...relapseInput, occurred_at: '2026-10-01T13:00:00.000Z' });
        expect(() => relapsePayload({ ...relapseInput, resetarContador: undefined })).toThrow('explicitamente');
        expect(() => relapsePayload({ ...relapseInput, timezone: 'invalid' })).toThrow('fuso');
        expect(() => relapsePayload({ ...relapseInput, occurred_at: '2099-01-01T00:00:00Z' })).toThrow('momento');
        expect(() => relapsePayload({ ...relapseInput, motivo: 'x'.repeat(1001) })).toThrow('1000');
    });
    it('serviços usam o coordenador com conta explícita', async () => {
        const client = { goals: vi.fn() };
        await createGoalIntent(client, 'a', goalInput, 'key'); await completeGoalIntent(client, 'a', 'goal');
        await deleteConfirmedGoal(client, 'a', 'goal'); await createRelapseIntent(client, 'a', relapseInput, 'event');
        expect(client.goals.mock.calls).toEqual([['create', [goalInput, 'key'], 'a'], ['complete', ['goal'], 'a'], ['delete', ['goal'], 'a'], ['relapse', [relapseInput, 'event'], 'a']]);
    });
    it('dupla criação com mesma chave persiste uma intenção offline antes de qualquer rede', async () => {
        const f = goalFixture(), c = f.make();
        await Promise.all([c.goals('create', [goalInput, 'key']), c.goals('create', [goalInput, 'key'])]);
        expect(f.queue).toHaveLength(1); expect(f.request).not.toHaveBeenCalled();
    });
    it('dupla conclusão em duas abas mantém uma intenção e aceita meta de hábito arquivado', async () => {
        const f = goalFixture(); f.data.vicios[0].ativo = false;
        await Promise.all([f.make().goals('complete', ['goal']), f.make().goals('complete', ['goal'])]);
        expect(f.queue).toHaveLength(1); expect(f.queue[0].payload).toEqual({ goalId: 'goal', concluida: true });
    });
    it('conclusão local depende da criação e resolve mapeamento após confirmação', async () => {
        const f = goalFixture(), c = f.make();
        await c.goals('create', [goalInput, 'key']); await c.goals('complete', ['local:key']);
        expect(f.queue[1].dependsOn).toBe('key');
        f.queue.length = 0; f.mappings.set('key', { entityId: 'goal' });
        await c.goals('complete', ['local:key']); await c.goals('complete', ['local:key']);
        expect(f.queue).toHaveLength(1); expect(f.queue[0].payload.goalId).toBe('goal');
    });
    it('recibos e meta já concluída não recriam intenções', async () => {
        const f = goalFixture(), c = f.make(); f.receipts.set('key', { kind: 'confirmed' });
        expect(await c.goals('create', [goalInput, 'key'])).toMatchObject({ confirmed: true });
        f.data.metas[0].concluida = true;
        expect(await c.goals('complete', ['goal'])).toMatchObject({ confirmed: true });
        expect(f.store.enqueue).not.toHaveBeenCalled();
    });
    it('não converte chave confirmada com outro conteúdo em sucesso', async () => {
        const f = goalFixture(); f.receipts.set('key', { kind: 'confirmed', type: 'goal.create', intentPayload: goalInput });
        await expect(f.make().goals('create', [{ ...goalInput, dias_objetivo: 31 }, 'key'])).rejects.toMatchObject({ code: 'INTENT_KEY_REUSED' });
        expect(f.store.enqueue).not.toHaveBeenCalled();
    });
    it('archive durante formulário impede novas metas/recaídas e preserva pendências', async () => {
        const f = goalFixture(), c = f.make(); await c.goals('create', [goalInput, 'key']);
        f.data.vicios[0].ativo = false;
        await expect(c.goals('create', [goalInput, 'new'])).rejects.toMatchObject({ code: 'HABITO_ARQUIVADO' });
        await expect(c.goals('relapse', [relapseInput, 'event'])).rejects.toMatchObject({ code: 'HABITO_ARQUIVADO' });
        expect(f.queue).toHaveLength(1);
    });
    it('falha na persistência não envia nem alega sucesso', async () => {
        const f = goalFixture(); f.store.enqueue.mockRejectedValue(new Error('Quota indisponível'));
        await expect(f.make().goals('create', [goalInput, 'key'])).rejects.toThrow('Quota'); expect(f.request).not.toHaveBeenCalled();
    });
    it.each([goalInput, relapseInput])('retry preserva chave e payload após timeout de commit', async input => {
        const f = goalFixture(), type = input.addictionId ? 'relapse' : 'create';
        const c = f.make({ isOnline: () => true }); await c.goals(type, [input, 'stable']);
        const before = structuredClone(f.queue[0].payload);
        f.request.mockRejectedValueOnce(new Error('Timeout após commit'));
        await c.run(); expect(f.queue).toHaveLength(1);
        await c.run(); expect(f.queue).toHaveLength(0);
        const calls = f.request.mock.calls.filter(([, options]) => options?.method);
        expect(calls).toHaveLength(2);
        expect(calls[0][0]).toBe(calls[1][0]);
        expect(calls[0][1].body).toBe(calls[1][1].body);
        expect(calls[0][1].headers).toEqual(calls[1][1].headers);
        expect(calls[0][1].headers['Idempotency-Key']).toBe('stable');
        const expected = { ...before }; delete expected.addictionId;
        expect(JSON.parse(calls[0][1].body)).toEqual(expected);
    });
    it('sessão expirada preserva intenção sem enviar', async () => {
        const f = goalFixture(); const c = f.make({ isOnline: () => true }); await c.goals('relapse', [relapseInput, 'event']);
        f.session.ensureToken.mockRejectedValue(Object.assign(new Error('Sessão expirada'), { status: 401 }));
        await expect(c.run()).rejects.toThrow('Sessão expirada'); expect(f.queue).toHaveLength(1); expect(f.request).not.toHaveBeenCalled();
    });
    it.each(['create', 'complete', 'relapse', 'delete'])('A/B durante %s não publica resposta tardia nem descarta intenção', async method => {
        const f = goalFixture(), notify = vi.fn(), c = f.make({ isOnline: () => true, onChange: notify });
        if (method !== 'delete') await c.goals(method, method === 'complete' ? ['goal'] : [method === 'relapse' ? relapseInput : goalInput, 'key']);
        f.request.mockImplementation(async () => { f.auth.epoch = 'b'; f.auth.user = { id: 'b' }; notify.mockClear(); return { meta: { id: 'goal' }, mensagem: 'Meta excluida com sucesso' }; });
        if (method === 'delete') await expect(c.goals('delete', ['goal'])).rejects.toMatchObject({ code: 'SESSAO_ALTERADA' });
        else await c.run();
        expect(f.store.acknowledge).not.toHaveBeenCalled(); expect(f.store.removeGoal).not.toHaveBeenCalled(); expect(notify).not.toHaveBeenCalled();
        if (method !== 'delete') expect(f.queue).toHaveLength(1);
    });
    it('exclusão offline, local ou com conclusão pendente não envia e não descarta', async () => {
        const f = goalFixture(); await expect(f.make().goals('delete', ['goal'])).rejects.toMatchObject({ code: 'OFFLINE' });
        const c = f.make({ isOnline: () => true }); await c.goals('complete', ['goal']);
        await expect(c.goals('delete', ['goal'])).rejects.toMatchObject({ code: 'PENDING_INTENTS' });
        await expect(c.goals('delete', ['local:key'])).rejects.toMatchObject({ code: 'PENDING_INTENTS' });
        expect(f.request).not.toHaveBeenCalled(); expect(f.queue).toHaveLength(1);
    });
    it('exclusão do hábito respeita criação e conclusão dependentes sem descartar', async () => {
        const f = goalFixture(), c = f.make({ isOnline: () => true });
        await c.goals('create', [goalInput, 'key']); await c.goals('complete', ['local:key']);
        await expect(c.goals('deleteHabit', ['habit'])).rejects.toMatchObject({ code: 'PENDING_INTENTS' });
        expect(f.queue).toHaveLength(2); expect(f.request).not.toHaveBeenCalled(); expect(f.store.removeHabit).not.toHaveBeenCalled();
        f.queue.length = 0;
        f.request.mockResolvedValueOnce({ mensagem: 'Vicio excluido definitivamente com sucesso' });
        await expect(c.goals('deleteHabit', ['habit'])).resolves.toEqual({ confirmed: true });
        expect(f.store.removeHabit).toHaveBeenCalledWith('habit');
    });
    it('exclusão falha ou resposta inválida nunca remove a meta; confirmação remove só a meta', async () => {
        const f = goalFixture(), c = f.make({ isOnline: () => true });
        f.request.mockRejectedValueOnce(Object.assign(new Error('Falha na exclusão'), { status: 500 }));
        await expect(c.goals('delete', ['goal'])).rejects.toThrow('Falha');
        f.request.mockResolvedValueOnce({}); await expect(c.goals('delete', ['goal'])).rejects.toMatchObject({ code: 'DELETE_UNCONFIRMED' });
        expect(f.store.removeGoal).not.toHaveBeenCalled();
        expect(await c.goals('delete', ['goal'])).toEqual({ confirmed: true }); expect(f.data.metas).toEqual([]);
    });
});
