import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { beforeEach, expect, it, jest } from '@jest/globals';
import { useUrgeEvents } from './use-urge-events';
import { reviveApi } from '@/core/api/repositories';
import { tokenStore } from '@/core/auth/token-store';
import { ApiError } from '@/core/api/errors';
import { cacheUrgeEventPage, getCachedUrgeEventPage, getLocalUrgeEvents, getPendingMutations } from '@/core/storage/database';
import type { UrgeEvent, UrgeEventPage } from '@/domain/types';
let mockUser = 'a';
jest.mock('@/features/auth/session-context', () => ({ useSession: () => ({ user: { id: mockUser } }) }));
jest.mock('@/core/auth/token-store', () => ({ tokenStore: { getGeneration: () => 1, isCurrent: () => true, getUser: jest.fn() } }));
jest.mock('@/core/api/repositories', () => ({ reviveApi: { listUrgeEvents: jest.fn() } }));
jest.mock('@/core/storage/database', () => ({ cacheUrgeEventPage: jest.fn(), getCachedUrgeEventPage: jest.fn(), getLocalUrgeEvents: jest.fn(), getPendingMutations: jest.fn() }));
const filter = { vicio_id: 'h', inicio: '2026-10-12', fim: '2026-10-12', timezone: 'America/Sao_Paulo' };
const event: UrgeEvent = { id:'r',usuario_id:'a',vicio_id:'h',occurred_at:'2026-10-13T01:45:00.000Z',timezone:'America/Sao_Paulo',intensidade:4,gatilhos:[],nota:null,acao_realizada:null,resultado:null,created_at:'2026-10-13T01:45:00.000Z',updated_at:'2026-10-13T01:45:00.000Z' };
const page = (events:UrgeEvent[] = [event],cursor:string|null = null): UrgeEventPage => ({vontades:events,next_cursor:cursor,cobertura:{total:events.length,retornados:events.length,tem_mais:Boolean(cursor)},atualizado_em:event.updated_at});
const wrapper = () => {
  const client = new QueryClient({ defaultOptions:{queries:{retry:false,gcTime:0}} });
  return function QueryWrapper({children}:{children:React.ReactNode}) {return <QueryClientProvider client={client}>{children}</QueryClientProvider>;};
};
beforeEach(() => {
  jest.clearAllMocks(); mockUser='a';
  jest.mocked(tokenStore.getUser).mockImplementation(async () => ({id:mockUser}) as never);
  jest.mocked(cacheUrgeEventPage).mockResolvedValue();
  jest.mocked(getCachedUrgeEventPage).mockResolvedValue(null);
  jest.mocked(getLocalUrgeEvents).mockResolvedValue([]);
  jest.mocked(getPendingMutations).mockResolvedValue([]);
});
it('deduplicates server/receipt/pending identity across page boundaries', async () => {
  jest.mocked(reviveApi.listUrgeEvents).mockResolvedValueOnce(page([event],'cursor')).mockResolvedValueOnce(page([event,{...event,id:'s'}]));
  jest.mocked(getLocalUrgeEvents).mockResolvedValue([event]);
  jest.mocked(getPendingMutations).mockResolvedValue([{id:'local-key',userId:'a',type:'urge.create',resolvedUrgeEvent:event,payload:event,status:'pending'}] as never);
  const hook = await renderHook(() => useUrgeEvents(filter),{wrapper:wrapper()});
  await waitFor(() => expect(hook.result.current.events).toHaveLength(1));
  expect(hook.result.current.events[0]?.pending).toBe(true);
  await act(() => hook.result.current.fetchNextPage());
  await waitFor(() => expect(hook.result.current.events).toHaveLength(2));
  expect(cacheUrgeEventPage).toHaveBeenCalledWith('a',expect.stringContaining('America/Sao_Paulo'),expect.anything());
});
it('keeps an acknowledged local event visible when bootstrap has no urge history', async () => {
  jest.mocked(reviveApi.listUrgeEvents).mockResolvedValue(page([]));
  jest.mocked(getLocalUrgeEvents).mockResolvedValue([event]);
  const hook = await renderHook(() => useUrgeEvents(filter),{wrapper:wrapper()});
  await waitFor(() => expect(hook.result.current.events[0]?.id).toBe(event.id));
  expect(hook.result.current.events[0]?.pending).toBeUndefined();
});
it('applies chosen-zone dates and habit filters to offline cache and pending events', async () => {
  jest.mocked(reviveApi.listUrgeEvents).mockRejectedValue(new ApiError('Offline',0));
  jest.mocked(getLocalUrgeEvents).mockResolvedValue([event,{...event,id:'foreign-habit',vicio_id:'other'}]);
  jest.mocked(getPendingMutations).mockResolvedValue([{id:'pending',userId:'a',type:'urge.create',payload:{...event,occurred_at:'2026-10-13T00:45:00.000Z'},status:'failed',lastError:'Failure',occurredAt:event.occurred_at}] as never);
  const hook = await renderHook(() => useUrgeEvents(filter),{wrapper:wrapper()});
  await waitFor(() => expect(hook.result.current.events).toHaveLength(2));
  expect(hook.result.current.local).toBe(true);
  expect(hook.result.current.events.find(e=>e.id==='pending')?.sync_error).toBe('Failure');
  const utc = await renderHook(() => useUrgeEvents({...filter,timezone:'UTC'}),{wrapper:wrapper()});
  await waitFor(() => expect(utc.result.current.isSuccess).toBe(true));
  expect(utc.result.current.events).toEqual([]);
});
it('rejects a late A response before caching or displaying it under B', async () => {
  let finish!: (value:UrgeEventPage)=>void;
  jest.mocked(reviveApi.listUrgeEvents).mockImplementation(() => new Promise(resolve=>{finish=resolve;}));
  const hook = await renderHook(() => useUrgeEvents(filter),{wrapper:wrapper()});
  await waitFor(() => expect(reviveApi.listUrgeEvents).toHaveBeenCalledTimes(1));
  mockUser='b';
  await act(async () => {finish(page());});
  await hook.rerender(undefined);
  expect(hook.result.current.events).toEqual([]);
  expect(cacheUrgeEventPage).not.toHaveBeenCalled();
});
it('does not hide an authorization error behind cached records', async () => {
  jest.mocked(reviveApi.listUrgeEvents).mockRejectedValue(new ApiError('No access',404));
  jest.mocked(getCachedUrgeEventPage).mockResolvedValue({page:page(),updatedAt:event.updated_at});
  const hook = await renderHook(() => useUrgeEvents(filter),{wrapper:wrapper()});
  await waitFor(() => expect(hook.result.current.isError).toBe(true));
  expect(hook.result.current.events).toEqual([]);
  expect(getCachedUrgeEventPage).not.toHaveBeenCalled();
});

it('shows a confirmed local event offline even when an older filtered page was empty', async () => {
  jest.mocked(reviveApi.listUrgeEvents).mockRejectedValue(new ApiError('Offline',0));
  jest.mocked(getCachedUrgeEventPage).mockResolvedValue({page:page([]),updatedAt:event.updated_at});
  jest.mocked(getLocalUrgeEvents).mockResolvedValue([event]);
  const hook = await renderHook(() => useUrgeEvents(filter),{wrapper:wrapper()});
  await waitFor(() => expect(hook.result.current.events).toHaveLength(1));
  expect(hook.result.current.events[0]?.id).toBe(event.id);
  expect(hook.result.current.local).toBe(true);
});
