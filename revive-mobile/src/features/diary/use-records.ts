import { useInfiniteQuery } from '@tanstack/react-query';
import { reviveApi } from '@/core/api/repositories';
import { ApiError } from '@/core/api/errors';
import { tokenStore } from '@/core/auth/token-store';
import { cacheRecordPage, getCachedRecordPage, getCachedBootstrap, getPendingMutations } from '@/core/storage/database';
import { useSession } from '@/features/auth/session-context';
import type { RecordFilter, BootstrapData } from '@/domain/types';
import { withPendingMutations } from '@/domain/pending-snapshot';

export function useRecords(filter: RecordFilter) {
  const { user } = useSession();
  const query = useInfiniteQuery({
    queryKey: ['diary', user?.id, filter.vicio_id || '', filter.inicio, filter.fim, filter.limit ?? 50],
    enabled: Boolean(user), initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      if (!user) throw new Error('Sessão ausente.');
      const generation = tokenStore.getGeneration();
      const current = async () => tokenStore.isCurrent(generation) && (await tokenStore.getUser())?.id === user.id;
      if (!await current()) throw new Error('A sessão mudou.');
      const input = { vicio_id: filter.vicio_id || undefined, inicio: filter.inicio, fim: filter.fim, limit: filter.limit ?? 50, cursor: pageParam };
      const key = JSON.stringify(input);
      let page;
      let local = false;
      try {
        page = await reviveApi.listRecords(input);
        if (!await current()) throw new Error('A sessão mudou.');
        await cacheRecordPage(user.id, key, page);
      } catch (error) {
        if (!await current()) throw new Error('A sessão mudou.');
        if (!(error instanceof ApiError) || !error.isRetryable) throw error;
        page = await getCachedRecordPage(user.id, key);
        if (!page && !pageParam) {
          const snapshot = await getCachedBootstrap(user.id);
          if (snapshot) page = { registros: snapshot.registros.filter(r => (!filter.vicio_id || r.vicio_id === filter.vicio_id) && r.data_registro >= filter.inicio && r.data_registro <= filter.fim), next_cursor: null };
        }
        if (!page) throw error;
        local = true;
      }
      const pending = await getPendingMutations(user.id);
      if (!await current()) throw new Error('A sessão mudou.');
      const snapshot = { usuario: user, registros: page.registros, vicios: [], recaidas: [], metas: [], server_time: '', mensagem: null } as BootstrapData;
      return { ...page, local, registros: withPendingMutations(snapshot, pending).registros.filter(r => (!filter.vicio_id || r.vicio_id === filter.vicio_id) && r.data_registro >= filter.inicio && r.data_registro <= filter.fim) };
    },
    getNextPageParam: page => page.next_cursor || undefined,
    retry: false,
  });
  const records = [...new Map(query.data?.pages.flatMap(p => p.registros).map(r => [r.id, r])).values()].sort((a, b) => b.data_registro.localeCompare(a.data_registro) || b.id.localeCompare(a.id));
  return { ...query, records, local: query.data?.pages.some(page => page.local) ?? false };
}
