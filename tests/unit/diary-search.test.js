const { normalizeDiaryText, validSearchTerm, searchScope, encodeSearchCursor, decodeSearchCursor } = require('../../diary-search');
const corpus = require('../fixtures/diary-search.json');
const input = { termo: 'AÇÃO', inicio: '2026-01-01', fim: '2026-12-31', limit: 20 };
const secret = 'synthetic-search-cursor-secret';
it.each(corpus.cases)('uses literal Unicode normalization in the common corpus ($term)', ({ term, matches }) => {
    const found = corpus.rows.flatMap((row, index) => Object.values(row).some(value => normalizeDiaryText(value || '').includes(normalizeDiaryText(term))) ? [index] : []);
    expect(found).toEqual(matches);
});
it('counts Unicode code points and refuses invalid strings without truncation', () => {
    for (const value of ['', 'a'.repeat(100), '😀'.repeat(100)]) expect(validSearchTerm(value)).toBe(true);
    for (const value of ['a'.repeat(101), '😀'.repeat(101), null, [], 4, '\0', '\ud800']) expect(validSearchTerm(value)).toBe(false);
});
it('authenticates cursors and binds owner, normalized term, period, habit and page size', () => {
    const scope = searchScope('a', input, secret);
    const cursor = encodeSearchCursor({ data_registro: '2026-10-23', id: '10000000-0000-4000-8000-000000000001' }, scope, secret);
    expect(decodeSearchCursor(cursor, scope, secret)).toMatchObject({ date: '2026-10-23' });
    expect(searchScope('a', { ...input, termo: 'ação' }, secret)).toBe(scope);
    for (const changed of [{ termo: 'b' }, { inicio: '2026-02-01' }, { fim: '2026-10-23' }, { vicio_id: 'habit' }, { limit: 10 }]) {
        expect(decodeSearchCursor(cursor, searchScope('a', { ...input, ...changed }, secret), secret)).toBeNull();
    }
    expect(decodeSearchCursor(cursor, searchScope('b', input, secret), secret)).toBeNull();
    expect(decodeSearchCursor(cursor + 'x', scope, secret)).toBeNull();
    expect(decodeSearchCursor(cursor.split('.')[0] + '.' + 'á'.repeat(43), scope, secret)).toBeNull();
    expect(Buffer.from(cursor.split('.')[0], 'base64url').toString()).not.toContain(input.termo);
});
