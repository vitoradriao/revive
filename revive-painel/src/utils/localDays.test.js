import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { activityDays, localDayKey, recordsInPeriod } from './progressMetrics';

// 22:30 em São Paulo já é o dia seguinte em UTC: o caso que deslocava registros.
const EVENING_IN_BRAZIL = new Date('2026-03-11T01:30:00.000Z');

describe('dias civis locais no painel', () => {
  const originalTz = process.env.TZ;
  beforeAll(() => { process.env.TZ = 'America/Sao_Paulo'; });
  afterAll(() => { process.env.TZ = originalTz; });

  it('keeps civil dates and converts instants to the device day', () => {
    expect(localDayKey('2026-03-10')).toBe('2026-03-10');
    expect(localDayKey('2026-03-11T01:30:00.000Z')).toBe('2026-03-10');
    expect(localDayKey('')).toBe('');
    expect(localDayKey('não é data')).toBe('');
  });

  it('counts "today" by the device day, not the UTC day', () => {
    const records = [{ data_registro: '2026-03-10' }, { data_registro: '2026-03-11' }];
    expect(recordsInPeriod(records, 'data_registro', 1, EVENING_IN_BRAZIL)).toEqual([{ data_registro: '2026-03-10' }]);
  });

  it('places an evening relapse on its local day in the heatmap', () => {
    const days = activityDays([], [{ data_recaida: '2026-03-11T01:00:00.000Z' }], EVENING_IN_BRAZIL);
    expect(days).toHaveLength(28);
    expect(days.at(-1)).toMatchObject({ date: '2026-03-10', hasRelapse: true });
    expect(days[0].date).toBe('2026-02-11');
  });
});
