import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { reviveApi } from '@/core/api/repositories';
import { ApiError } from '@/core/api/errors';
import { tokenStore } from '@/core/auth/token-store';
import { cacheUrgeEventPage, getCachedUrgeEventPage, getLocalUrgeEvents, getPendingMutations } from '@/core/storage/database';
import { withPendingMutations } from '@/domain/pending-snapshot';
import { dateInZone } from '@/domain/urge-time';
import type { BootstrapData, ListUrgeEventsInput, UrgeEventPage } from '@/domain/types';
import { useSession } from '@/features/auth/session-context';

export function useUrgeEvents(filter: Omit<ListUrgeEventsInput, 'cursor'>, enabled = true) {
  const { user } = useSession();
  const queryClient = useQueryClient();
  const query = useInfiniteQuery({
    queryKey: ['urges', user?.id, filter.vicio_id, filter.inicio, filter.fim, filter.timezone, filter.limit ?? 50],
    enabled: Boolean(user && filter.vicio_id && enabled), initialPageParam: null as string | null,
    retry: false,
    queryFn: async ({ pageParam }) => {
      if (!user) throw new Error('Sessão ausente.');
      const generation = tokenStore.getGeneration();
      const current = async () => tokenStore.isCurrent(generation) && (await tokenStore.getUser())?.id === user.id;
      if (!await current()) throw new Error('A sessão mudou.');
      const input = { vicio_id: filter.vicio_id, inicio: filter.inicio, fim: filter.fim, timezone: filter.timezone, limit: filter.limit ?? 50, cursor: pageParam };
      const key = JSON.stringify(input);
      let page: UrgeEventPage;
      let local = false;
      try {
        page = await reviveApi.listUrgeEvents(input);
        if (!await current()) throw new Error('A sessão mudou.');
        await cacheUrgeEventPage(user.id, key, page);
        await queryClient.invalidateQueries({ queryKey: ['urges', user.id, 'calendar-activity'] });
      } catch (error) {
        if (!await current()) throw new Error('A sessão mudou.');
        if (!(error instanceof ApiError) || !error.isRetryable) throw error;
        const cached = await getCachedUrgeEventPage(user.id, key);
        page = cached?.page || { vontades: await getLocalUrgeEvents(user.id), next_cursor: null,
          cobertura: { total: 0, retornados: 0, tem_mais: false }, atualizado_em: '' };
        local = true;
      }
      // Receipts are canonical local writes, not an inference from the bootstrap.
      const receipts = await getLocalUrgeEvents(user.id, true);
      const pending = await getPendingMutations(user.id);
      if (!await current()) throw new Error('A sessão mudou.');
      const snapshot = { usuario: user, vontades: [...page.vontades, ...receipts], registros: [], vicios: [], recaidas: [], metas: [], server_time: '', mensagem: null } as BootstrapData;
      const events = withPendingMutations(snapshot, pending).vontades?.filter(event => {
        if (event.usuario_id !== user.id || event.vicio_id !== filter.vicio_id) return false;
        const day = dateInZone(event.occurred_at, filter.timezone);
        return day >= filter.inicio && day <= filter.fim;
      }) || [];
      return { ...page, vontades: events, local };
    },
    getNextPageParam: page => page.next_cursor || undefined,
  });
  const events = [...new Map(query.data?.pages.flatMap(page => page.vontades).map(event => [event.id, event])).values()]
    .sort((a,b) => Date.parse(b.occurred_at) - Date.parse(a.occurred_at) || b.id.localeCompare(a.id));
  return { ...query, events, local: query.data?.pages.some(page => page.local) ?? false };
}
