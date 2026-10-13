const limits = { humor: 100, gatilhos: 500, conquistas: 500, observacoes: 1000 };
function validateRecordFields(input, editing = false) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return false;
    const allowed = [...Object.keys(limits), ...(editing ? ['expected_version'] : ['vicio_id', 'data_registro', 'timezone'])];
    if (Object.keys(input).some(key => !allowed.includes(key))) return false;
    if (editing && (!Number.isSafeInteger(input.expected_version) || input.expected_version < 1)) return false;
    if (editing && !Object.keys(limits).some(key => key in input)) return false;
    return Object.entries(limits).every(([key, max]) => !(key in input)
        || input[key] === null
        || (typeof input[key] === 'string' && input[key].length <= max));
}
function parseRecordCursor(value) {
    try {
        if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,512}$/.test(value)) return null;
        const decoded = Buffer.from(value, 'base64url').toString();
        const cursor = JSON.parse(decoded);
        if (Buffer.from(decoded).toString('base64url') !== value
            || !/^\d{4}-\d{2}-\d{2}$/.test(cursor.date)
            || new Date(`${cursor.date}T00:00:00Z`).toISOString().slice(0, 10) !== cursor.date
            || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cursor.id)) return null;
        return cursor;
    } catch { return null; }
}
module.exports = { validateRecordFields, parseRecordCursor };
