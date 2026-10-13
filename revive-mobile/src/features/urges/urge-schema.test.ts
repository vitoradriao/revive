import { expect, it } from '@jest/globals';
import { urgeSchema } from './urge-schema';
const input = { vicio_id: 'habit', occurred_at: '2026-01-01T12:00:00.000Z', timezone: 'America/Sao_Paulo', intensidade: 0 };
it('accepts the entire intensity range and leaves all descriptive fields optional', () => {
  expect(urgeSchema.parse(input)).toMatchObject({ intensidade: 0, gatilhos: [] });
  expect(urgeSchema.parse({ ...input, intensidade: 10, nota: 'n'.repeat(1000), acao_realizada: null, gatilhos: ['future_code'] })).toMatchObject({ intensidade: 10, gatilhos: ['future_code'] });
});
it('rejects fractions, out-of-range intensity, future dates, duplicate triggers, extra fields and overlong text', () => {
  for (const patch of [{ intensidade: -1 },{ intensidade: 11 },{ intensidade: 2.5 },{ gatilhos: ['estresse','estresse'] },{ nota: 'n'.repeat(1001) },{ timezone: 'bad/zone' },{ occurred_at: new Date(Date.now()+600000).toISOString() },{ occurred_at: '2026-10-13' },{ resetarContador: true }]) expect(urgeSchema.safeParse({...input,...patch}).success).toBe(false);
});
