import * as Crypto from 'expo-crypto';
import NetInfo from '@react-native-community/netinfo';
import { tokenStore } from '@/core/auth/token-store';
import { queryClient } from '@/core/query/client';
import { enqueueMutation, getCachedBootstrap, getPendingMutations, replaceFailedRecordEdit } from '@/core/storage/database';
import { withHabitOperationLock } from '@/core/sync/habit-operation-lock';
import { syncPendingMutations } from '@/core/sync/sync-engine';
import { withPendingMutations } from '@/domain/pending-snapshot';
import type { DailyRecord, UpdateRecordInput } from '@/domain/types';
import { bootstrapKey } from '@/features/bootstrap/use-bootstrap';

export async function editRecord(userId: string, record: DailyRecord, input: UpdateRecordInput, replaceId?: string) {
  return withHabitOperationLock(userId, async () => {
    const generation = tokenStore.getGeneration();
    if ((await tokenStore.getUser())?.id !== userId || !tokenStore.isCurrent(generation)) throw new Error('A sessão mudou. Abra o registro novamente.');
    const pending = await getPendingMutations(userId);
    const edits = pending.filter(m => m.type === 'record.update' && m.payload.recordId === record.id);
    if (edits.some(m => m.id !== replaceId)) throw new Error('Este registro já tem uma correção pendente. Sincronize ou resolva o conflito primeiro.');
    const creation = pending.find(m => m.type === 'record.create' && m.id === record.id);
    const payload = { ...input, recordId: record.id, ...(creation ? { dependsOn: creation.id } : {}) };
    const id = Crypto.randomUUID();
    if (replaceId) await replaceFailedRecordEdit(userId, replaceId, id, payload);
    else await enqueueMutation(userId, 'record.update', payload, new Date().toISOString(), id);
    // After durability, return a receipt even when transport or cache refresh fails.
    try {
      const snapshot = await getCachedBootstrap(userId);
      if (snapshot && tokenStore.isCurrent(generation)) queryClient.setQueryData(bootstrapKey(userId), withPendingMutations(snapshot, await getPendingMutations(userId)));
      if ((await NetInfo.fetch()).isConnected && tokenStore.isCurrent(generation)) await syncPendingMutations(userId);
      if (!tokenStore.isCurrent(generation)) return { id, status: 'queued' as const };
      await queryClient.invalidateQueries({ queryKey: bootstrapKey(userId) });
      await queryClient.invalidateQueries({ queryKey: ['diary', userId] });
      const queued = (await getPendingMutations(userId)).find(m => m.id === id);
      return { id, status: queued?.status === 'failed' ? 'failed' as const : queued ? 'queued' as const : 'synced' as const };
    } catch { return { id, status: 'queued' as const }; }
  });
}
