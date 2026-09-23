import NetInfo from '@react-native-community/netinfo';
import * as Crypto from 'expo-crypto';
import { queryClient } from '@/core/query/client';
import { enqueueMutation, getCachedBootstrap, getPendingMutations } from '@/core/storage/database';
import { syncPendingMutations } from '@/core/sync/sync-engine';
import { withPendingMutations } from '@/domain/pending-snapshot';
import { useSession } from '@/features/auth/session-context';
import { bootstrapKey } from '@/features/bootstrap/use-bootstrap';
import type { CreateGoalInput, CreateRecordInput, CreateRelapseInput } from '@/domain/types';

const timezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
const localDate = () => new Intl.DateTimeFormat('en-CA', {
  year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());

export function useReviveMutations() {
  const { user } = useSession();
  const invalidate = () => user && queryClient.invalidateQueries({ queryKey: bootstrapKey(user.id) });

  const applyPendingMutation = async () => {
    if (!user) return;
    const key = bootstrapKey(user.id);
    const current = await getCachedBootstrap(user.id)
      || queryClient.getQueryData<import('@/domain/types').BootstrapData>(key);
    if (!current) return;
    queryClient.setQueryData(key, withPendingMutations(current, await getPendingMutations(user.id)));
  };

  const executeOrQueue = async (
    type: 'record.create' | 'relapse.create' | 'goal.create' | 'goal.complete',
    payload: Record<string, unknown>,
  ) => {
    if (!user) throw new Error('Sessão ausente.');
    const idempotencyKey = Crypto.randomUUID();
    const occurredAt = type === 'relapse.create' && typeof payload.occurred_at === 'string'
      ? payload.occurred_at
      : new Date().toISOString();
    // The durable local intent always exists before either the direct request
    // or any network-dependent synchronization work begins.
    await enqueueMutation(user.id, type, payload, occurredAt, idempotencyKey);
    await applyPendingMutation();
    const state = await NetInfo.fetch();
    if (!state.isConnected) return 'queued' as const;
    // Replaying from the queue keeps online and offline writes on the same
    // idempotency key and the same recovery path.
    await syncPendingMutations(user.id);
    await invalidate();
    const stillPending = (await getPendingMutations(user.id)).some(item => item.id === idempotencyKey);
    return stillPending ? 'queued' as const : 'synced' as const;
  };

  return {
    createRecord: (input: CreateRecordInput) => {
      const payload = { ...input, data_registro: input.data_registro || localDate(), timezone: input.timezone || timezone() };
      return executeOrQueue('record.create', payload);
    },
    createRelapse: (addictionId: string, input: CreateRelapseInput) => {
      const payload = { addictionId, ...input, occurred_at: input.occurred_at || new Date().toISOString(), timezone: input.timezone || timezone() };
      return executeOrQueue('relapse.create', payload);
    },
    createGoal: (input: CreateGoalInput) => executeOrQueue('goal.create', input),
    completeGoal: (goalId: string) => executeOrQueue('goal.complete', { goalId, concluida: true }),
  };
}
