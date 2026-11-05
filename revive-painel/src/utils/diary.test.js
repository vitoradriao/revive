import { afterEach, describe, expect, it, vi } from 'vitest';
import { inRecordPeriod, mergeRecords, projectRecords, recordCreation, recordPatch, recordValues, validateRecordFilters } from './diary';
import { diaryHabit, diaryRecord } from '../test/diaryFixture';

afterEach(() => vi.useRealTimers());
describe('contrato civil e edição do diário', () => {
    it('obtém o dia no envio depois de atravessar meia-noite e mantém a intenção criada', () => {
        vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 9, 22, 23, 59, 59));
        const form = recordValues(diaryRecord);
        vi.setSystemTime(new Date(2026, 9, 23, 0, 0, 1));
        const payload = recordCreation(form, diaryHabit.id);
        expect(payload.data_registro).toBe('2026-10-23');
        vi.setSystemTime(new Date(2026, 9, 24, 0, 0, 1));
        expect(payload.data_registro).toBe('2026-10-23');
    });
    it('preserva legado integral e envia somente mudanças, inclusive limpeza por null', () => {
        const legacy = { ...diaryRecord, observacoes: 'L'.repeat(1800) };
        expect(recordValues(legacy).observacoes).toHaveLength(1800);
        expect(recordPatch(legacy, { ...recordValues(legacy), humor: 'neutro' })).toEqual({ humor: 'neutro' });
        expect(recordPatch(legacy, { humor: '' })).toEqual({ humor: null });
        expect(() => recordPatch(legacy, { observacoes: 'X'.repeat(1001) })).toThrow(/1?000/);
        expect(recordPatch(legacy, { id: 'changed', data_registro: '2026-10-23', vicio_id: 'changed' })).toEqual({});
    });
    it.each([['humor', 100], ['gatilhos', 500], ['conquistas', 500], ['observacoes', 1000]])('valida %s somente quando alterado', (key, limit) => {
        expect(recordPatch({}, { [key]: 'X'.repeat(limit) })[key]).toHaveLength(limit);
        expect(() => recordPatch({}, { [key]: 'X'.repeat(limit + 1) })).toThrow();
    });
    it('ordena empates por ID, elimina repetidos e conserva a revisão mais recente', () => {
        const other = { ...diaryRecord, id: diaryRecord.id.replace(/1$/, '2') };
        expect(mergeRecords([diaryRecord, other], [{ ...diaryRecord, revision: 3 }], [diaryRecord])).toEqual([other, { ...diaryRecord, revision: 3 }]);
    });
    it('projeta create→update sem duplicar o registro local e não modifica o cache', () => {
        const queue = [{ type: 'record.create', localId: 'local:1', payload: diaryRecord },
            { type: 'record.update', payload: { recordId: 'local:1', humor: 'neutro' } }];
        const projected = projectRecords([], queue);
        expect(projected).toHaveLength(1); expect(projected[0].humor).toBe('neutro');
        expect(queue[0].payload.humor).toBe('bom');
    });
    it('filtra datas civis inclusivas e limita intervalo/página', () => {
        const filters = { inicio: '2026-10-22', fim: '2026-10-22', limit: 100 };
        expect(inRecordPeriod(diaryRecord, filters)).toBe(true);
        expect(() => validateRecordFilters(filters)).not.toThrow();
        for (const invalid of [{ inicio: '2026-02-30' }, { fim: '2026-10-21' }, { inicio: '2010-01-01' }, { limit: 101 }, { limit: 0 }]) {
            expect(() => validateRecordFilters({ ...filters, ...invalid })).toThrow();
        }
    });
});
