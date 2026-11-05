const { validateHabitPatch, listEditableHabits } = require('../../habit-edit');

it('normalizes only editable fields and preserves the expected revision', () => {
    expect(validateHabitPatch({ revision: 3, nome_vicio: ' Café ', valor_economizado_por_dia: 1234.56, ativo: false })).toEqual({ revision: 3, patch: { nome_vicio: 'Café', valor_economizado_por_dia: 1234.56, ativo: false }, fields: {} });
});
it('keeps old-schema bootstrap available during rollout, without granting editability or hiding other failures', async () => {
    const selections = [], owners = [];
    let error = { code: '42703', message: 'column vicios.habit_start_editable does not exist' };
    const client = { from: () => ({
        select(fields) { selections.push(fields); this.fields = fields; return this; },
        eq(field, value) { owners.push([field, value]); return this; },
        async order() { return this.fields === '*' ? { data: [], error: null } : { data: null, error }; },
    }) };
    expect(await listEditableHabits(client, 'owner')).toEqual({ data: [], error: null });
    expect(selections).toEqual(['*, inicio_editavel:habit_start_editable', '*']);
    expect(owners).toEqual([['usuario_id', 'owner'], ['usuario_id', 'owner']]);
    error = { code: '42501', message: 'permission denied' };
    selections.length = 0;
    expect((await listEditableHabits(client, 'owner')).error).toEqual(error);
    expect(selections).toHaveLength(1);
});
it.each([
    { revision: 0, ativo: false }, { revision: 1 }, { revision: 1, usuario_id: 'other' },
    { revision: 1, data_inicio: '2026-02-30' }, { revision: 1, data_inicio: '9999-01-01' },
    { revision: 1, valor_economizado_por_dia: '10,00' }, { revision: 1, valor_economizado_por_dia: -1 },
    { revision: 1, valor_economizado_por_dia: 1.234 }, { revision: 1, ativo: 'false' }, { revision: 1, nome_vicio: null },
])('rejects invalid edit without passing data to PostgreSQL: %j', body => {
    expect(Object.keys(validateHabitPatch(body).fields).length).toBeGreaterThan(0);
});

describe('private personal reason', () => {
    const cases = require('../fixtures/personal-reason.cjs');
    it('normalizes whitespace and newlines and counts Unicode code points without truncation', () => {
        for (const { input, normalized } of cases) {
            const result = validateHabitPatch({ revision: 1, motivo_pessoal: input });
            expect(result.fields).toEqual({});
            expect(result.patch.motivo_pessoal === normalized).toBe(true);
        }
        for (const input of ['😀'.repeat(1001), 1, {}, [], false, '\u0000', '\ud800']) {
            expect(validateHabitPatch({ revision: 1, motivo_pessoal: input }).fields.motivo_pessoal).toBeTruthy();
        }
    });
    it('never adds a private field to an old-client patch', () => {
        expect(validateHabitPatch({ revision: 1, ativo: false }).patch).not.toHaveProperty('motivo_pessoal');
    });
    it('removes private keys recursively from raw DTOs without mutating the source', () => {
        const { omitPersonalReasons, privateHabitResponse } = require('../../habit-edit');
        const source = { vicios: [{ motivo_pessoal: 'synthetic-private-marker', id: 'h' }], receipt: { vicio: { motivo_pessoal: 'synthetic-private-marker' } } };
        expect(JSON.stringify(omitPersonalReasons(source)).includes('synthetic-private-marker')).toBe(false);
        expect(source.vicios[0]).toHaveProperty('motivo_pessoal');
        const response = { vary: vi.fn(), set: vi.fn(), json: vi.fn(body => body) };
        privateHabitResponse({ method: 'POST', originalUrl: '/api/v2/vicios/h/recaida', get: () => 'true' }, response, vi.fn());
        expect(JSON.stringify(response.json(source)).includes('synthetic-private-marker')).toBe(false);
    });
});
