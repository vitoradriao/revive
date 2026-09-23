import { beforeEach, expect, it, jest } from '@jest/globals';
import { ApiError } from '@/core/api/errors';
import { reviveApi } from '@/core/api/repositories';
import { getPendingMutations, markMutationFailed, reconcileMutations } from '@/core/storage/database';
import { tokenStore } from '@/core/auth/token-store';
import type { QueuedMutation } from '@/domain/types';
import { syncPendingMutations } from './sync-engine';

jest.mock('@/core/api/repositories', () => ({ reviveApi: { createRecord: jest.fn(), createRelapse: jest.fn(), bootstrap: jest.fn() } }));
jest.mock('@/core/storage/database', () => ({
  getPendingMutations: jest.fn(), markMutationSyncing: jest.fn(),
  markMutationFailed: jest.fn(), reconcileMutations: jest.fn(),
}));
jest.mock('@/core/auth/token-store', () => ({ tokenStore: { getGeneration: jest.fn(), isCurrent: jest.fn() } }));

const event = (id: string): QueuedMutation => ({
  id, userId: 'user-a', type: 'record.create', payload: { vicio_id: 'habit' },
  occurredAt: '2026-01-01T00:00:00Z', nextRetryAt: '2026-01-01T00:00:00Z', attempts: 0, status: 'pending',
});

let generation = 1;
beforeEach(() => {
  jest.resetAllMocks();
  generation = 1;
  jest.mocked(tokenStore.getGeneration).mockImplementation(() => generation);
  jest.mocked(tokenStore.isCurrent).mockImplementation(expected => generation === expected);
  jest.mocked(reviveApi.bootstrap).mockResolvedValue({ usuario: { id: 'user-a' } } as never);
});

it('does not overtake an earlier event waiting for retry', async () => {
  jest.mocked(getPendingMutations).mockResolvedValue([{ ...event('first'), nextRetryAt: '2099-01-01T00:00:00Z' }, event('second')]);
  expect(await syncPendingMutations('user-a')).toBe(0);
  expect(reviveApi.createRecord).not.toHaveBeenCalled();
});

it('does not send an incompatible event or overtake it', async () => {
  jest.mocked(getPendingMutations).mockResolvedValue([{ ...event('unknown'), needsRecovery: true }, event('second')]);
  expect(await syncPendingMutations('user-a')).toBe(0);
  expect(reviveApi.createRecord).not.toHaveBeenCalled();
  expect(reconcileMutations).not.toHaveBeenCalled();
});

it('stops on a network failure without deleting or sending subsequent events', async () => {
  jest.mocked(getPendingMutations).mockResolvedValue([event('first'), event('second')]);
  jest.mocked(reviveApi.createRecord).mockRejectedValue(new ApiError('Offline', 0));
  expect(await syncPendingMutations('user-a')).toBe(0);
  expect(reviveApi.createRecord).toHaveBeenCalledTimes(1);
  expect(reconcileMutations).not.toHaveBeenCalled();
  expect(markMutationFailed).toHaveBeenCalled();
});

it('replays relapse with its original key and without the route id in the body', async () => {
  jest.mocked(getPendingMutations).mockResolvedValue([{
    ...event('original-key'), type: 'relapse.create', payload: { addictionId: 'habit', motivo: 'reflection' },
  }]);
  expect(await syncPendingMutations('user-a')).toBe(1);
  expect(reviveApi.createRelapse).toHaveBeenCalledWith('habit', { motivo: 'reflection' }, 'original-key');
  expect(reconcileMutations).toHaveBeenCalledWith('user-a', ['original-key'], { usuario: { id: 'user-a' } });
});

it('keeps the original key queued when the server accepted a mutation but canonical reconciliation failed', async () => {
  jest.mocked(getPendingMutations).mockResolvedValue([event('committed-awaiting-snapshot')]);
  jest.mocked(reviveApi.createRecord).mockResolvedValue({} as never);
  jest.mocked(reviveApi.bootstrap).mockRejectedValue(new ApiError('Temporariamente indisponível', 503));
  expect(await syncPendingMutations('user-a')).toBe(0);
  expect(markMutationFailed).toHaveBeenCalledWith(
    'committed-awaiting-snapshot', 1, 'Temporariamente indisponível', true,
  );
  expect(reconcileMutations).not.toHaveBeenCalled();
});

it('keeps a mutation pending when the account changes during its request', async () => {
  jest.mocked(getPendingMutations).mockResolvedValue([event('switch-race')]);
  let resolveReplay!: (value: unknown) => void;
  jest.mocked(reviveApi.createRecord).mockImplementationOnce(() => new Promise(resolve => { resolveReplay = resolve; }));
  const sync = syncPendingMutations('user-a');
  await Promise.resolve();
  await Promise.resolve();
  generation = 2;
  resolveReplay({});
  expect(await sync).toBe(0);
  expect(reconcileMutations).not.toHaveBeenCalled();
  expect(markMutationFailed).toHaveBeenCalledWith(
    'switch-race', 1, 'A sessão mudou antes da confirmação da sincronização.', true,
  );
});
