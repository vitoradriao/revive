const { validateRecordFields, parseRecordCursor } = require('../../diary-records');
it('enforces the same limits in creation and correction without truncating data', () => {
  expect(validateRecordFields({ humor: 'h'.repeat(100), observacoes: 'o'.repeat(1000) })).toBe(true);
  expect(validateRecordFields({ humor: 'h'.repeat(101) })).toBe(false);
  expect(validateRecordFields({ expected_version: 1, gatilhos: null }, true)).toBe(true);
  expect(validateRecordFields({ expected_version: 1, data_registro: '2026-01-01' }, true)).toBe(false);
  expect(validateRecordFields({ expected_version: 0, humor: 'Bem' }, true)).toBe(false);
  expect(validateRecordFields({ expected_version: 1, observacoes: 42 }, true)).toBe(false);
});
it('rejects malformed cursors before using them in SQL', () => {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  expect(parseRecordCursor(encode({ date: '2026-10-04', id: '10000000-0000-4000-8000-000000000001' }))).toMatchObject({ date: '2026-10-04' });
  expect(parseRecordCursor(encode({ date: '2026-02-30', id: '10000000-0000-4000-8000-000000000001' }))).toBeNull();
  expect(parseRecordCursor('bad')).toBeNull();
});
