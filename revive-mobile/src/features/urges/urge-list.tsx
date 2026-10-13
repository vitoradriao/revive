import React from 'react';
import { Text } from 'react-native';
import { useRouter } from 'expo-router';
import type { Addiction } from '@/domain/types';
import { AppButton, Card, LoadingState, textStyles } from '@/ui/components';
import { useUrgeEvents } from './use-urge-events';
import { UrgeDetails } from './urge-details';

export function UrgeList({ habit, inicio, fim, timezone, showEmpty = true }: { habit: Addiction; inicio: string; fim: string; timezone: string; showEmpty?: boolean }) {
  const query = useUrgeEvents({ vicio_id: habit.id, inicio, fim, timezone });
  const router = useRouter();
  const label = `${habit.nome_vicio}${habit.ativo === false ? ' · arquivado' : ''}`;
  return <>
    {query.isLoading ? <LoadingState label={`Carregando vontades de ${label}…`} /> : null}
    {query.isError ? <Card><Text accessibilityLiveRegion="polite" style={textStyles.body}>Não foi possível consultar vontades de {label}. Os eventos já carregados continuam disponíveis.</Text><AppButton title={`Tentar novamente: ${label}`} onPress={() => void query.refetch()} /></Card> : null}
    {query.local ? <Text style={textStyles.muted}>Vontades de {label}: exibindo apenas dados disponíveis no aparelho. A consulta pode estar incompleta.</Text> : null}
    {!query.isLoading && !query.isError && showEmpty && !query.events.length ? <Text style={textStyles.muted}>{label}: {query.local ? 'nenhuma vontade disponível no aparelho neste intervalo.' : 'nenhuma vontade registrada neste intervalo.'}</Text> : null}
    {query.events.map(event => <Card key={event.id}><Text style={textStyles.body}>{label}</Text><UrgeDetails event={event} timezone={timezone} />{event.sync_error ? <AppButton title="Resolver envio pendente" variant="secondary" onPress={() => router.push('/(app)/sync')} /> : null}</Card>)}
    {query.hasNextPage ? <AppButton title={`Carregar mais vontades de ${label}`} loading={query.isFetchingNextPage} onPress={() => void query.fetchNextPage()} /> : null}
  </>;
}
