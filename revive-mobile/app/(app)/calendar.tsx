import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useBootstrap } from '@/features/bootstrap/use-bootstrap';
import { AppButton, Card, PageTitle, Screen, textStyles } from '@/ui/components';
import { DateCalendar } from '@/ui/date-field';
import { localDateKey as dateKey, displayDate } from '@/domain/formats';
import { useRecords } from '@/features/diary/use-records';
import { RecordDetails } from '@/features/checkin/record-details';

export default function CalendarScreen() {
  const router = useRouter();
  const { data } = useBootstrap();
  const [selected, setSelected] = useState(() => dateKey(new Date()));
  const dayQuery = useRecords({ inicio: selected, fim: selected });
  const records = [...new Map([...(data?.registros || []), ...dayQuery.records].map(r => [r.id, r])).values()];
  const relapses = data?.recaidas || [];
  const habitLabel = (id: string) => {
    const habit = data?.vicios.find(item => item.id === id);
    return `${habit?.nome_vicio || 'Hábito'}${habit?.ativo === false ? ' · arquivado' : ''}`;
  };
  const activity = new Set(records.map((record) => record.data_registro));
  relapses.forEach((relapse) => activity.add(dateKey(new Date(relapse.data_recaida))));
  const selectedRecords = records.filter((record) => record.data_registro === selected);
  const selectedRelapses = relapses.filter((relapse) => dateKey(new Date(relapse.data_recaida)) === selected);
  return <Screen>
    <AppButton title="Voltar" variant="secondary" onPress={() => router.back()} />
    <PageTitle title="Calendário" subtitle="Selecione um dia para consultar seus registros." />
    <Card><DateCalendar selected={selected} onSelect={setSelected} activity={activity} /><Text style={textStyles.muted}>Os pontos indicam dias com registros.</Text></Card>
    <Card>
      <Text style={textStyles.heading}>{displayDate(selected)}</Text>
      {dayQuery.local ? <Text style={textStyles.muted}>Exibindo registros locais do dia; a cobertura pode estar incompleta.</Text> : null}
      {dayQuery.isLoading ? <Text style={textStyles.muted}>Carregando registros do dia…</Text> : null}
      {dayQuery.isError ? <><Text accessibilityLiveRegion="polite" style={textStyles.body}>Consulta indisponível; exibindo registros locais.</Text><AppButton title="Tentar novamente" onPress={() => void dayQuery.refetch()} /></> : null}
      {dayQuery.hasNextPage ? <AppButton title="Carregar mais registros deste dia" onPress={() => void dayQuery.fetchNextPage()} loading={dayQuery.isFetchingNextPage} /> : null}
      {!dayQuery.isLoading && !dayQuery.isError && !selectedRecords.length && !selectedRelapses.length ? <Text style={textStyles.muted}>Nenhuma atividade registrada neste dia.</Text> : null}
      {selectedRecords.map((record) => <View key={record.id}><Text style={textStyles.muted}>{habitLabel(record.vicio_id)}</Text><RecordDetails record={record} /><AppButton title="Abrir e corrigir registro" variant="secondary" onPress={() => router.push({ pathname: '/(app)/records/[id]', params: { id: record.id } })} /></View>)}
      {selectedRelapses.map((relapse) => <View key={relapse.id}><Text style={textStyles.body}>Recaída registrada · {habitLabel(relapse.vicio_id)}</Text><Text style={textStyles.muted}>{relapse.motivo}{relapse.pending ? ' · Pendente' : ''}</Text></View>)}
    </Card>
  </Screen>;
}
