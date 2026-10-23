export const INTRO_VERSION = 1;

export function hasJourneyHistory(data) {
    return ['vicios', 'registros', 'metas', 'recaidas', 'conquistas'].some(key => data?.[key]?.length > 0);
}

export function shouldIntroduce(preferences, data) {
    if (!preferences || !data || preferences.intro.version > INTRO_VERSION || preferences.intro.state !== 'pending') return false;
    return preferences.intro.version === INTRO_VERSION || !hasJourneyHistory(data);
}
