import { expect, it, vi } from 'vitest';
import weekly from '../../../weekly-summary.js';
import corpus from '../../../tests/fixtures/weekly-summary.json';
import { readWeeklySummary } from '../offline/weekly-summary';
import { weekStart } from '../utils/weeklySummary';
import { deferred } from '../test/diaryFixture';
function fixture() {
    const scope = rows => rows.map(row => ({ ...row, usuario_id: corpus.ownerId, vicio_id: corpus.habitId }));
    const summary = weekly.buildWeeklySummary({ ...corpus, now: new Date(corpus.now), records: scope(corpus.records), urges: scope(corpus.urges), relapses: scope(corpus.relapses) });
    const filters = { vicio_id: corpus.habitId, semana: corpus.week, timezone: corpus.timezone };
    return { summary, filters, store: { getPage: vi.fn(async () => null), savePage: vi.fn() }, check: vi.fn(), isOnline: () => true, request: vi.fn(async () => summary) };
}
it('requests the canonical DTO with all scope parameters and persists only a confirmed response', async () => {
    const f = fixture(), result = await readWeeklySummary(f);
    expect(result.summary.intensidade.media).toBe(corpus.expected.mean);
    expect(result.summary.frases.some(row => row.texto === corpus.expected.phrase)).toBe(true);
    const [url, options] = f.request.mock.calls[0];
    expect(Object.fromEntries(new URLSearchParams(url.split('?')[1]))).toEqual(f.filters);
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(f.store.savePage).toHaveBeenCalledWith('weekly-summary', f.filters, f.summary);
});
it('offline uses only the matching server summary and exposes invalidation without merging the outbox', async () => {
    const f = fixture();
    f.isOnline = () => false;
    f.store.getPage.mockResolvedValue({ data: f.summary, staleAfterMutation: true });
    expect(await readWeeklySummary(f)).toMatchObject({ summary: f.summary, offline: true, stale: true });
    expect(f.request).not.toHaveBeenCalled(); expect(f.store.savePage).not.toHaveBeenCalled();
    for (const filters of [{ ...f.filters, vicio_id: 'another' }, { ...f.filters, timezone: 'UTC' }, { ...f.filters, semana: '2026-10-12' }]) {
        expect((await readWeeklySummary({ ...f, filters })).summary).toBeNull();
    }
});
it('retains a dated copy on server failure, refuses unauthorized/deleted sources, and reports no cached copy', async () => {
    const f = fixture(); f.store.getPage.mockResolvedValue({ data: f.summary });
    f.request.mockRejectedValue(Object.assign(new Error('unavailable'), { status: 503 }));
    expect(await readWeeklySummary(f)).toMatchObject({ summary: f.summary, offline: false, error: expect.stringContaining('última consulta') });
    for (const status of [401, 403, 404]) {
        f.request.mockRejectedValue(Object.assign(new Error('denied'), { status }));
        await expect(readWeeklySummary(f)).rejects.toMatchObject({ status });
    }
    f.store.getPage.mockResolvedValue(null); f.isOnline = () => false;
    expect(await readWeeklySummary(f)).toMatchObject({ summary: null, offline: true });
});
it('discards late account/habit/timezone responses before cache writes', async () => {
    const f = fixture(), wait = deferred(), controller = new AbortController();
    f.request = () => wait.promise;
    f.check = () => { if (controller.signal.aborted) throw new Error('contexto mudou'); };
    const task = readWeeklySummary({ ...f, signal: controller.signal });
    await vi.waitFor(() => expect(f.store.getPage).toHaveBeenCalled());
    controller.abort(); wait.resolve(f.summary);
    await expect(task).rejects.toThrow('contexto mudou'); expect(f.store.savePage).not.toHaveBeenCalled();
});
it('rejects mismatched DTOs, while a cache failure keeps confirmed numbers visible with an honest warning', async () => {
    const f = fixture(); f.request.mockResolvedValueOnce({ ...f.summary, timezone: 'UTC' });
    expect((await readWeeklySummary(f)).summary).toBeNull(); expect(f.store.savePage).not.toHaveBeenCalled();
    f.store.savePage.mockRejectedValueOnce(new Error('quota'));
    expect(await readWeeklySummary(f)).toMatchObject({ summary: f.summary, error: expect.stringContaining('cópia offline') });
});
it('week selectors use local Mondays across year and UTC/São Paulo boundaries', () => {
    const now = new Date('2026-01-05T01:00:00Z');
    expect(weekStart('UTC', 0, now)).toBe('2026-01-05'); expect(weekStart('America/Sao_Paulo', 0, now)).toBe('2025-12-29');
    expect(weekStart('UTC', -1, now)).toBe('2025-12-29'); expect(weekStart('invalid', 0, now)).toBeNull(); expect(weekStart('+03:00', 0, now)).toBeNull();
});
