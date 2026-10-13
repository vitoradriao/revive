import React, { useState } from 'react';
import { Text } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useBootstrap } from '@/features/bootstrap/use-bootstrap';
import { UrgeList } from '@/features/urges/urge-list';
import { deviceTimezone, dateInZone, validTimezone } from '@/domain/urge-time';
import { displayDate, parseDate } from '@/domain/formats';
import { AppButton, Card, Field, PageTitle, Screen, textStyles } from '@/ui/components';
import { DateField } from '@/ui/date-field';

export default function UrgeHistoryScreen() {
  const router = useRouter();
  const { habitId } = useLocalSearchParams<{ habitId?: string }>();
  const { data } = useBootstrap();
  const [habit, setHabit] = useState(habitId || '');
  const [timezone, setTimezone] = useState(deviceTimezone);
  const [start, setStart] = useState(() => displayDate(dateInZone(new Date(Date.now() - 30 * 86400000), deviceTimezone())));
  const [end, setEnd] = useState(() => displayDate(dateInZone(new Date(), deviceTimezone())));
  const [filter, setFilter] = useState(() => ({ habit: habitId || '', inicio: parseDate(start)!, fim: parseDate(end)!, timezone: deviceTimezone() }));
  const [error, setError] = useState('');
  const selectedHabit = data?.vicios.find(item => item.id === (filter.habit || data.vicios[0]?.id));
  const apply = () => {
    const inicio = parseDate(start), fim = parseDate(end);
    if (!validTimezone(timezone.trim())) return setError('Informe um fuso IANA válido, como America/Sao_Paulo ou UTC.');
    if (!inicio || !fim || inicio > fim || (Date.parse(fim) - Date.parse(inicio)) / 86400000 > 3660) return setError('Informe um intervalo válido de até dez anos.');
    setError(''); setFilter({ habit: habit || data?.vicios[0]?.id || '', inicio, fim, timezone: timezone.trim() });
  };
  return <Screen>
    <AppButton title="Voltar" variant="secondary" onPress={() => router.back()} />
    <PageTitle title="Histórico de vontades" subtitle="Registro descritivo. Uma vontade não é uma recaída." />
    <Card>
      <Text accessibilityRole="header" style={textStyles.heading}>Hábito</Text>
      {data?.vicios.map(item => <AppButton key={item.id} title={`${item.nome_vicio}${item.ativo === false ? ' · arquivado' : ''}`} variant="secondary" accessibilityState={{ selected: item.id === (habit || data.vicios[0]?.id) }} onPress={() => setHabit(item.id)} />)}
      <DateField label="Início" value={start} onChangeText={setStart} maxDate={dateInZone(new Date(), filter.timezone)} todayKey={dateInZone(new Date(), filter.timezone)} />
      <DateField label="Fim" value={end} onChangeText={setEnd} maxDate={dateInZone(new Date(), filter.timezone)} todayKey={dateInZone(new Date(), filter.timezone)} />
      <Field label="Fuso da consulta" value={timezone} onChangeText={setTimezone} autoCapitalize="none" maxLength={100} hint="Datas do período usam este fuso IANA." />
      <AppButton title="Usar fuso do aparelho" variant="secondary" onPress={() => setTimezone(deviceTimezone())} />
      <AppButton title="Usar UTC" variant="secondary" onPress={() => setTimezone('UTC')} />
      <AppButton title="Aplicar filtros" onPress={apply} />
      {error ? <Text accessibilityLiveRegion="polite" style={textStyles.body}>{error}</Text> : null}
    </Card>
    {selectedHabit ? <>
      <Text style={textStyles.heading}>{selectedHabit.nome_vicio}{selectedHabit.ativo === false ? ' · arquivado' : ''}</Text>
      <Text style={textStyles.muted}>{displayDate(filter.inicio)} a {displayDate(filter.fim)} · {filter.timezone}</Text>
      {selectedHabit.ativo !== false ? <AppButton title="Registrar vontade" onPress={() => router.push({ pathname: '/(app)/urges/new', params: { habitId: selectedHabit.id } })} /> : null}
      <UrgeList key={selectedHabit.id} habit={selectedHabit} inicio={filter.inicio} fim={filter.fim} timezone={filter.timezone} />
    </> : <Text style={textStyles.body}>Selecione um hábito disponível nesta conta para consultar o histórico.</Text>}
  </Screen>;
}
