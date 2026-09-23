import { ApiError, toUserMessage } from '@/core/api/errors';
import { reviveApi } from '@/core/api/repositories';
import {
  getPendingMutations,
  markMutationFailed,
  markMutationSyncing,
  reconcileMutations,
} from '@/core/storage/database';
import type { CreateGoalInput, CreateRecordInput, CreateRelapseInput, QueuedMutation } from '@/domain/types';
import { tokenStore } from '@/core/auth/token-store';

const activeSync = new Map<string, Promise<number>>();

const replay = async (mutation: QueuedMutation) => {
  switch (mutation.type) {
    case 'record.create':
      return reviveApi.createRecord(mutation.payload as CreateRecordInput, mutation.id);
    case 'relapse.create': {
      const { addictionId, ...payload } = mutation.payload as CreateRelapseInput & { addictionId: string };
      return reviveApi.createRelapse(addictionId, payload, mutation.id);
    }
    case 'goal.create':
      return reviveApi.createGoal(mutation.payload as CreateGoalInput, mutation.id);
    case 'goal.complete':
      return reviveApi.completeGoal(String(mutation.payload.goalId), mutation.id);
  }
};

export const syncPendingMutations = (userId: string) => {
  const generation = tokenStore.getGeneration();
  const key = `${userId}:${generation}`;
  const running = activeSync.get(key);
  if (running) return running;
  const promise = (async () => {
    const mutations = await getPendingMutations(userId);
    let synced = 0;
    const committed: QueuedMutation[] = [];
    for (const mutation of mutations) {
      if (!tokenStore.isCurrent(generation)) break;
      if (mutation.needsRecovery) break;
      // Do not let later events overtake an earlier event waiting for retry.
      if (new Date(mutation.nextRetryAt).getTime() > Date.now()) break;
      await markMutationSyncing(mutation.id);
      try {
        if (!tokenStore.isCurrent(generation)) {
          await markMutationFailed(mutation.id, mutation.attempts + 1, 'A sessão mudou antes do envio.', true);
          break;
        }
        await replay(mutation);
        if (!tokenStore.isCurrent(generation)) {
          await markMutationFailed(mutation.id, mutation.attempts + 1, 'A sessão mudou antes da confirmação da sincronização.', true);
          break;
        }
        committed.push(mutation);
      } catch (error) {
        const retryable = error instanceof ApiError ? error.isRetryable : false;
        await markMutationFailed(mutation.id, mutation.attempts + 1, toUserMessage(error), retryable);
        break;
      }
    }
    if (committed.length) {
      try {
        if (!tokenStore.isCurrent(generation)) throw new Error('A sessão mudou antes da reconciliação local.');
        const snapshot = await reviveApi.bootstrap();
        if (snapshot.usuario.id !== userId || !tokenStore.isCurrent(generation)) {
          throw new Error('A sessão mudou antes da reconciliação local.');
        }
        await reconcileMutations(userId, committed.map(mutation => mutation.id), snapshot);
        synced = committed.length;
      } catch (error) {
        // A server commit without its canonical local snapshot stays queued;
        // replay uses the same keys and cannot duplicate the business writes.
        for (const mutation of committed) {
          await markMutationFailed(mutation.id, mutation.attempts + 1, toUserMessage(error), true);
        }
      }
    }
    return synced;
  })().finally(() => {
    activeSync.delete(key);
  });
  activeSync.set(key, promise);
  return promise;
};
