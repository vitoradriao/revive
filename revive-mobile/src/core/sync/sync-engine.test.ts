import { beforeEach, expect, it, jest } from '@jest/globals';
import { ApiError } from '@/core/api/errors';
import { reviveApi } from '@/core/api/repositories';
import { getPendingMutations, markMutationFailed, removeMutation } from '@/core/storage/database';
import type { QueuedMutation } from '@/domain/types';
import { syncPendingMutations } from './sync-engine';

jest.mock('@/core/api/repositories', () => ({ reviveApi: { createRecord: jest.fn(), createRelapse: jest.fn() } }));
jest.mock('@/core/storage/database', () => ({
  getPendingMutations: jest.fn(), markMutationSyncing: jest.fn(),
  markMutationFailed: jest.fn(), removeMutation: jest.fn(),
}));

const event = (id: string): QueuedMutation => ({
  id, userId: 'user-a', type: 'record.create', payload: { vicio_id: 'habit' },
  occurredAt: '2026-01-01T00:00:00Z', nextRetryAt: '2026-01-01T00:00:00Z', attempts: 0, status: 'pending',
});

beforeEach(() => { jest.resetAllMocks(); });

it('does not overtake an earlier event waiting for retry', async () => {
  jest.mocked(getPendingMutations).mockResolvedValue([{ ...event('first'), nextRetryAt: '2099-01-01T00:00:00Z' }, event('second')]);
  expect(await syncPendingMutations('user-a')).toBe(0);
  expect(reviveApi.createRecord).not.toHaveBeenCalled();
});

it('does not send an incompatible event or overtake it', async () => {
  jest.mocked(getPendingMutations).mockResolvedValue([{ ...event('unknown'), needsRecovery: true }, event('second')]);
  expect(await syncPendingMutations('user-a')).toBe(0);
  expect(reviveApi.createRecord).not.toHaveBeenCalled();
  expect(removeMutation).not.toHaveBeenCalled();
});

it('stops on a network failure without deleting or sending subsequent events', async () => {
  jest.mocked(getPendingMutations).mockResolvedValue([event('first'), event('second')]);
  jest.mocked(reviveApi.createRecord).mockRejectedValue(new ApiError('Offline', 0));
  expect(await syncPendingMutations('user-a')).toBe(0);
  expect(reviveApi.createRecord).toHaveBeenCalledTimes(1);
  expect(removeMutation).not.toHaveBeenCalled();
  expect(markMutationFailed).toHaveBeenCalled();
});

it('replays relapse with its original key and without the route id in the body', async () => {
  jest.mocked(getPendingMutations).mockResolvedValue([{
    ...event('original-key'), type: 'relapse.create', payload: { addictionId: 'habit', motivo: 'reflection' },
  }]);
  expect(await syncPendingMutations('user-a')).toBe(1);
  expect(reviveApi.createRelapse).toHaveBeenCalledWith('habit', { motivo: 'reflection' }, 'original-key');
  expect(removeMutation).toHaveBeenCalledWith('original-key');
});
