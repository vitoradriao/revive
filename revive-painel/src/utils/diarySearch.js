// Keep this normalization aligned with diary-search.js and normalize_diary_search in SQL.
export function normalizeDiaryText(value) {
    return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/ς/g, 'σ');
}
export function validateSearchTerm(value) {
    if (typeof value !== 'string' || Array.from(value).length > 100 || value.includes('\0')
        || Array.from(value).some(char => char.length === 1 && /[\uD800-\uDFFF]/.test(char))) {
        throw new Error('Use até 100 caracteres válidos na busca.');
    }
}
export function matchesDiarySearch(record, term) {
    const needle = normalizeDiaryText(term);
    return !needle || ['humor', 'gatilhos', 'conquistas', 'observacoes'].some(key => normalizeDiaryText(record[key] || '').includes(needle));
}
