import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor, act } from '@testing-library/react-native';
import { beforeEach, expect, it, jest } from '@jest/globals';
import { useRecords } from './use-records';
import { reviveApi } from '@/core/api/repositories';
import { tokenStore } from '@/core/auth/token-store';
import { ApiError } from '@/core/api/errors';
import { cacheRecordPage, getCachedRecordPage, getCachedBootstrap } from '@/core/storage/database';
let mockUser = 'a';
jest.mock('@/features/auth/session-context', () => ({ useSession: () => ({ user: { id: mockUser } }) }));
jest.mock('@/core/auth/token-store', () => ({ tokenStore: { getGeneration: () => 1, isCurrent: () => true, getUser: jest.fn() } }));
jest.mock('@/core/api/repositories', () => ({ reviveApi: { listRecords: jest.fn() } }));
jest.mock('@/core/storage/database', () => ({ cacheRecordPage: jest.fn(), getCachedRecordPage: jest.fn(), getCachedBootstrap: jest.fn(), getPendingMutations: async () => [] }));
const filter = { inicio: '2026-10-01', fim: '2026-10-04' };
const record = { id: 'r', vicio_id: 'h', data_registro: '2026-10-04', humor: 'a only' };
const wrapper = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return function QueryWrapper({ children }: { children: React.ReactNode }) { return <QueryClientProvider client={client}>{children}</QueryClientProvider>; };
};
beforeEach(() => {
  jest.clearAllMocks(); mockUser = 'a';
  jest.mocked(tokenStore.getUser).mockImplementation(async () => ({ id: mockUser }) as never);
  jest.mocked(cacheRecordPage).mockResolvedValue();
  jest.mocked(getCachedRecordPage).mockResolvedValue(null);
  jest.mocked(getCachedBootstrap).mockResolvedValue(null);
});
it('deduplicates tied pages and scopes the durable cache by account, filter and cursor', async () => {
  jest.mocked(reviveApi.listRecords).mockResolvedValueOnce({ registros: [record], next_cursor: 'cursor' }).mockResolvedValueOnce({ registros: [record, { ...record, id: 'second' }], next_cursor: null });
  const hook = await renderHook(() => useRecords(filter), { wrapper: wrapper() });
  await waitFor(() => expect(hook.result.current.records).toHaveLength(1));
  await act(() => hook.result.current.fetchNextPage());
  await waitFor(() => expect(hook.result.current.records).toHaveLength(2));
  expect(cacheRecordPage).toHaveBeenCalledWith('a', expect.stringContaining('cursor'), expect.anything());
});
it('does not persist or display an account A response after switching to B', async () => {
  let finish!: (value: { registros: typeof record[]; next_cursor: null }) => void;
  jest.mocked(reviveApi.listRecords).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const hook = await renderHook(() => useRecords(filter), { wrapper: wrapper() });
  await waitFor(() => expect(reviveApi.listRecords).toHaveBeenCalledTimes(1));
  mockUser = 'b';
  await act(async () => { finish({ registros: [record], next_cursor: null }); });
  await hook.rerender(undefined);
  expect(hook.result.current.records).toEqual([]);
  expect(cacheRecordPage).not.toHaveBeenCalled();
});
it('uses only the current account filtered cache when offline and declares local coverage', async () => {
  jest.mocked(reviveApi.listRecords).mockRejectedValue(new ApiError('Offline',0));
  jest.mocked(getCachedRecordPage).mockResolvedValue({ registros: [record], next_cursor: null });
  const hook = await renderHook(() => useRecords(filter), { wrapper: wrapper() });
  await waitFor(() => expect(hook.result.current.records).toHaveLength(1));
  expect(hook.result.current.local).toBe(true);
  expect(getCachedRecordPage).toHaveBeenCalledWith('a',expect.stringContaining('2026-10-01'));
});
