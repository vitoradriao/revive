import React, { useCallback } from 'react';
import { Text } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useBootstrap } from '@/features/bootstrap/use-bootstrap';
import { useSession } from '@/features/auth/session-context';
import { UrgeForm } from '@/features/urges/urge-form';
import { AppButton, EmptyState, LoadingState, PageTitle, Screen, textStyles } from '@/ui/components';

export default function NewUrgeScreen() {
  const { habitId } = useLocalSearchParams<{ habitId: string }>();
  const { user } = useSession();
  const query = useBootstrap();
  const router = useRouter();
  const refetch = query.refetch;
  useFocusEffect(useCallback(() => { void refetch(); }, [refetch]));
  const habit = query.data?.usuario.id === user?.id ? query.data?.vicios.find(item => item.id === habitId && item.usuario_id === user?.id) : undefined;
  return <Screen>
    <AppButton title="Voltar" variant="secondary" onPress={() => router.back()} />
    <PageTitle title="Registrar vontade" subtitle={habit?.nome_vicio} />
    {query.isLoading && !habit ? <LoadingState /> : null}
    {query.isError ? <><Text accessibilityLiveRegion="polite" style={textStyles.body}>Não foi possível atualizar o hábito. {habit ? 'Exibindo dados locais.' : ''}</Text><AppButton title="Tentar novamente" onPress={() => void refetch()} /></> : null}
    {habit && user ? <UrgeForm key={`${user.id}:${habit.id}`} habit={habit} /> : !query.isLoading ? <EmptyState title="Hábito indisponível" body="Volte à lista e selecione um hábito desta conta." /> : null}
  </Screen>;
}
