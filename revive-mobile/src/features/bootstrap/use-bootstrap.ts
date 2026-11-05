import { useEffect } from 'react';
import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { useQuery } from '@tanstack/react-query';
import { reviveApi } from '@/core/api/repositories';
import { queryClient } from '@/core/query/client';
import { cacheBootstrap, getCachedBootstrap, getPendingMutations } from '@/core/storage/database';
import { withPendingMutations } from '@/domain/pending-snapshot';
import { syncPendingMutations } from '@/core/sync/sync-engine';
import { useSession } from '@/features/auth/session-context';
import type { BootstrapData } from '@/domain/types';

export const bootstrapKey = (userId: string) => ['bootstrap', userId] as const;

// Many screens read the bootstrap at once (tabs stay mounted). A single shared
// pair of listeners refreshes the active bootstrap query when the connection or
// the app comes back, instead of one pair per screen racing each other.
let lifecycleUsers = 0;
let stopLifecycle: (() => void) | null = null;

export const refreshActiveBootstrap = () => queryClient.refetchQueries(
  { queryKey: ['bootstrap'], type: 'active' },
  // Join a fetch already in flight instead of cancelling and restarting it.
  { cancelRefetch: false },
);

export function retainBootstrapLifecycle() {
  if (lifecycleUsers++ === 0) {
    const unsubscribeNetwork = NetInfo.addEventListener((state) => {
      if (state.isConnected) void refreshActiveBootstrap();
    });
    const foreground = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refreshActiveBootstrap();
    });
    stopLifecycle = () => {
      unsubscribeNetwork();
      foreground.remove();
    };
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--lifecycleUsers === 0) {
      stopLifecycle?.();
      stopLifecycle = null;
    }
  };
}

export function useBootstrap() {
  const { user } = useSession();
  const query = useQuery({
    queryKey: bootstrapKey(user?.id || 'anonymous'),
    enabled: Boolean(user),
    queryFn: async (): Promise<BootstrapData> => {
      if (!user) throw new Error('Sessão ausente.');
      try {
        const synced = await syncPendingMutations(user.id);
        if (synced) await queryClient.invalidateQueries({ queryKey: ['urges', user.id] });
        const data = await reviveApi.bootstrap();
        await cacheBootstrap(user.id, data);
        return withPendingMutations(data, await getPendingMutations(user.id));
      } catch (error) {
        const cached = await getCachedBootstrap(user.id);
        if (cached) return { ...withPendingMutations(cached, await getPendingMutations(user.id)), from_cache: true };
        throw error;
      }
    },
  });

  useEffect(() => (user ? retainBootstrapLifecycle() : undefined), [user]);

  return query as typeof query & { data?: BootstrapData };
}
