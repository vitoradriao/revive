const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;

export const deviceTimezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
export function validTimezone(timezone) {
  if (!timezone || timezone.length > 100) return false;
  try { new Intl.DateTimeFormat('en', { timeZone: timezone }).format(0); return true; }
  catch { return false; }
}
export function dateTimeInZone(instant, timezone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(instant));
  const get = (type) => parts.find(part => part.type === type)?.value || '';
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}` };
}
export const dateInZone = (instant, timezone) => dateTimeInZone(instant, timezone).date;

/** Resolve civil time by verifying IANA offsets. Reject gaps and ambiguous DST hours. */
export function civilTimeToInstant(date, time, timezone) {
  if (!validTimezone(timezone) || !/^\d{4}-\d{2}-\d{2}$/.test(date)
    || !validDate(date)
    || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return null;
  const nominal = Date.parse(`${date}T${time}:00.000Z`);
  const offsets = new Set();
  for (let hours = -36; hours <= 36; hours += 6) {
    const sample = nominal + hours * 3600000;
    const local = dateTimeInZone(new Date(sample), timezone);
    offsets.add(Date.parse(`${local.date}T${local.time}:00.000Z`) - sample);
  }
  const matches = [...offsets].map(offset => new Date(nominal - offset).toISOString())
    .filter(instant => { const local = dateTimeInZone(instant, timezone); return local.date === date && local.time === time; });
  return matches.length === 1 ? matches[0] ?? null : null;
}
export function displayZonedMoment(instant, timezone) {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: timezone, dateStyle: 'short', timeStyle: 'short' }).format(new Date(instant));
}

export { validDate };
