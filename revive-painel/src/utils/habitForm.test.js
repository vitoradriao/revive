import { describe, expect, it } from 'vitest';
import { localDateKey, parseDailySavings, validateHabitForm } from './habitForm';

describe('habit form contract', () => {
  it.each([
    ['', 0], ['  ', 0], ['0', 0], ['12,50', 12.5], ['12.50', 12.5],
    ['1.234,56', 1234.56], ['R$ 1.234,56', 1234.56], ['1.234', 1234], ['999.999.999,99', 999999999.99]
  ])('parses %s without truncating decimal cents', (value, expected) => {
    expect(parseDailySavings(value)).toBe(expected);
  });
  it.each(['-1', 'NaN', 'Infinity', '1e3', '1,234', '12.34,56', '1.2.3', '1000000000', 'abc'])('rejects %s', value => {
    expect(parseDailySavings(value)).toBeUndefined();
  });
  it.each(['', '1899-12-31', '2026-02-29', '2026-04-31', '2026-13-01', '16/10/2026', '2026-10-17'])('rejects invalid or future date %s', startDate => {
    expect(validateHabitForm({ name: 'Café', startDate, dailySavings: '' }, '2026-10-16').errors.startDate).toBeTruthy();
  });
  it('uses local calendar components and validates leap days', () => {
    expect(localDateKey(new Date(2026, 9, 16, 23, 59))).toBe('2026-10-16');
    expect(validateHabitForm({ name: ' Café ', startDate: '2024-02-29', dailySavings: '12,50' }, '2026-10-16')).toEqual({
      errors: {}, payload: { nome_vicio: 'Café', data_inicio: '2024-02-29', valor_economizado_por_dia: 12.5 }
    });
  });
  it.each(['', ' x ', 'x'.repeat(121)])('rejects an invalid name', name => {
    expect(validateHabitForm({ name, startDate: '2026-10-16', dailySavings: '' }, '2026-10-16').errors.name).toBeTruthy();
  });
});
