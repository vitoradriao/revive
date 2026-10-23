import { describe, it, expect } from 'vitest';
import cases from '../../../tests/fixtures/personal-reason.cjs';
import { normalizePersonalReason, personalReasonLength, exportHabit } from '../utils/personalReason';
import { createHabitDraft, habitEditPatch } from '../utils/habitEdit';
import { managementFixture } from '../test/habitManagementFixture';

describe('motivo privado e exportação padrão', () => {
    it('usa os mesmos casos de normalização e limite da API', () => {
        for (const { input, normalized } of cases) {
            expect(normalizePersonalReason(input) === normalized).toBe(true);
            expect(personalReasonLength(input)).toBe([...(normalized || '')].length);
        }
        const f = managementFixture(), draft = createHabitDraft(f.data.vicios[0]);
        draft.values.personalReason = '😀'.repeat(1000);
        expect(habitEditPatch(draft).motivo_pessoal === draft.values.personalReason).toBe(true);
        draft.values.personalReason += '😀';
        expect(() => habitEditPatch(draft)).toThrow('1000');
        expect(personalReasonLength(draft.values.personalReason)).toBe(1001);
    });
    it('omite campo inalterado e rascunho antigo; vazio remove sem tocar outros campos', () => {
        const f = managementFixture();
        const draft = createHabitDraft({ ...f.data.vicios[0], motivo_pessoal: 'synthetic-private-marker' });
        expect(habitEditPatch(draft)).toEqual({ revision: 1 });
        delete draft.values.personalReason;
        expect(habitEditPatch(draft)).toEqual({ revision: 1 });
        draft.values.personalReason = ' \n';
        expect(habitEditPatch(draft)).toEqual({ revision: 1, motivo_pessoal: null });
    });
    it('exporta só campos públicos conhecidos e não altera o snapshot privado', () => {
        const habit = { id: 'h', nome_vicio: 'Sintético', motivo_pessoal: 'synthetic-private-marker', futurePrivateField: 'synthetic-private-marker' };
        expect(exportHabit(habit)).toEqual({ id: 'h', nome_vicio: 'Sintético' });
        expect(habit).toHaveProperty('motivo_pessoal');
    });
    it('preserva motivo e revisão no conflito entre abas e no cache confirmado', async () => {
        const f = managementFixture();
        await f.prepare('a', { personalReason: 'synthetic-first' });
        await f.prepare('b', { personalReason: 'synthetic-second' });
        const c = f.makeCoordinator();
        const a = await c.manageHabit('habit-1', 'a', { revision: 1, motivo_pessoal: 'synthetic-first' });
        const b = await c.manageHabit('habit-1', 'b', { revision: 1, motivo_pessoal: 'synthetic-second' });
        expect(a.status).toBe('confirmed'); expect(b.status).toBe('conflict');
        expect(b.values.personalReason === 'synthetic-second').toBe(true);
        expect(b.remote.motivo_pessoal === 'synthetic-first').toBe(true);
        expect((await f.store.getSnapshot()).data.vicios[0].motivo_pessoal === 'synthetic-first').toBe(true);
        expect(f.request.mock.calls.filter(([, options]) => options?.method === 'PATCH')).toHaveLength(1);
    });
});
