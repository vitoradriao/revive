import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useBootstrap } from '@/features/bootstrap/use-bootstrap';
import { AppButton, Card, Field, PageTitle, Screen, textStyles } from '@/ui/components';
import { DateCalendar } from '@/ui/date-field';
import { displayDate } from '@/domain/formats';
import { dateInZone, deviceTimezone, validTimezone } from '@/domain/urge-time';
import { useRecords } from '@/features/diary/use-records';
import { RecordDetails } from '@/features/checkin/record-details';
import { useUrgeActivity } from '@/features/urges/use-urge-activity';
import { UrgeList } from '@/features/urges/urge-list';

const types = [{ value: 'all', label: 'Todos os tipos' }, { value: 'record', label: 'Check-ins' }, { value: 'urge', label: 'Vontades' }, { value: 'relapse', label: 'Recaídas' }] as const;
export default function CalendarScreen() {
  const router = useRouter();
  const { data } = useBootstrap();
  const urgeActivity = useUrgeActivity();
  const [timezone, setTimezone] = useState(deviceTimezone);
  const [zoneDraft, setZoneDraft] = useState(deviceTimezone);
  const [zoneError, setZoneError] = useState('');
  const [selected, setSelected] = useState(() => dateInZone(new Date(), deviceTimezone()));
  const [habitId, setHabitId] = useState('');
  const [kind, setKind] = useState<typeof types[number]['value']>('all');
  const dayQuery = useRecords({ inicio: selected, fim: selected, vicio_id: habitId || undefined });
  const records = [...new Map([...(data?.registros || []), ...dayQuery.records].map(record => [record.id, record])).values()].filter(record => !habitId || record.vicio_id === habitId);
  const relapses = (data?.recaidas || []).filter(event => !habitId || event.vicio_id === habitId);
  const habits = (data?.vicios || []).filter(habit => !habitId || habit.id === habitId);
  const label = (id: string) => {
    const habit = data?.vicios.find(item => item.id === id);
    return `${habit?.nome_vicio || 'Hábito'}${habit?.ativo === false ? ' · arquivado' : ''}`;
  };
  const activity = new Set(kind === 'all' || kind === 'record' ? records.map(record => record.data_registro) : []);
  if (kind === 'all' || kind === 'relapse') relapses.forEach(event => activity.add(dateInZone(event.data_recaida, timezone)));
  if (kind === 'all' || kind === 'urge') [...(urgeActivity.data || []), ...(data?.vontades || [])].filter(event => habits.some(habit => habit.id === event.vicio_id)).forEach(event => activity.add(dateInZone(event.occurred_at, timezone)));
  const selectedRecords = records.filter(record => record.data_registro === selected);
  const selectedRelapses = relapses.filter(event => dateInZone(event.data_recaida, timezone) === selected);
  const showRecords = kind === 'all' || kind === 'record';
  const showRelapses = kind === 'all' || kind === 'relapse';
  const showUrges = kind === 'all' || kind === 'urge';
  const applyZone = () => {
    if (!validTimezone(zoneDraft.trim())) return setZoneError('Informe um fuso IANA válido, como America/Sao_Paulo ou UTC.');
    setZoneError(''); setTimezone(zoneDraft.trim());
  };
  return <Screen>
    <AppButton title="Voltar" variant="secondary" onPress={() => router.back()} />
    <PageTitle title="Calendário" subtitle="Consulte check-ins, vontades e recaídas por dia." />
    <AppButton title="Consultar diário por período" variant="secondary" onPress={() => router.push('/(app)/records')} />
    <AppButton title="Consultar vontades por período" variant="secondary" onPress={() => router.push('/(app)/urges')} />
    <Card>
      <Text accessibilityRole="header" style={textStyles.heading}>Tipo de registro</Text>
      {types.map(type => <AppButton key={type.value} title={type.label} variant="secondary" accessibilityState={{ selected: kind === type.value }} onPress={() => setKind(type.value)} />)}
      <Text accessibilityRole="header" style={textStyles.heading}>Hábito</Text>
      <AppButton title="Todos os hábitos" variant="secondary" accessibilityState={{ selected: !habitId }} onPress={() => setHabitId('')} />
      {data?.vicios.map(habit => <AppButton key={habit.id} title={label(habit.id)} variant="secondary" accessibilityState={{ selected: habitId === habit.id }} onPress={() => setHabitId(habit.id)} />)}
      <Field label="Fuso do calendário" value={zoneDraft} onChangeText={setZoneDraft} autoCapitalize="none" maxLength={100} />
      <AppButton title="Usar fuso do aparelho" variant="secondary" onPress={() => setZoneDraft(deviceTimezone())} />
      <AppButton title="Usar UTC" variant="secondary" onPress={() => setZoneDraft('UTC')} />
      <AppButton title="Aplicar fuso" onPress={applyZone} />
      {zoneError ? <Text accessibilityLiveRegion="polite" style={textStyles.body}>{zoneError}</Text> : null}
      <Text style={textStyles.muted}>Fuso escolhido: {timezone}. Check-ins usam a data civil salva. Vontades e recaídas usam o fuso escolhido.</Text>
    </Card>
    <Card><DateCalendar selected={selected} onSelect={setSelected} maxDate={dateInZone(new Date(), timezone)} todayKey={dateInZone(new Date(), timezone)} activity={activity} /><Text style={textStyles.muted}>Os pontos indicam atividades já carregadas.</Text></Card>
    <Card>
      <Text accessibilityRole="header" style={textStyles.heading}>{displayDate(selected)}</Text>
      {showRecords && dayQuery.local ? <Text style={textStyles.muted}>Exibindo check-ins locais do dia; a cobertura pode estar incompleta.</Text> : null}
      {showRecords && dayQuery.isLoading ? <Text style={textStyles.muted}>Carregando check-ins do dia…</Text> : null}
      {showRecords && dayQuery.isError ? <><Text accessibilityLiveRegion="polite" style={textStyles.body}>Consulta de check-ins indisponível; exibindo dados locais.</Text><AppButton title="Tentar novamente: check-ins" onPress={() => void dayQuery.refetch()} /></> : null}
      {showRecords && dayQuery.hasNextPage ? <AppButton title="Carregar mais check-ins deste dia" onPress={() => void dayQuery.fetchNextPage()} loading={dayQuery.isFetchingNextPage} /> : null}
      {kind === 'record' && !dayQuery.isLoading && !dayQuery.isError && !selectedRecords.length ? <Text style={textStyles.muted}>Nenhum check-in disponível neste dia.</Text> : null}
      {kind === 'relapse' && !selectedRelapses.length ? <Text style={textStyles.muted}>Nenhuma recaída disponível neste dia.</Text> : null}
      {showRecords ? selectedRecords.map(record => <View key={record.id}><Text style={textStyles.muted}>{label(record.vicio_id)}</Text><RecordDetails record={record} /><AppButton title="Abrir e corrigir registro" variant="secondary" onPress={() => router.push({ pathname: '/(app)/records/[id]', params: { id: record.id } })} /></View>) : null}
      {showRelapses ? selectedRelapses.map(event => <View key={event.id}><Text style={textStyles.body}>Recaída registrada · {label(event.vicio_id)}</Text><Text style={textStyles.muted}>{event.motivo}{event.pending ? ' · Pendente' : ''}</Text></View>) : null}
    </Card>
    {showUrges ? habits.map(habit => <UrgeList key={habit.id} habit={habit} inicio={selected} fim={selected} timezone={timezone} showEmpty={kind === 'urge'} />) : null}
    {!habits.length ? <Text style={textStyles.muted}>Nenhum hábito disponível para esta consulta.</Text> : null}
  </Screen>;
}
