import { parseDate } from './formats';

export const deviceTimezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
export function validTimezone(timezone: string) {
  if (!timezone || timezone.length > 100) return false;
  try { new Intl.DateTimeFormat('en', { timeZone: timezone }).format(0); return true; }
  catch { return false; }
}
export function dateTimeInZone(instant: string | Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(instant));
  const get = (type: string) => parts.find(part => part.type === type)?.value || '';
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}` };
}
export const dateInZone = (instant: string | Date, timezone: string) => dateTimeInZone(instant, timezone).date;

/** Resolve civil time by verifying IANA offsets. Reject gaps and ambiguous DST hours. */
export function civilTimeToInstant(date: string, time: string, timezone: string): string | null {
  if (!validTimezone(timezone) || !/^\d{4}-\d{2}-\d{2}$/.test(date)
    || !parseDate(`${date.slice(8)}/${date.slice(5,7)}/${date.slice(0,4)}`)
    || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return null;
  const nominal = Date.parse(`${date}T${time}:00.000Z`);
  const offsets = new Set<number>();
  for (let hours = -36; hours <= 36; hours += 6) {
    const sample = nominal + hours * 3600000;
    const local = dateTimeInZone(new Date(sample), timezone);
    offsets.add(Date.parse(`${local.date}T${local.time}:00.000Z`) - sample);
  }
  const matches = [...offsets].map(offset => new Date(nominal - offset).toISOString())
    .filter(instant => { const local = dateTimeInZone(instant, timezone); return local.date === date && local.time === time; });
  return matches.length === 1 ? matches[0] ?? null : null;
}
export function displayZonedMoment(instant: string, timezone: string) {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: timezone, dateStyle: 'short', timeStyle: 'short' }).format(new Date(instant));
}
