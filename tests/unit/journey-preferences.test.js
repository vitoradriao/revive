const { validatePreferences, defaultPreferences } = require('../../journey-preferences');
it('accepts future indicator IDs, partial patches and versioned introduction independently of revision', () => {
    expect(defaultPreferences()).toEqual({ primary_habit_id: null, indicator_order: ['current_streak', 'historical_record', 'sequence_savings', 'accumulated_savings'], intro: { version: 0, state: 'pending' }, revision: 0 });
    expect(validatePreferences({ revision: 0, indicator_order: ['future_metric'] })).toBe(true);
    expect(validatePreferences({ revision: 15, intro: { version: 2, state: 'dismissed' } })).toBe(true);
    expect(validatePreferences({ revision: 1, primary_habit_id: null })).toBe(true);
});
it.each([
    null, [], {}, { revision: 0 }, { revision: -1, primary_habit_id: null },
    { revision: 0, usuario_id: 'another' }, { revision: 0, primary_habit_id: 'foreign' },
    { revision: 0, indicator_order: [] }, { revision: 0, indicator_order: ['current_streak', 'current_streak'] },
    { revision: 0, indicator_order: ['Nome traduzido'] }, { revision: 0, indicator_order: Array(33).fill('a') },
    { revision: 0, intro: { version: 0, state: 'completed' } }, { revision: 0, intro: { version: 1, state: 'other' } },
    { revision: 0, intro: { version: 1, state: 'completed', revision: 1 } },
])('rejects invalid document %j', body => expect(validatePreferences(body)).toBe(false));

it.each(['pending', 'completed', 'dismissed'])('preserves introduction progress with state %s', state => {
    expect(validatePreferences({ revision: 2, intro: { version: 1, state, step: 'habit' } })).toBe(true);
    for (const step of ['reason', 'checkin']) {
        expect(validatePreferences({ revision: 2, intro: { version: 1, state, step,
            habit_id: '10000000-0000-4000-8000-000000000001' } })).toBe(true);
    }
});
it.each([
    { version: 0, state: 'pending', step: 'habit' },
    { version: 1, state: 'pending', step: 'reason' },
    { version: 1, state: 'pending', step: 'checkin', habit_id: 'foreign' },
    { version: 1, state: 'pending', step: 'habit', habit_id: '10000000-0000-4000-8000-000000000001' },
    { version: 1, state: 'pending', step: 'other' },
    { version: 1, state: 'pending', habit_id: null },
    { version: 1, state: 'pending', step: 'habit', motivo_pessoal: 'private' },
])('rejects inconsistent or private introduction fields', intro => expect(validatePreferences({ revision: 0, intro })).toBe(false));
