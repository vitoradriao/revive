import { renderHook } from '@testing-library/react-native';
import { beforeEach, expect, it, jest } from '@jest/globals';
import NetInfo from '@react-native-community/netinfo';
import { enqueueMutation, getCachedBootstrap, getPendingMutations } from '@/core/storage/database';
import { syncPendingMutations } from '@/core/sync/sync-engine';
import { queryClient } from '@/core/query/client';
import { tokenStore } from '@/core/auth/token-store';
import { localDateKey } from '@/domain/formats';
import type { BootstrapData } from '@/domain/types';
import { useReviveMutations } from './use-revive-mutations';

jest.mock('@react-native-community/netinfo', () => ({ fetch: jest.fn() }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'durable-key' }));
jest.mock('@/features/auth/session-context', () => ({ useSession: () => ({ user: { id: 'a' } }) }));
jest.mock('@/features/bootstrap/use-bootstrap', () => ({ bootstrapKey: (id: string) => ['bootstrap', id] }));
jest.mock('@/core/storage/database', () => ({ enqueueMutation: jest.fn(), getCachedBootstrap: jest.fn(), getPendingMutations: jest.fn() }));
jest.mock('@/core/sync/sync-engine', () => ({ syncPendingMutations: jest.fn() }));
jest.mock('@/core/query/client', () => ({ queryClient: { invalidateQueries: jest.fn(), getQueryData: jest.fn(), setQueryData: jest.fn() } }));
jest.mock('@/core/auth/token-store', () => ({ tokenStore: { getUser: jest.fn(), getGeneration: () => 1, isCurrent: jest.fn() } }));

const snapshot: BootstrapData = {
  usuario: { id: 'a', nome: 'Pessoa', email: 'test@example.invalid' }, server_time: '', vicios: [], registros: [], recaidas: [], metas: [], mensagem: null,
};
beforeEach(() => {
  jest.resetAllMocks();
  jest.mocked(tokenStore.getUser).mockResolvedValue(snapshot.usuario);
  jest.mocked(tokenStore.isCurrent).mockReturnValue(true);
  jest.mocked(getCachedBootstrap).mockResolvedValue(snapshot);
  jest.mocked(getPendingMutations).mockResolvedValue([]);
  jest.mocked(NetInfo.fetch).mockResolvedValue({ isConnected: true } as never);
  jest.mocked(enqueueMutation).mockResolvedValue('durable-key');
});

it('persists before any network work, preserving date and key in the offline queue', async () => {
  jest.mocked(NetInfo.fetch).mockResolvedValue({ isConnected: false } as never);
  const hook = await renderHook(() => useReviveMutations());
  expect(await hook.result.current.createRecordWithReceipt({ vicio_id: 'h', humor: 'Bem' })).toEqual({ id: 'durable-key', status: 'queued' });
  expect(enqueueMutation).toHaveBeenCalledWith('a', 'record.create', expect.objectContaining({ data_registro: localDateKey(), timezone: expect.any(String) }), expect.any(String), 'durable-key');
  expect(jest.mocked(enqueueMutation).mock.invocationCallOrder[0]!).toBeLessThan(jest.mocked(NetInfo.fetch).mock.invocationCallOrder[0]!);
  expect(syncPendingMutations).not.toHaveBeenCalled();
});

it('throws only before the local intent is confirmed, without contacting the network', async () => {
  jest.mocked(enqueueMutation).mockRejectedValue(new Error('SQLite unavailable'));
  const hook = await renderHook(() => useReviveMutations());
  await expect(hook.result.current.createRecordWithReceipt({ vicio_id: 'h', humor: 'Bem' })).rejects.toThrow('SQLite unavailable');
  expect(NetInfo.fetch).not.toHaveBeenCalled();
});

it.each(['projection', 'network', 'sync', 'invalidation'] as const)('returns a durable receipt when %s fails after enqueue', async stage => {
  if (stage === 'projection') jest.mocked(getCachedBootstrap).mockRejectedValue(new Error('Read failed'));
  if (stage === 'network') jest.mocked(NetInfo.fetch).mockRejectedValue(new Error('Network unavailable'));
  if (stage === 'sync') jest.mocked(syncPendingMutations).mockRejectedValue(new Error('Sync unavailable'));
  if (stage === 'invalidation') jest.mocked(queryClient.invalidateQueries).mockRejectedValue(new Error('Cache unavailable'));
  const hook = await renderHook(() => useReviveMutations());
  expect(await hook.result.current.createRecordWithReceipt({ vicio_id: 'h', humor: 'Bem' })).toEqual({ id: 'durable-key', status: 'queued' });
  expect(enqueueMutation).toHaveBeenCalledTimes(1);
});

it('reports failed sync separately from an acknowledged intent', async () => {
  jest.mocked(getPendingMutations).mockResolvedValue([{ id: 'durable-key', status: 'failed', type: 'record.create', userId: 'a', payload: { vicio_id: 'h' } }] as never);
  const hook = await renderHook(() => useReviveMutations());
  expect(await hook.result.current.createRecordWithReceipt({ vicio_id: 'h', humor: 'Bem' })).toEqual({ id: 'durable-key', status: 'failed' });
  jest.mocked(getPendingMutations).mockResolvedValue([]);
  expect(await hook.result.current.createRecordWithReceipt({ vicio_id: 'h', humor: 'Bem' })).toEqual({ id: 'durable-key', status: 'synced' });
});

it('preserves an explicit local date near midnight independently of UTC', async () => {
  jest.mocked(NetInfo.fetch).mockResolvedValue({ isConnected: false } as never);
  const hook = await renderHook(() => useReviveMutations());
  await hook.result.current.createRecordWithReceipt({ vicio_id: 'h', humor: 'Bem', data_registro: '2026-10-04', timezone: 'America/Sao_Paulo' });
  expect(enqueueMutation).toHaveBeenCalledWith('a', 'record.create', expect.objectContaining({ data_registro: '2026-10-04', timezone: 'America/Sao_Paulo' }), expect.any(String), 'durable-key');
});

it('rejects a stale account before enqueue and suppresses old cache publication after a switch', async () => {
  jest.mocked(tokenStore.getUser).mockResolvedValue({ ...snapshot.usuario, id: 'b' });
  const hook = await renderHook(() => useReviveMutations());
  await expect(hook.result.current.createRecordWithReceipt({ vicio_id: 'h', humor: 'Bem' })).rejects.toThrow('A sessão mudou');
  expect(enqueueMutation).not.toHaveBeenCalled();
  jest.mocked(tokenStore.getUser).mockResolvedValue(snapshot.usuario);
  jest.mocked(getCachedBootstrap).mockImplementation(async () => {
    jest.mocked(tokenStore.isCurrent).mockReturnValue(false);
    return snapshot;
  });
  expect(await hook.result.current.createRecordWithReceipt({ vicio_id: 'h', humor: 'Bem' })).toEqual({ id: 'durable-key', status: 'queued' });
  expect(queryClient.setQueryData).not.toHaveBeenCalled();
  expect(syncPendingMutations).not.toHaveBeenCalled();
});

it('persists an urge with its historical timestamp before transport and validates active ownership', async () => {
  const habit = { id:'h', usuario_id:'a', nome_vicio:'Synthetic',ativo:true,data_inicio:'2026-01-01' };
  jest.mocked(getCachedBootstrap).mockResolvedValue({...snapshot,vicios:[habit]});
  jest.mocked(NetInfo.fetch).mockResolvedValue({isConnected:false} as never);
  const hook=await renderHook(()=>useReviveMutations());
  const payload={vicio_id:'h',occurred_at:'2026-10-12T20:00:00.000Z',timezone:'America/Sao_Paulo',intensidade:0};
  expect(await hook.result.current.createUrgeEventWithReceipt(payload)).toEqual({id:'durable-key',status:'queued'});
  expect(enqueueMutation).toHaveBeenCalledWith('a','urge.create',expect.objectContaining({...payload,gatilhos:[],nota:null,acao_realizada:null,resultado:null}),payload.occurred_at,'durable-key');
  expect(jest.mocked(enqueueMutation).mock.invocationCallOrder[0]!).toBeLessThan(jest.mocked(NetInfo.fetch).mock.invocationCallOrder[0]!);
  jest.mocked(enqueueMutation).mockClear();
  jest.mocked(getCachedBootstrap).mockResolvedValue({...snapshot,vicios:[{...habit,ativo:false}]});
  await expect(hook.result.current.createUrgeEventWithReceipt(payload)).rejects.toThrow('Reative');
  expect(enqueueMutation).not.toHaveBeenCalled();
  jest.mocked(getCachedBootstrap).mockResolvedValue({...snapshot,vicios:[{...habit,usuario_id:'b'}]});
  await expect(hook.result.current.createUrgeEventWithReceipt(payload)).rejects.toThrow('indisponível');
  expect(enqueueMutation).not.toHaveBeenCalled();
});
