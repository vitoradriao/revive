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

export function useBootstrap() {
  const { user } = useSession();
  const query = useQuery({
    queryKey: bootstrapKey(user?.id || 'anonymous'),
    enabled: Boolean(user),
    queryFn: async () => {
      if (!user) throw new Error('Sessão ausente.');
      try {
        const synced = await syncPendingMutations(user.id);
        if (synced) await queryClient.invalidateQueries({ queryKey: ['urges', user.id] });
        const data = await reviveApi.bootstrap();
        await cacheBootstrap(user.id, data);
        return withPendingMutations(data, await getPendingMutations(user.id));
      } catch (error) {
        const cached = await getCachedBootstrap(user.id);
        if (cached) return withPendingMutations(cached, await getPendingMutations(user.id));
        throw error;
      }
    },
  });
  const refetch = query.refetch;

  useEffect(() => {
    if (!user) return;
    const unsubscribeNetwork = NetInfo.addEventListener((state) => {
      if (state.isConnected) void refetch();
    });
    const foreground = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refetch();
    });
    return () => {
      unsubscribeNetwork();
      foreground.remove();
    };
  }, [refetch, user]);

  return query as typeof query & { data?: BootstrapData };
}
