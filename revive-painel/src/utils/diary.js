import { getLocalDateString } from './goalProgress.js';

export const recordFields = { humor: 'Humor', gatilhos: 'Gatilhos', conquistas: 'Conquistas', observacoes: 'Observações' };
export const recordLimits = { humor: 100, gatilhos: 500, conquistas: 500, observacoes: 1000 };
export const recordValues = record => Object.fromEntries(Object.keys(recordFields).map(key => [key, record?.[key] ?? '']));
export function recordPatch(base, values) {
    const patch = {};
    for (const [key, limit] of Object.entries(recordLimits)) {
        if (!(key in values) || (base?.[key] ?? '') === values[key]) continue;
        if (typeof values[key] !== 'string' || values[key].length > limit) throw new Error(`${recordFields[key]}: use até ${limit} caracteres ao alterar este campo.`);
        patch[key] = values[key] === '' ? null : values[key];
    }
    return patch;
}
export function recordCreation(values, habitId, date = new Date()) {
    if (!habitId || !values.humor?.trim()) throw new Error('Selecione um hábito e informe seu humor.');
    return { ...recordPatch({}, values), vicio_id: habitId, data_registro: getLocalDateString(date), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' };
}
export function validateRecordFilters(filters, { optionalPeriod = false } = {}) {
    if (filters.limit !== undefined && (!Number.isInteger(filters.limit) || filters.limit < 1 || filters.limit > 100)) throw new Error('Use entre 1 e 100 registros por página.');
    if (optionalPeriod && filters.inicio === undefined && filters.fim === undefined) return;
    const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
    if (!validDate(filters.inicio) || !validDate(filters.fim) || filters.fim < filters.inicio || (Date.parse(filters.fim) - Date.parse(filters.inicio)) / 86400000 > 3660) {
        throw new Error('Informe um período válido de até 3.660 dias entre início e fim.');
    }
}
export function mergeRecords(...groups) {
    const rows = new Map();
    for (const record of groups.flat()) {
        const previous = rows.get(record.id);
        if (!previous || (record.revision || 0) >= (previous.revision || 0)) rows.set(record.id, record);
    }
    return [...rows.values()].sort((a, b) => String(b.data_registro).localeCompare(String(a.data_registro)) || b.id.localeCompare(a.id));
}
export function projectRecords(records, queue) {
    const rows = new Map(records.map(record => [record.id, record]));
    for (const intent of queue) {
        if (intent.type === 'record.create') rows.set(intent.localId, { ...intent.payload, id: intent.localId, revision: null, pending: intent });
        if (intent.type === 'record.update' && rows.has(intent.payload.recordId)) {
            rows.set(intent.payload.recordId, { ...rows.get(intent.payload.recordId), ...intent.payload, pending: intent });
        }
    }
    return mergeRecords([...rows.values()]);
}
export const inRecordPeriod = (record, filters) => (!filters.vicio_id || record.vicio_id === filters.vicio_id) && (!filters.inicio || record.data_registro.slice(0, 10) >= filters.inicio) && (!filters.fim || record.data_registro.slice(0, 10) <= filters.fim);
