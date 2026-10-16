import { afterEach, describe, expect, it, vi } from 'vitest';
import { httpRequest } from './http';

afterEach(() => vi.unstubAllGlobals());

describe('HTTP session transport semantics', () => {
  it('accepts a bodyless 204 and sends same-origin credentials without caching', async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetch);
    await expect(httpRequest('/v2/web-auth/logout', { method: 'POST', body: '{}' })).resolves.toEqual({});
    expect(fetch).toHaveBeenCalledWith('/api/v2/web-auth/logout', expect.objectContaining({
      credentials: 'same-origin', cache: 'no-store', method: 'POST'
    }));
  });

  it.each([401, 409, 422, 429, 503])('preserves status %i and server details', async status => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      codigo: 'SYNTHETIC_CODE', mensagem: 'Mensagem de teste',
      campos: { nome: 'Inválido' }, request_id: 'synthetic-request'
    }), { status, headers: { 'Content-Type': 'application/json', 'Retry-After': '60' } })));
    await expect(httpRequest('/v2/test')).rejects.toMatchObject({
      status, code: 'SYNTHETIC_CODE', message: 'Mensagem de teste',
      fields: { nome: 'Inválido' }, requestId: 'synthetic-request', retryAfter: '60',
      outcomeUnknown: status >= 500
    });
  });

  it('keeps a network failure distinct from an HTTP credential rejection', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    await expect(httpRequest('/v2/test')).rejects.toMatchObject({
      code: 'REDE_INDISPONIVEL', outcomeUnknown: true
    });
  });
});
