import React from 'react';
import { Text } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { reviveApi } from '@/core/api/repositories';
import { ApiError } from '@/core/api/errors';
import type { BootstrapData } from '@/domain/types';
import { withPendingMutations } from '@/domain/pending-snapshot';
import { resolveDiaryRecordId, cacheRecordPage, getPendingMutations, getCachedDiaryRecord } from '@/core/storage/database';
import { tokenStore } from '@/core/auth/token-store';
import { useSession } from '@/features/auth/session-context';
import { useBootstrap } from '@/features/bootstrap/use-bootstrap';
import { RecordEditor } from '@/features/diary/record-editor';
import { RecordDetails } from '@/features/checkin/record-details';
import { AppButton, LoadingState, PageTitle, Screen, textStyles } from '@/ui/components';

export default function RecordScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useSession();
  const { data } = useBootstrap();
  const router = useRouter();
  const cached = data?.usuario.id === user?.id ? data?.registros.find(r => r.id === id) : undefined;
  const query = useQuery({
    queryKey: ['diary', user?.id, 'record', id],
    enabled: Boolean(user) && !(cached?.pending && !cached.revision),
    retry: false,
    queryFn: async () => {
      const generation = tokenStore.getGeneration();
      if (!user || (await tokenStore.getUser())?.id !== user.id) throw new Error('A sessão mudou.');
      const resolvedId = await resolveDiaryRecordId(user.id, id);
      let result;
      let local = false;
      try { result = await reviveApi.getRecord(resolvedId); }
      catch (error) {
        if (!(error instanceof ApiError) || !error.isRetryable) throw error;
        const record = await getCachedDiaryRecord(user.id, resolvedId);
        if (!record) throw error;
        result = { registro: record }; local = true;
      }
      if (!tokenStore.isCurrent(generation) || (await tokenStore.getUser())?.id !== user.id) throw new Error('A sessão mudou.');
      if (!local) await cacheRecordPage(user.id, `record:${id}`, { registros: [result.registro], next_cursor: null });
      const pending = await getPendingMutations(user.id);
      if (!tokenStore.isCurrent(generation)) throw new Error('A sessão mudou.');
      const snapshot = { usuario: user, registros: [result.registro], vicios: [], recaidas: [], metas: [], server_time: '', mensagem: null } as BootstrapData;
      return { record: withPendingMutations(snapshot, pending).registros.find(r => r.id === resolvedId)!, local };
    },
  });
  const record = cached?.pending ? cached : query.data?.record || cached;
  const habit = data?.vicios.find(h => h.id === record?.vicio_id);
  return <Screen>
    <AppButton title="Voltar" variant="secondary" onPress={() => router.back()} />
    <PageTitle title="Registro do diário" subtitle={`${habit?.nome_vicio || 'Hábito'}${habit?.ativo === false ? ' · arquivado' : ''}`} />
    {query.isLoading && !record ? <LoadingState /> : null}
    {query.data?.local ? <Text style={textStyles.muted}>Exibindo cópia local; consulte a versão remota ao reconectar.</Text> : null}
    {query.isError ? <><Text accessibilityLiveRegion="polite" style={textStyles.muted}>{query.error.message}{record ? ' · Exibindo cópia local.' : ''}</Text><AppButton title="Tentar novamente" onPress={() => void query.refetch()} /></> : null}
    {record ? <><RecordDetails record={record} /><RecordEditor key={`${user?.id}:${record.id}`} record={record} /></> : !query.isLoading && !query.isError ? <Text style={textStyles.body}>Registro não encontrado.</Text> : null}
  </Screen>;
}
