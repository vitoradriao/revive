import React, { useState } from 'react';
import { Text } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useBootstrap } from '@/features/bootstrap/use-bootstrap';
import { useRecords } from '@/features/diary/use-records';
import { AppButton, Card, LoadingState, PageTitle, Screen, textStyles } from '@/ui/components';
import { DateField } from '@/ui/date-field';
import { displayDate, localDateKey, parseDate } from '@/domain/formats';
import { RecordDetails } from '@/features/checkin/record-details';

export default function DiaryScreen() {
  const router = useRouter();
  const { habitId } = useLocalSearchParams<{ habitId?: string }>();
  const { data } = useBootstrap();
  const [habit, setHabit] = useState(habitId || '');
  const earliest = data?.registros.reduce((date, record) => record.data_registro < date ? record.data_registro : date, localDateKey()) || localDateKey();
  const [start, setStart] = useState(displayDate(earliest));
  const [end, setEnd] = useState(displayDate(localDateKey()));
  const [filter, setFilter] = useState({ vicio_id: habitId, inicio: earliest, fim: localDateKey() });
  const [error, setError] = useState('');
  const query = useRecords(filter);
  const apply = () => {
    const inicio = parseDate(start), fim = parseDate(end);
    if (!inicio || !fim || inicio > fim || (new Date(fim).getTime() - new Date(inicio).getTime()) / 86400000 > 3660) return setError('Informe um intervalo válido de até 10 anos.');
    setError(''); setFilter({ vicio_id: habit || undefined, inicio, fim });
  };
  return <Screen>
    <AppButton title="Voltar" variant="secondary" onPress={() => router.back()} />
    <PageTitle title="Diário" subtitle="Consulte e corrija seus registros completos." />
    <Card>
      <Text accessibilityRole="header" style={textStyles.heading}>Filtrar por hábito</Text>
      <AppButton title={`${!habit ? 'Selecionado: ' : ''}Todos os hábitos`} variant="secondary" onPress={() => setHabit('')} />
      {data?.vicios.map(h => <AppButton key={h.id} title={`${habit === h.id ? 'Selecionado: ' : ''}${h.nome_vicio}${h.ativo === false ? ' · arquivado' : ''}`} variant="secondary" onPress={() => setHabit(h.id)} />)}
      <DateField label="Início" value={start} onChangeText={setStart} />
      <DateField label="Fim" value={end} onChangeText={setEnd} />
      <AppButton title="Aplicar filtros" onPress={apply} />
      {error ? <Text accessibilityLiveRegion="polite" style={textStyles.body}>{error}</Text> : null}
    </Card>
    {query.local ? <Text style={textStyles.muted}>Sem consulta remota: exibindo apenas os registros disponiveis no aparelho.</Text> : null}
    {query.isLoading ? <LoadingState /> : null}
    {query.isError ? <><Text accessibilityLiveRegion="polite" style={textStyles.body}>Não foi possível carregar o diário. Os registros já carregados continuam abaixo.</Text><AppButton title="Tentar novamente" onPress={() => void query.refetch()} /></> : null}
    {!query.isLoading && !query.isError && !query.records.length ? <Text style={textStyles.muted}>Nenhum registro neste intervalo.</Text> : null}
    {query.records.map(r => <Card key={r.id}>
      <Text style={textStyles.heading}>{data?.vicios.find(h => h.id === r.vicio_id)?.nome_vicio || 'Hábito'}</Text>
      <RecordDetails record={r} />
      <AppButton title={`Abrir registro de ${displayDate(r.data_registro)}`} onPress={() => router.push({ pathname: '/(app)/records/[id]', params: { id: r.id } })} />
    </Card>)}
    {query.hasNextPage ? <AppButton title="Carregar mais registros" loading={query.isFetchingNextPage} onPress={() => void query.fetchNextPage()} /> : null}
  </Screen>;
}
