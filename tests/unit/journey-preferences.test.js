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
