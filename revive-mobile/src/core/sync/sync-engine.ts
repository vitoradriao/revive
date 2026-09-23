import { ApiError, toUserMessage } from '@/core/api/errors';
import { reviveApi } from '@/core/api/repositories';
import {
  getPendingMutations,
  markMutationFailed,
  markMutationSyncing,
  removeMutation,
} from '@/core/storage/database';
import type { CreateGoalInput, CreateRecordInput, CreateRelapseInput, QueuedMutation } from '@/domain/types';

let activeSync: Promise<number> | null = null;

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
  if (activeSync) return activeSync;
  activeSync = (async () => {
    const mutations = await getPendingMutations(userId);
    let synced = 0;
    for (const mutation of mutations) {
      if (mutation.needsRecovery) break;
      // Do not let later events overtake an earlier event waiting for retry.
      if (new Date(mutation.nextRetryAt).getTime() > Date.now()) break;
      await markMutationSyncing(mutation.id);
      try {
        await replay(mutation);
        await removeMutation(mutation.id);
        synced += 1;
      } catch (error) {
        const retryable = error instanceof ApiError ? error.isRetryable : false;
        await markMutationFailed(mutation.id, mutation.attempts + 1, toUserMessage(error), retryable);
        break;
      }
    }
    return synced;
  })().finally(() => {
    activeSync = null;
  });
  return activeSync;
};
