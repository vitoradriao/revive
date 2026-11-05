import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useBootstrap } from '@/features/bootstrap/use-bootstrap';
import { AppButton, Card, Field, Screen, textStyles } from '@/ui/components';
import { BackHeader, Disclosure, EditorialTitle, editorialStyles, Flourish, SectionTabs } from '@/ui/editorial';
import { DateCalendar } from '@/ui/date-field';
import { dateFromKey, localDateKey } from '@/domain/formats';
import { dateInZone, deviceTimezone, validTimezone } from '@/domain/urge-time';
import { useRecords } from '@/features/diary/use-records';
import { RecordTimeline } from '@/features/diary/record-timeline';
import { useUrgeActivity } from '@/features/urges/use-urge-activity';
import { UrgeList } from '@/features/urges/urge-list';
import { useLocalDay } from '@/features/checkin/use-local-day';
import { colors } from '@/ui/theme';

const types = [{ value: 'all', label: 'Todos os tipos' }, { value: 'record', label: 'Check-ins' }, { value: 'urge', label: 'Vontades' }, { value: 'relapse', label: 'Recaídas' }] as const;
const monthOf = (day: string) => {
  const date = dateFromKey(day), year = date.getFullYear(), month = date.getMonth();
  return { inicio: localDateKey(new Date(year, month, 1, 12)), fim: localDateKey(new Date(year, month + 1, 0, 12)) };
};

export default function CalendarScreen() {
  const router = useRouter();
  const { data } = useBootstrap();
  const urgeActivity = useUrgeActivity();
  const [timezone, setTimezone] = useState(deviceTimezone);
  const [zoneDraft, setZoneDraft] = useState(deviceTimezone);
  const [zoneError, setZoneError] = useState('');
  const today = useLocalDay(timezone);
  const [selected, setSelected] = useState(() => dateInZone(new Date(), deviceTimezone()));
  const [month, setMonth] = useState(() => monthOf(selected));
  const [habitId, setHabitId] = useState('');
  const [kind, setKind] = useState<typeof types[number]['value']>('all');
  const onMonthChange = useCallback((range: { inicio: string; fim: string }) => setMonth(previous => previous.inicio === range.inicio && previous.fim === range.fim ? previous : range), []);
  const visibleMonth = month.inicio > today ? monthOf(today) : month;
  const monthQuery = useRecords({ ...visibleMonth, fim: visibleMonth.fim > today ? today : visibleMonth.fim, vicio_id: habitId || undefined });
  const dayQuery = useRecords({ inicio: selected, fim: selected, vicio_id: habitId || undefined });
  const records = [...new Map([...(data?.registros || []), ...monthQuery.records, ...dayQuery.records].map(record => [record.id, record])).values()].filter(record => !habitId || record.vicio_id === habitId);
  const relapses = (data?.recaidas || []).filter(event => !habitId || event.vicio_id === habitId);
  const habits = (data?.vicios || []).filter(habit => !habitId || habit.id === habitId);
  const label = (id: string) => {
    const habit = data?.vicios.find(item => item.id === id);
    return `${habit?.nome_vicio || 'Hábito'}${habit?.ativo === false ? ' · arquivado' : ''}`;
  };
  const activity = new Set(kind === 'all' || kind === 'record' ? records.map(record => record.data_registro) : []);
  const urgeDays = [...(urgeActivity.data || []), ...(data?.vontades || [])].filter(event => habits.some(habit => habit.id === event.vicio_id)).map(event => dateInZone(event.occurred_at, timezone));
  if (kind === 'all' || kind === 'relapse') relapses.forEach(event => activity.add(dateInZone(event.data_recaida, timezone)));
  if (kind === 'all' || kind === 'urge') urgeDays.forEach(day => activity.add(day));
  const selectedRecords = records.filter(record => record.data_registro === selected).sort((a, b) => b.id.localeCompare(a.id));
  const selectedRelapses = relapses.filter(event => dateInZone(event.data_recaida, timezone) === selected);
  const showRecords = kind === 'all' || kind === 'record';
  const showRelapses = kind === 'all' || kind === 'relapse';
  const showUrges = kind === 'all' || kind === 'urge';
  const hasLoadedActivity = (showRecords && selectedRecords.length > 0) || (showRelapses && selectedRelapses.length > 0) || (showUrges && urgeDays.includes(selected));
  const applyZone = () => {
    const zone = zoneDraft.trim();
    if (!validTimezone(zone)) return setZoneError('Informe um fuso IANA válido, como America/Sao_Paulo ou UTC.');
    setZoneError(''); setTimezone(zone);
    const nextToday = dateInZone(new Date(), zone);
    if (selected > nextToday) setSelected(nextToday);
  };
  return <Screen>
    <BackHeader section="Calendário" onBack={() => router.back()} />
    <EditorialTitle title="Cada dia tem" emphasis="uma história." />
    <Text style={textStyles.muted}>Toque em um dia para ver seus registros.</Text>
    <Card style={{ borderWidth: 0, padding: 12 }}><DateCalendar key={timezone} selected={selected} onSelect={setSelected} maxDate={today} todayKey={today} activity={activity} onMonthChange={onMonthChange} /></Card>
    <View style={styles.legend}><View style={styles.dot} /><Text style={[textStyles.muted, { flex: 1, fontSize: 12 }]}>Os pontos indicam dias com atividades já carregadas.</Text></View>
    {monthQuery.hasNextPage ? <AppButton title="Carregar mais check-ins do mês" variant="secondary" onPress={() => void monthQuery.fetchNextPage()} loading={monthQuery.isFetchingNextPage} /> : null}
    {monthQuery.isError ? <Text style={textStyles.muted}>Os pontos podem estar incompletos. Toque em um dia para consultar seus registros.</Text> : null}
    <Card style={{ backgroundColor: colors.lavender, borderWidth: 0, gap: 12 }}>
      <View style={editorialStyles.row}><Text accessibilityRole="header" style={[textStyles.heading, { flex: 1, fontSize: 20 }]}>{dateFromKey(selected).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' })}</Text>{selected === today ? <View style={editorialStyles.pill}><Text style={styles.badge}>HOJE</Text></View> : null}</View>
      <Text style={textStyles.body}>{hasLoadedActivity ? 'Sua história deste dia está logo abaixo.' : showRecords && dayQuery.isLoading ? 'Consultando os registros deste dia…' : 'Nenhuma atividade carregada neste dia.'}</Text>
    </Card>
    {showRecords && dayQuery.local ? <Text style={textStyles.muted}>Exibindo check-ins locais do dia; a cobertura pode estar incompleta.</Text> : null}
    {showRecords && dayQuery.isError ? <><Text accessibilityLiveRegion="polite" style={textStyles.body}>Consulta de check-ins indisponível; exibindo dados locais.</Text><AppButton title="Tentar novamente: check-ins" onPress={() => void dayQuery.refetch()} /></> : null}
    {showRecords && selectedRecords.length ? <RecordTimeline records={selectedRecords} habitLabel={label} onOpen={record => router.push({ pathname: '/(app)/records/[id]', params: { id: record.id } })} /> : null}
    {showRecords && dayQuery.hasNextPage ? <AppButton title="Carregar mais check-ins deste dia" onPress={() => void dayQuery.fetchNextPage()} loading={dayQuery.isFetchingNextPage} /> : null}
    {showRelapses ? selectedRelapses.map(event => <Card key={event.id} style={{ backgroundColor: colors.peach, borderWidth: 0 }}><Text style={textStyles.body}>Recaída registrada · {label(event.vicio_id)}</Text><Text style={textStyles.body}>{event.motivo || 'Sem reflexão adicionada.'}{event.pending ? ' · Pendente de sincronização' : ''}</Text></Card>) : null}
    {showUrges ? habits.map(habit => <UrgeList key={habit.id} habit={habit} inicio={selected} fim={selected} timezone={timezone} showEmpty={kind === 'urge'} />) : null}
    <Disclosure title="Filtros e fuso">
      <Text accessibilityRole="header" style={textStyles.heading}>Tipo de registro</Text>
      <SectionTabs tabs={types} selected={kind} onSelect={setKind} variant="pill" />
      <Text accessibilityRole="header" style={textStyles.heading}>Hábito</Text>
      <AppButton title="Todos os hábitos" variant="secondary" accessibilityState={{ selected: !habitId }} onPress={() => setHabitId('')} />
      {data?.vicios.map(habit => <AppButton key={habit.id} title={label(habit.id)} variant="secondary" accessibilityState={{ selected: habitId === habit.id }} onPress={() => setHabitId(habit.id)} />)}
      <Field label="Fuso do calendário" value={zoneDraft} onChangeText={setZoneDraft} autoCapitalize="none" maxLength={100} error={zoneError} />
      <AppButton title="Usar fuso do aparelho" variant="secondary" onPress={() => setZoneDraft(deviceTimezone())} />
      <AppButton title="Usar UTC" variant="secondary" onPress={() => setZoneDraft('UTC')} />
      <AppButton title="Aplicar fuso" onPress={applyZone} />
      <Text style={textStyles.muted}>Fuso escolhido: {timezone}. Check-ins usam a data civil salva. Vontades e recaídas usam o fuso escolhido.</Text>
    </Disclosure>
    <AppButton title="Consultar diário por período" variant="secondary" onPress={() => router.push('/(app)/records')} />
    <AppButton title="Consultar vontades por período" variant="secondary" onPress={() => router.push('/(app)/urges')} />
    {!habits.length ? <Text style={textStyles.muted}>Nenhum hábito disponível para esta consulta.</Text> : null}
    <Text style={styles.footer}>Sua jornada cabe em muitos dias.</Text><View style={{ alignItems: 'center' }}><Flourish /></View>
  </Screen>;
}

const styles = StyleSheet.create({
  legend: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.primary },
  badge: { ...editorialStyles.eyebrow, color: colors.text, fontSize: 9, letterSpacing: 0.3 },
  footer: { ...editorialStyles.note, fontSize: 17, textAlign: 'center', marginTop: 8 },
});
