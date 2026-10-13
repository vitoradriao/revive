import { ApiError, toUserMessage } from '@/core/api/errors';
import { reviveApi } from '@/core/api/repositories';
import {
  getPendingMutations,
  bindRecordEdits,
  cacheUrgeReceipt,
  markMutationFailed,
  markMutationSyncing,
  reconcileMutations,
} from '@/core/storage/database';
import type { CreateGoalInput, CreateRecordInput, CreateRelapseInput, CreateUrgeEventInput, QueuedMutation } from '@/domain/types';
import { tokenStore } from '@/core/auth/token-store';

const activeSync = new Map<string, Promise<number>>();

const replay = async (mutation: QueuedMutation) => {
  switch (mutation.type) {
    case 'record.create':
      return reviveApi.createRecord(mutation.payload as CreateRecordInput, mutation.id);
    case 'record.update': {
      const { recordId, dependsOn: _dependency, ...input } = mutation.payload;
      return reviveApi.updateRecord(String(recordId), input as import('@/domain/types').UpdateRecordInput, mutation.id);
    }
    case 'relapse.create': {
      const { addictionId, ...payload } = mutation.payload as CreateRelapseInput & { addictionId: string };
      return reviveApi.createRelapse(addictionId, payload, mutation.id);
    }
    case 'urge.create':
      return reviveApi.createUrgeEvent(mutation.payload as CreateUrgeEventInput, mutation.id);
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
    // A delayed caller can still hold the previous account after login changed.
    // Generation checks alone cannot detect a sync started with that stale ID.
    const user = await tokenStore.getUser();
    if (user?.id !== userId || !tokenStore.isCurrent(generation)) return 0;
    const mutations = await getPendingMutations(userId);
    let synced = 0;
    const committed: QueuedMutation[] = [];
    for (const original of mutations) {
      const mutation = original.payload.dependsOn ? (await getPendingMutations(userId)).find(m => m.id === original.id) || original : original;
      if (mutation.type === 'record.update' && mutation.payload.dependsOn) break;
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
        const response = await replay(mutation);
        if (mutation.type === 'record.create' && tokenStore.isCurrent(generation)) {
          const record = (response as { registro?: import('@/domain/types').DailyRecord })?.registro;
          if (record?.id) await bindRecordEdits(userId, mutation.id, record);
        }
        if (mutation.type === 'urge.create' && tokenStore.isCurrent(generation)) {
          const event = (response as { vontade?: import('@/domain/types').UrgeEvent })?.vontade;
          if (!event?.id || event.usuario_id !== userId) throw new Error('Resposta de vontade inválida.');
          await cacheUrgeReceipt(userId, mutation.id, event);
        }
        if (!tokenStore.isCurrent(generation)) {
          await markMutationFailed(mutation.id, mutation.attempts + 1, 'A sessão mudou antes da confirmação da sincronização.', true);
          break;
        }
        committed.push(mutation);
      } catch (error) {
        const retryable = error instanceof ApiError ? error.isRetryable : false;
        await markMutationFailed(mutation.id, mutation.attempts + 1, error instanceof ApiError && error.code === 'REVISAO_CONFLITO' ? 'REVISAO_CONFLITO: ' + error.message : toUserMessage(error), retryable);
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
