import { describe, expect, it, vi } from 'vitest';
import { defaultPreferences, mergeIndicatorOrder, resolvePrimary, visibleIndicators } from '../utils/journeyPreferences';
import { syncPreferences } from '../offline/journey-preferences';

describe('preferências sincronizadas', () => {
    it('preserva IDs futuros sem exibir métricas desconhecidas nem remover os indicadores existentes', () => {
        const order = ['future_metric', 'accumulated_savings', 'accumulated_savings'];
        expect(mergeIndicatorOrder(order)).toEqual(['future_metric', 'accumulated_savings', 'current_streak', 'historical_record', 'sequence_savings']);
        expect(visibleIndicators(order).map(item => item.id)).toEqual(['accumulated_savings', 'current_streak', 'historical_record', 'sequence_savings']);
    });
    it('resolve principal arquivado e catálogo vazio sem fabricar hábito ativo', () => {
        const preferences = { primary_habit_id: 'old' }, habits = [{ id: 'old', ativo: false }, { id: 'active' }];
        expect(resolvePrimary(preferences, habits)).toEqual({ habit: habits[1], needsReview: true });
        expect(resolvePrimary(preferences, [])).toEqual({ habit: undefined, needsReview: true });
        expect(resolvePrimary(defaultPreferences(), habits).needsReview).toBe(false);
    });
    it('grava somente resposta confirmada e mantém operações offline fora da fila', async () => {
        const store = { savePreferences: vi.fn() }, request = vi.fn(async () => ({ preferences: defaultPreferences() }));
        const args = { store, request, check: vi.fn(), isOnline: () => true };
        await syncPreferences(args); expect(store.savePreferences).toHaveBeenCalledOnce();
        store.savePreferences.mockClear();
        await expect(syncPreferences({ ...args, isOnline: () => false, input: defaultPreferences() })).rejects.toMatchObject({ code: 'OFFLINE' });
        expect(store.savePreferences).not.toHaveBeenCalled(); expect(request).toHaveBeenCalledOnce();
        request.mockRejectedValueOnce(Object.assign(new Error('conflito'), { status: 409 }));
        await expect(syncPreferences({ ...args, input: defaultPreferences() })).rejects.toMatchObject({ status: 409 });
        expect(store.savePreferences).not.toHaveBeenCalled();
    });
    it('recusa resposta tardia de outra geração antes de gravar no cache', async () => {
        let changed = false;
        const store = { savePreferences: vi.fn() };
        const request = async () => { changed = true; return { preferences: defaultPreferences() }; };
        await expect(syncPreferences({ store, request, isOnline: () => true, check: () => { if (changed) throw new Error('conta mudou'); } })).rejects.toThrow('conta mudou');
        expect(store.savePreferences).not.toHaveBeenCalled();
    });
});
