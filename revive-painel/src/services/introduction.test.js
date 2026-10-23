import { expect, it, vi } from 'vitest';
import { manageIntroduction } from '../offline/introduction';
import { hasJourneyHistory, shouldIntroduce } from '../utils/introduction';
import { defaultPreferences } from '../utils/journeyPreferences';

const habitId = '10000000-0000-4000-8000-000000000001';
function fixture() {
    const data = { usuario: { id: 'account-a' }, vicios: [], registros: [], metas: [], recaidas: [], conquistas: [] };
    let marker = null;
    const store = { userId: 'account-a', getIntroduction: vi.fn(async () => structuredClone(marker)),
        saveIntroduction: vi.fn(async value => { marker = structuredClone(value); }),
        savePreferences: vi.fn(), saveSnapshot: vi.fn() };
    const preferences = { ...defaultPreferences(), intro: { version: 1, state: 'pending', step: 'habit' } };
    const request = vi.fn(async path => {
        if (path === '/v2/preferences') return { preferences };
        if (path === '/v2/bootstrap') return structuredClone(data);
        if (path === '/vicios') {
            const habit = { id: habitId, nome_vicio: 'Sintético', usuario_id: data.usuario.id };
            data.vicios.push(habit); return { vicio: habit };
        }
        throw new Error('Unexpected path');
    });
    const check = vi.fn(), isOnline = vi.fn(() => true);
    const run = (action = 'createHabit') => manageIntroduction({ store, request, check, isOnline, action, input: { nome_vicio: 'Sintético' } });
    return { data, store, request, preferences, check, isOnline, run };
}
it('keeps the confirmed ID across reopening and prevents a second creation', async () => {
    const f = fixture();
    expect((await f.run()).vicio.id).toBe(habitId);
    expect(await f.run('read')).toEqual({ status: 'confirmed', habitId });
    await expect(f.run()).rejects.toMatchObject({ code: 'INTRO_RECOVERY' });
    expect(f.request.mock.calls.filter(([path]) => path === '/vicios')).toHaveLength(1);
});
it('persists uncertainty before POST and never replays after a lost response/reload', async () => {
    const f = fixture(), original = f.request.getMockImplementation();
    f.request.mockImplementation(async (...args) => {
        const response = await original(...args);
        if (args[0] === '/vicios') throw new TypeError('Resposta perdida');
        return response;
    });
    await expect(f.run()).rejects.toThrow('Resposta perdida');
    expect(await f.run('read')).toEqual({ status: 'creating' });
    expect(f.data.vicios).toHaveLength(1);
    await expect(f.run()).rejects.toMatchObject({ code: 'INTRO_RECOVERY' });
    expect(f.request.mock.calls.filter(([path]) => path === '/vicios')).toHaveLength(1);
});
it('never sends when storage, connection, history or the remote stage prevents creation', async () => {
    const storage = fixture(); storage.store.saveIntroduction.mockRejectedValue(new Error('Quota'));
    await expect(storage.run()).rejects.toThrow('Quota');
    expect(storage.request.mock.calls.some(([path]) => path === '/vicios')).toBe(false);
    const offline = fixture(); offline.isOnline.mockReturnValue(false);
    await expect(offline.run()).rejects.toMatchObject({ code: 'OFFLINE' }); expect(offline.request).not.toHaveBeenCalled();
    const history = fixture(); history.data.vicios.push({ id: habitId, ativo: false });
    await expect(history.run()).rejects.toMatchObject({ code: 'INTRO_HISTORY' });
    const remote = fixture(); remote.preferences.intro.state = 'dismissed';
    await expect(remote.run()).rejects.toMatchObject({ code: 'INTRO_CHANGED' });
});
it('rejects a late account A response before storing its confirmed ID', async () => {
    const f = fixture(), original = f.request.getMockImplementation();
    f.request.mockImplementation(async (...args) => {
        const result = await original(...args);
        if (args[0] === '/vicios') f.check.mockImplementation(() => { throw Object.assign(new Error('Conta mudou'), { code: 'SESSAO_ALTERADA' }); });
        return result;
    });
    await expect(f.run()).rejects.toMatchObject({ code: 'SESSAO_ALTERADA' });
    expect(f.store.saveIntroduction).toHaveBeenCalledTimes(1);
    expect(f.store.saveIntroduction).toHaveBeenCalledWith({ status: 'creating' });
});
it('retains confirmed ID even if the snapshot write fails after the POST', async () => {
    const f = fixture(); f.store.saveSnapshot.mockResolvedValueOnce().mockRejectedValueOnce(new Error('Storage'));
    await expect(f.run()).rejects.toThrow('Storage');
    expect(await f.run('read')).toEqual({ status: 'confirmed', habitId });
    await expect(f.run()).rejects.toMatchObject({ code: 'INTRO_RECOVERY' });
});
it('keeps an uncertain marker after the creation deadline and blocks the next POST', async () => {
    vi.useFakeTimers();
    try {
        const f = fixture(), original = f.request.getMockImplementation();
        f.request.mockImplementation((path, options) => path !== '/vicios' ? original(path, options)
            : new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('Tempo esgotado')), { once: true })));
        const result = expect(f.run()).rejects.toThrow('Tempo esgotado');
        await vi.advanceTimersByTimeAsync(20001); await result;
        expect(await f.run('read')).toEqual({ status: 'creating' });
        await expect(f.run()).rejects.toMatchObject({ code: 'INTRO_RECOVERY' });
        expect(f.request.mock.calls.filter(([path]) => path === '/vicios')).toHaveLength(1);
    } finally { vi.useRealTimers(); }
});
it('only permits another POST after an explicit known rejection', async () => {
    const f = fixture(), original = f.request.getMockImplementation();
    f.request.mockImplementation(async (...args) => {
        if (args[0] === '/vicios') throw Object.assign(new Error('Invalid'), { status: 422 });
        return original(...args);
    });
    await expect(f.run()).rejects.toMatchObject({ status: 422 });
    expect(await f.run('read')).toEqual({ status: 'rejected' });
    f.request.mockImplementation(original); await expect(f.run()).resolves.toHaveProperty('vicio.id', habitId);
});
it('does not force accounts with history, archived habits, saved dismissal/completion or future versions', () => {
    const empty = { vicios: [] }, preferences = defaultPreferences();
    expect(shouldIntroduce(preferences, empty)).toBe(true);
    for (const key of ['vicios', 'registros', 'metas', 'recaidas', 'conquistas']) {
        const data = { [key]: [{ ativo: false }] };
        expect(hasJourneyHistory(data)).toBe(true); expect(shouldIntroduce(preferences, data)).toBe(false);
    }
    expect(shouldIntroduce(null, empty)).toBe(false);
    for (const state of ['completed', 'dismissed']) expect(shouldIntroduce({ intro: { version: 1, state } }, empty)).toBe(false);
    expect(shouldIntroduce({ intro: { version: 2, state: 'pending' } }, empty)).toBe(false);
    expect(shouldIntroduce({ intro: { version: 1, state: 'pending' } }, { vicios: [{}] })).toBe(true);
});
