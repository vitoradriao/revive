import { useQuery } from '@tanstack/react-query';
import { getLocalUrgeEvents, getPendingMutations } from '@/core/storage/database';
import { tokenStore } from '@/core/auth/token-store';
import { withPendingMutations } from '@/domain/pending-snapshot';
import type { BootstrapData } from '@/domain/types';
import { useSession } from '@/features/auth/session-context';

export function useUrgeActivity() {
  const { user } = useSession();
  return useQuery({
    queryKey: ['urges', user?.id, 'calendar-activity'], enabled: Boolean(user), retry: false,
    queryFn: async () => {
      if (!user) throw new Error('Sessão ausente.');
      const generation = tokenStore.getGeneration();
      const [events, pending] = await Promise.all([getLocalUrgeEvents(user.id), getPendingMutations(user.id)]);
      if (!tokenStore.isCurrent(generation) || (await tokenStore.getUser())?.id !== user.id) throw new Error('A sessão mudou.');
      const snapshot = { usuario: user, vontades: events, registros: [], vicios: [], recaidas: [], metas: [], server_time: '', mensagem: null } as BootstrapData;
      return withPendingMutations(snapshot, pending).vontades || [];
    },
  });
}
