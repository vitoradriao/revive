import { validTimezone, validDate, dateInZone, dateTimeInZone } from './urge-time';
const invalid = message => { throw Object.assign(new Error(message), { code: 'DADOS_INVALIDOS' }); };
export function urgePayload(input, now = Date.now()) {
    const { vicio_id, occurred_at, timezone, intensidade, gatilhos = [] } = input;
    if (!vicio_id) invalid('Selecione um hábito.');
    if (!Number.isInteger(intensidade) || intensidade < 0 || intensidade > 10) invalid('Use uma intensidade inteira de 0 a 10.');
    if (!validTimezone(timezone)) invalid('Informe um fuso IANA válido.');
    if (!/(Z|[+-]\d{2}:\d{2})$/i.test(occurred_at || '') || !Number.isFinite(Date.parse(occurred_at))) invalid('Informe um momento válido com fuso.');
    if (Date.parse(occurred_at) > now + 300000) invalid('O momento não pode estar mais de cinco minutos no futuro.');
    if (!Array.isArray(gatilhos) || gatilhos.length > 10 || new Set(gatilhos).size !== gatilhos.length || gatilhos.some(code => typeof code !== 'string' || !/^[a-z][a-z0-9_]{0,39}$/.test(code))) invalid('Informe até dez gatilhos sem repetições.');
    const payload = { vicio_id, occurred_at: new Date(occurred_at).toISOString(), timezone, intensidade, gatilhos: [...gatilhos] };
    for (const key of ['nota', 'acao_realizada', 'resultado']) {
        if (input[key] != null && (typeof input[key] !== 'string' || input[key].trim().length > 1000)) invalid('Use até 1000 caracteres por campo.');
        payload[key] = input[key]?.trim() || null;
    }
    return payload;
}
export function validateUrgeFilters(filters) {
    const { inicio, fim, timezone, vicio_id, limit = 50 } = filters;
    if (!vicio_id || !validDate(inicio) || !validDate(fim) || fim < inicio || Date.parse(fim) - Date.parse(inicio) > 3660 * 86400000 || !validTimezone(timezone) || !Number.isInteger(limit) || limit < 1 || limit > 100) invalid('Revise o hábito, período, fuso e limite da consulta.');
}
export const mergeUrges = (...groups) => [...new Map(groups.flat().map(event => [event.id, event])).values()]
    .sort((a, b) => Date.parse(b.occurred_at) - Date.parse(a.occurred_at) || b.id.localeCompare(a.id));
export const inUrgePeriod = (event, filters) => event.vicio_id === filters.vicio_id && dateInZone(event.occurred_at, filters.timezone) >= filters.inicio && dateInZone(event.occurred_at, filters.timezone) <= filters.fim;

export const canRecoverUrge = item => item?.type === 'urge.create' && item.status === 'recovery' && !item.lastError?.outcomeUnknown &&
    (item.lastError?.status === 404 && item.lastError.code === 'VICIO_NAO_ENCONTRADO' || item.lastError?.status === 422 && item.lastError.code === 'DADOS_INVALIDOS');
export function rejectedUrgeDraft(item) {
    const payload = item.payload, initial = { instant: payload.occurred_at, timezone: payload.timezone, ...dateTimeInZone(payload.occurred_at, payload.timezone) };
    return { eventId: crypto.randomUUID(), initial, date: initial.date, time: initial.time, intensity: String(payload.intensidade),
        triggers: [...payload.gatilhos], note: payload.nota || '', action: payload.acao_realizada || '', result: payload.resultado || '' };
}
