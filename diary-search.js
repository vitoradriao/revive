const { createHmac, timingSafeEqual } = require('node:crypto');
const { parseRecordCursor } = require('./diary-records');

function normalizeDiaryText(value) {
    return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/ς/g, 'σ');
}
function validSearchTerm(value) {
    return typeof value === 'string' && Array.from(value).length <= 100 && !value.includes('\0')
        && !Array.from(value).some(char => char.length === 1 && /[\uD800-\uDFFF]/.test(char));
}
function searchScope(owner, input, secret) {
    return createHmac('sha256', secret).update(JSON.stringify([owner, normalizeDiaryText(input.termo || ''),
        input.inicio || null, input.fim || null, input.vicio_id || null, input.limit ?? 50])).digest('base64url');
}
function encodeSearchCursor(last, scope, secret) {
    const payload = Buffer.from(JSON.stringify({ date: last.data_registro, id: last.id, scope })).toString('base64url');
    return payload + '.' + createHmac('sha256', secret).update(payload).digest('base64url');
}
function decodeSearchCursor(value, scope, secret) {
    if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,512}\.[A-Za-z0-9_-]{43}$/.test(value)) return null;
    const [payload, signature, extra] = value.split('.');
    const expected = createHmac('sha256', secret).update(payload || '').digest('base64url');
    if (extra !== undefined || !signature || signature.length !== expected.length
        || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
    const cursor = parseRecordCursor(payload);
    return cursor?.scope === scope ? cursor : null;
}
module.exports = { normalizeDiaryText, validSearchTerm, searchScope, encodeSearchCursor, decodeSearchCursor };
