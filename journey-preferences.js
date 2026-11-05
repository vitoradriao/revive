const DEFAULT_INDICATOR_ORDER = ['current_streak', 'historical_record', 'sequence_savings', 'accumulated_savings'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const defaults = () => ({ primary_habit_id: null, indicator_order: [...DEFAULT_INDICATOR_ORDER], intro: { version: 0, state: 'pending' }, revision: 0 });
function validateIntroduction(intro) {
    if (!intro || typeof intro !== 'object' || Array.isArray(intro)
        || Object.keys(intro).some(key => !['version', 'state', 'step', 'habit_id'].includes(key))
        || !Number.isInteger(intro.version) || intro.version < 0 || intro.version > 1000000
        || !['pending', 'completed', 'dismissed'].includes(intro.state)
        || (intro.version === 0 && intro.state !== 'pending')) return false;
    if (!('step' in intro) && !('habit_id' in intro)) return true;
    if (intro.version === 0 || !['habit', 'reason', 'checkin'].includes(intro.step)) return false;
    return intro.step === 'habit' ? intro.habit_id == null
        : typeof intro.habit_id === 'string' && UUID.test(intro.habit_id);
}
function validatePreferences(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) return false;
    const keys = Object.keys(body);
    if (keys.length < 2 || keys.some(key => !['revision', 'primary_habit_id', 'indicator_order', 'intro'].includes(key))
        || !Number.isSafeInteger(body.revision) || body.revision < 0 || body.revision > 2147483646) return false;
    if ('primary_habit_id' in body && body.primary_habit_id !== null && (typeof body.primary_habit_id !== 'string' || !UUID.test(body.primary_habit_id))) return false;
    if ('indicator_order' in body && (!Array.isArray(body.indicator_order) || body.indicator_order.length < 1 || body.indicator_order.length > 32
        || new Set(body.indicator_order).size !== body.indicator_order.length
        || body.indicator_order.some(id => typeof id !== 'string' || !/^[a-z][a-z0-9_]{0,63}$/.test(id)))) return false;
    if ('intro' in body) {
        const intro = body.intro;
        if (!validateIntroduction(intro)) return false;
    }
    return true;
}
module.exports = { DEFAULT_INDICATOR_ORDER, defaultPreferences: defaults, validatePreferences, validateIntroduction };
