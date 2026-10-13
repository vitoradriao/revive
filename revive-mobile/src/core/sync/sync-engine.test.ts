import { beforeEach, expect, it, jest } from '@jest/globals';
import { ApiError } from '@/core/api/errors';
import { reviveApi } from '@/core/api/repositories';
import { cacheUrgeReceipt, getPendingMutations, markMutationFailed, reconcileMutations } from '@/core/storage/database';
import { tokenStore } from '@/core/auth/token-store';
import type { QueuedMutation } from '@/domain/types';
import { syncPendingMutations } from './sync-engine';

jest.mock('@/core/api/repositories', () => ({ reviveApi: {
  updateRecord: jest.fn(), createRecord: jest.fn(), createRelapse: jest.fn(), createUrgeEvent: jest.fn(), bootstrap: jest.fn(),
} }));
jest.mock('@/core/storage/database', () => ({
  cacheUrgeReceipt: jest.fn(), bindRecordEdits: jest.fn(), getPendingMutations: jest.fn(), markMutationSyncing: jest.fn(),
  markMutationFailed: jest.fn(), reconcileMutations: jest.fn(),
}));
jest.mock('@/core/auth/token-store', () => ({ tokenStore: { getUser: jest.fn(), getGeneration: jest.fn(), isCurrent: jest.fn() } }));

const event = (id: string): QueuedMutation => ({
  id, userId: 'user-a', type: 'record.create', payload: { vicio_id: 'habit' },
  occurredAt: '2026-01-01T00:00:00Z', nextRetryAt: '2026-01-01T00:00:00Z', attempts: 0, status: 'pending',
});

let generation = 1;
beforeEach(() => {
  jest.resetAllMocks();
  generation = 1;
  jest.mocked(tokenStore.getUser).mockResolvedValue({ id: 'user-a' } as never);
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

it('replays a queued urge with its stable idempotency key and independent event type', async () => {
  const payload = {
    vicio_id: 'habit', occurred_at: '2026-01-01T00:00:00.000Z', timezone: 'America/Sao_Paulo',
    intensidade: 4, gatilhos: ['estresse'], nota: null,
  };
  jest.mocked(reviveApi.createUrgeEvent).mockResolvedValue({ vontade: { id: 'server-urge', usuario_id: 'user-a' } } as never);
  jest.mocked(getPendingMutations).mockResolvedValue([{ ...event('urge-key'), type: 'urge.create', payload }]);
  expect(await syncPendingMutations('user-a')).toBe(1);
  expect(reviveApi.createUrgeEvent).toHaveBeenCalledWith(payload, 'urge-key');
  expect(cacheUrgeReceipt).toHaveBeenCalledWith('user-a','urge-key',expect.objectContaining({id:'server-urge'}));
  expect(reconcileMutations).toHaveBeenCalledWith('user-a', ['urge-key'], { usuario: { id: 'user-a' } });
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
  let replayStarted!: () => void;
  const started = new Promise<void>(resolve => { replayStarted = resolve; });
  jest.mocked(reviveApi.createRecord).mockImplementationOnce(() => new Promise(resolve => {
    resolveReplay = resolve;
    replayStarted();
  }));
  const sync = syncPendingMutations('user-a');
  await started;
  generation = 2;
  resolveReplay({});
  expect(await sync).toBe(0);
  expect(reconcileMutations).not.toHaveBeenCalled();
  expect(markMutationFailed).toHaveBeenCalledWith(
    'switch-race', 1, 'A sessão mudou antes da confirmação da sincronização.', true,
  );
});

it('does not replay the previous account queue under a new session', async () => {
  jest.mocked(tokenStore.getUser).mockResolvedValue({ id: 'user-b' } as never);
  jest.mocked(getPendingMutations).mockResolvedValue([event('old-account')]);
  expect(await syncPendingMutations('user-a')).toBe(0);
  expect(getPendingMutations).not.toHaveBeenCalled();
  expect(reviveApi.createRecord).not.toHaveBeenCalled();
  expect(markMutationFailed).not.toHaveBeenCalled();
});

it('does not replay after logout or a session change during account lookup', async () => {
  jest.mocked(tokenStore.getUser).mockResolvedValueOnce(null);
  expect(await syncPendingMutations('user-a')).toBe(0);
  jest.mocked(tokenStore.getUser).mockImplementationOnce(async () => {
    generation += 1;
    return { id: 'user-a' } as never;
  });
  expect(await syncPendingMutations('user-a')).toBe(0);
  expect(getPendingMutations).not.toHaveBeenCalled();
  expect(reviveApi.createRecord).not.toHaveBeenCalled();
});

it('never sends an edit while its original creation is unresolved', async () => {
  jest.mocked(getPendingMutations).mockResolvedValue([{ ...event('edit'), type: 'record.update', payload: { recordId: 'creation', dependsOn: 'creation', expected_version: 1, humor: 'Corrected' } }]);
  expect(await syncPendingMutations('user-a')).toBe(0);
  expect(reviveApi.updateRecord).not.toHaveBeenCalled();
});
it('sends a correction with a stable key and leaves conflict text queued', async () => {
  const payload = { recordId: 'record', expected_version: 1, observacoes: 'Local preserved' };
  jest.mocked(getPendingMutations).mockResolvedValue([{ ...event('edit-key'), type: 'record.update', payload }]);
  jest.mocked(reviveApi.updateRecord).mockRejectedValue(new ApiError('Remote changed', 409, 'REVISAO_CONFLITO'));
  expect(await syncPendingMutations('user-a')).toBe(0);
  expect(reviveApi.updateRecord).toHaveBeenCalledWith('record', { expected_version: 1, observacoes: 'Local preserved' }, 'edit-key');
  expect(markMutationFailed).toHaveBeenCalledWith('edit-key', 1, 'REVISAO_CONFLITO: Remote changed', false);
  expect(reconcileMutations).not.toHaveBeenCalled();
});
