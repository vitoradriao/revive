import { afterEach, describe, expect, it, vi } from 'vitest';
import { criarVicio } from './vicios.service';
import { apiCall } from './api';

const payload = { nome_vicio: 'Café', data_inicio: '2026-10-16', valor_economizado_por_dia: 12.5 };
const response = (status, body) => ({ ok: status >= 200 && status < 300, status, text: async () => body });
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
describe('habit creation HTTP confirmation', () => {
  it('sends only the accepted payload and requires a canonical habit ID', async () => {
    const fetch = vi.fn().mockResolvedValue(response(201, JSON.stringify({ vicio: { ...payload, id: 'habit-1' } })));
    vi.stubGlobal('fetch', fetch);
    expect(await criarVicio(payload, 'synthetic-token')).toMatchObject({ vicio: { id: 'habit-1' } });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual(payload);
  });
  it('never retries a transport failure automatically', async () => {
    const fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    vi.stubGlobal('fetch', fetch);
    await expect(criarVicio(payload, 'synthetic-token')).rejects.toMatchObject({ outcomeUnknown: true });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it.each([200, 201, 204])('treats a %s response without a habit as unconfirmed', async status => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(status, '')));
    await expect(criarVicio(payload, 'synthetic-token')).rejects.toMatchObject({ outcomeUnknown: true });
  });
  it('aborts after 20 seconds without replaying a non-idempotent POST', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn((_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(new DOMException('Timeout', 'AbortError')));
    }));
    vi.stubGlobal('fetch', fetch);
    const outcome = criarVicio(payload, 'synthetic-token').catch(error => error);
    await vi.advanceTimersByTimeAsync(20000);
    expect(await outcome).toMatchObject({ outcomeUnknown: true });
    expect(fetch).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('keeps HTTP rejection semantics', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(422, JSON.stringify({ mensagem: 'Data inválida', codigo: 'VALIDACAO' }))));
    await expect(criarVicio(payload, 'synthetic-token')).rejects.toMatchObject({ message: 'Data inválida', status: 422, code: 'VALIDACAO', outcomeUnknown: false });
  });
  it('marks server and interrupted-body failures as uncertain', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(response(503, '{}')).mockResolvedValueOnce({ ok: true, status: 201, text: async () => { throw new Error('interrupted'); } }));
    await expect(criarVicio(payload, 'synthetic-token')).rejects.toMatchObject({ status: 503, outcomeUnknown: true });
    await expect(criarVicio(payload, 'synthetic-token')).rejects.toMatchObject({ outcomeUnknown: true });
  });
  it('preserves bodyless successful responses for other endpoints', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(204, '')));
    await expect(apiCall('/vicios/habit-1', { method: 'DELETE' }, 'synthetic-token')).resolves.toEqual({});
  });
});
