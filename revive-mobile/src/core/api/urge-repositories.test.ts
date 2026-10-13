import { beforeEach, expect, it, jest } from '@jest/globals';
import { apiFetch } from './client';
import { reviveApi } from './repositories';
jest.mock('./client', () => ({ apiFetch: jest.fn() }));
beforeEach(() => { jest.clearAllMocks(); });
it('uses the mounted v2 endpoints and preserves the queued key and filters', async () => {
  const input = { vicio_id: 'habit', occurred_at: '2026-01-01T12:00:00.000Z', timezone: 'UTC', intensidade: 4 };
  await reviveApi.createUrgeEvent(input,'original-key');
  expect(apiFetch).toHaveBeenCalledWith('/v2/vontades',expect.objectContaining({method:'POST',body:JSON.stringify(input),idempotencyKey:'original-key'}));
  await reviveApi.listUrgeEvents({vicio_id:'habit',inicio:'2026-01-01',fim:'2026-01-02',timezone:'America/Sao_Paulo',cursor:'cursor'});
  expect(apiFetch).toHaveBeenLastCalledWith(expect.stringMatching(/^\/v2\/vontades\?/));
  const url = jest.mocked(apiFetch).mock.calls[1]![0] as string;
  expect(url).toContain('timezone=America%2FSao_Paulo'); expect(url).toContain('cursor=cursor');
});
