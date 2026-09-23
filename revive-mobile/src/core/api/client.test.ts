import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { tokenStore } from '@/core/auth/token-store';
import { apiFetch, refreshAccessToken } from './client';

jest.mock('@/core/auth/token-store', () => ({ tokenStore: {
  getRefreshToken: jest.fn(), clear: jest.fn(), saveSession: jest.fn(),
  getAccessToken: jest.fn(), getGeneration: jest.fn(), isCurrent: jest.fn(),
} }));


const fetchMock = jest.fn<typeof fetch>();
let generation = 1;
beforeEach(() => {
  jest.clearAllMocks();
  generation = 1;
  global.fetch = fetchMock;
  jest.mocked(tokenStore.getRefreshToken).mockResolvedValue('test-refresh');
  jest.mocked(tokenStore.getGeneration).mockImplementation(() => generation);
  jest.mocked(tokenStore.isCurrent).mockImplementation(expected => generation === expected);
  jest.mocked(tokenStore.saveSession).mockResolvedValue(true);
  jest.mocked(tokenStore.getAccessToken).mockReturnValue('access-a');
});

describe('session recovery', () => {
  it('preserves credentials during a network outage', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('offline'));
    await expect(refreshAccessToken()).rejects.toMatchObject({ status: 0 });
    expect(tokenStore.clear).not.toHaveBeenCalled();
  });

  it('preserves credentials when the server is temporarily unavailable', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 503, text: async () => '{}' } as Response);
    await expect(refreshAccessToken()).rejects.toMatchObject({ status: 503 });
    expect(tokenStore.clear).not.toHaveBeenCalled();
  });

  it('clears credentials only when refresh is rejected', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 401, text: async () => '{}' } as Response);
    expect(await refreshAccessToken()).toBeNull();
    expect(tokenStore.clear).toHaveBeenCalledWith(1);
  });

  it('shares concurrent refresh requests and persists the rotated token', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, text: async () => JSON.stringify({
      access_token: 'access-new', refresh_token: 'refresh-new', usuario: { id: 'u', nome: 'Teste', email: 'test@example.com' },
    }) } as Response);
    expect(await Promise.all([refreshAccessToken(), refreshAccessToken()])).toEqual(['access-new', 'access-new']);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(tokenStore.saveSession).toHaveBeenCalledWith(1, expect.objectContaining({ refresh_token: 'refresh-new' }));
  });

  it('does not persist a refresh response after the account generation changes', async () => {
    let resolveResponse!: (response: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise(resolve => { resolveResponse = resolve; }));
    const refresh = refreshAccessToken(1);
    await Promise.resolve();
    generation = 2;
    resolveResponse({ ok: true, status: 200, text: async () => JSON.stringify({
      access_token: 'access-a', refresh_token: 'refresh-a',
      usuario: { id: 'a', nome: 'Conta A', email: 'a@example.com' },
    }) } as Response);
    expect(await refresh).toBeNull();
    expect(tokenStore.saveSession).not.toHaveBeenCalled();
  });

  it('discards an in-flight response after the account generation changes', async () => {
    let resolveResponse!: (response: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise(resolve => { resolveResponse = resolve; }));
    const request = apiFetch('/v2/bootstrap');
    await Promise.resolve();
    generation = 2;
    resolveResponse({ ok: true, status: 200, text: async () => '{"usuario":{"id":"a"}}' } as Response);
    await expect(request).rejects.toMatchObject({ code: 'SESSION_CHANGED' });
  });
});
