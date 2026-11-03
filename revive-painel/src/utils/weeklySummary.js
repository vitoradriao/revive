import { dateInZone, validTimezone } from './urge-time';
export function weekStart(timezone, offset = 0, now = new Date()) {
    if (/^[+-]/.test(timezone) || !validTimezone(timezone)) return null;
    const date = dateInZone(now, timezone), civil = new Date(date + 'T00:00:00Z');
    civil.setUTCDate(civil.getUTCDate() - (civil.getUTCDay() + 6) % 7 + offset * 7);
    return civil.toISOString().slice(0, 10);
}
export const weekEnd = start => new Date(Date.parse(start + 'T00:00:00Z') + 6 * 86400000).toISOString().slice(0, 10);
export const displayCivil = date => date.split('-').reverse().join('/');
