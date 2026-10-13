import { expect, it } from '@jest/globals';
import { civilTimeToInstant, dateInZone, dateTimeInZone, validTimezone } from './urge-time';
it('preserves a Brazilian past civil minute as an instant independent of the device zone', () => {
  expect(civilTimeToInstant('2026-10-12','22:45','America/Sao_Paulo')).toBe('2026-10-13T01:45:00.000Z');
  expect(dateTimeInZone('2026-10-13T01:45:00.000Z','America/Sao_Paulo')).toEqual({date:'2026-10-12',time:'22:45'});
  expect(dateInZone('2026-10-13T01:45:00.000Z','UTC')).toBe('2026-10-13');
  expect(dateInZone('2026-01-01T10:30:00.000Z','Pacific/Kiritimati')).toBe('2026-01-02');
});
it('rejects invalid civil dates, times, zones and daylight saving gaps/ambiguity', () => {
  expect(civilTimeToInstant('2026-02-30','12:00','UTC')).toBeNull();
  expect(civilTimeToInstant('2026-10-13','25:00','UTC')).toBeNull();
  expect(civilTimeToInstant('2026-03-08','02:30','America/New_York')).toBeNull();
  expect(civilTimeToInstant('2026-11-01','01:30','America/New_York')).toBeNull();
  expect(civilTimeToInstant('2026-10-13','12:00','invalid/zone')).toBeNull();
  expect(validTimezone('UTC')).toBe(true); expect(validTimezone('invalid/zone')).toBe(false);
});
