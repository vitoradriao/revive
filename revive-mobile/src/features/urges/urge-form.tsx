import React, { useEffect, useRef, useState } from 'react';
import { AppState, Pressable, Text, View } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { useRouter } from 'expo-router';
import { queryClient } from '@/core/query/client';
import { getUrgeReceipt, getPendingMutations } from '@/core/storage/database';
import { tokenStore } from '@/core/auth/token-store';
import { useSession } from '@/features/auth/session-context';
import { useReviveMutations, type MutationReceipt } from '@/features/mutations/use-revive-mutations';
import type { Addiction } from '@/domain/types';
import { displayDate, parseDate } from '@/domain/formats';
import { civilTimeToInstant, dateTimeInZone, deviceTimezone } from '@/domain/urge-time';
import { URGE_TRIGGER_CATALOG } from '@/domain/urge-triggers';
import { AppButton, Card, Field, textStyles } from '@/ui/components';
import { DateField } from '@/ui/date-field';
import { colors, radius, spacing } from '@/ui/theme';
import { urgeSchema } from './urge-schema';

const momentNow = () => {
  const instant = new Date().toISOString(), timezone = deviceTimezone();
  return { instant, timezone, ...dateTimeInZone(instant, timezone) };
};
export function UrgeForm({ habit }: { habit: Addiction }) {
  const { user } = useSession();
  const mutations = useReviveMutations();
  const router = useRouter();
  const [initial, setInitial] = useState(momentNow);
  const [date, setDate] = useState(() => displayDate(initial.date));
  const [time, setTime] = useState(initial.time);
  const [intensity, setIntensity] = useState('');
  const [triggers, setTriggers] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [action, setAction] = useState('');
  const [result, setResult] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<(MutationReceipt & { removed?: boolean }) | null>(null);
  const inFlight = useRef(false);
  const disabled = busy || Boolean(receipt) || habit.ativo === false;
  useEffect(() => {
    if (!user || !receipt || receipt.status === 'synced') return;
    let active = true;
    const generation = tokenStore.getGeneration();
    const refresh = async () => {
      const pending = await getPendingMutations(user.id);
      if (!active || !tokenStore.isCurrent(generation)) return;
      const item = pending.find(m => m.id === receipt.id);
      const confirmed = item ? null : await getUrgeReceipt(user.id, receipt.id);
      if (!active || !tokenStore.isCurrent(generation)) return;
      const status = item?.status === 'failed' ? 'failed' : item ? 'queued' : confirmed ? 'synced' : 'failed';
      const removed = !item && !confirmed;
      setReceipt(current => current?.id === receipt.id && (current.status !== status || Boolean(current.removed) !== removed) ? { ...current, status, removed } : current);
    };
    const foreground = AppState.addEventListener('change', state => { if (state === 'active') void refresh().catch(() => {}); });
    const network = NetInfo.addEventListener(state => { if (state.isConnected) void refresh().catch(() => {}); });
    const cache = queryClient.getQueryCache().subscribe(event => { if (event.query.queryKey[0] === 'bootstrap' && event.query.queryKey[1] === user.id) void refresh().catch(() => {}); });
    return () => { active = false; foreground.remove(); network(); cache(); };
  }, [receipt, user]);
  const save = async () => {
    if (disabled || inFlight.current) return;
    const day = parseDate(date);
    const instant = day === initial.date && time === initial.time ? initial.instant : day ? civilTimeToInstant(day, time, initial.timezone) : null;
    if (!instant) return setError('Informe data e horário válidos. Horários inexistentes ou repetidos na mudança de fuso não podem ser escolhidos.');
    if (!/^\d{1,2}$/.test(intensity)) return setError('Selecione uma intensidade inteira de 0 a 10.');
    const parsed = urgeSchema.safeParse({ vicio_id: habit.id, occurred_at: instant, timezone: initial.timezone, intensidade: Number(intensity), gatilhos: triggers, nota: note, acao_realizada: action, resultado: result });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message || 'Revise os campos.');
    const generation = tokenStore.getGeneration();
    inFlight.current = true; setBusy(true); setError('');
    try {
      const saved = await mutations.createUrgeEventWithReceipt(parsed.data);
      if (tokenStore.isCurrent(generation)) setReceipt(saved);
    } catch (caught) { if (tokenStore.isCurrent(generation)) setError(caught instanceof Error ? caught.message : 'Não foi possível salvar. Seus campos foram mantidos.'); }
    finally { inFlight.current = false; setBusy(false); }
  };
  const another = () => {
    const now = momentNow(); setInitial(now); setDate(displayDate(now.date)); setTime(now.time);
    setIntensity(''); setTriggers([]); setNote(''); setAction(''); setResult(''); setError(''); setReceipt(null);
  };
  return <>
    <Card>
      <Text style={textStyles.body}>Registrar vontade não registra uma recaída e não reinicia o contador.</Text>
      {habit.ativo === false ? <Text accessibilityLiveRegion="polite" style={textStyles.body}>Hábito arquivado. O formulário foi preservado; reative o hábito para registrar novos eventos.</Text> : null}
      <Text accessibilityRole="header" style={textStyles.heading}>Intensidade de 0 a 10</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        {Array.from({ length: 11 }, (_, value) => <Pressable key={value} accessibilityRole="radio" accessibilityLabel={`Intensidade ${value} de 10`} accessibilityState={{ checked: intensity === String(value), disabled }} disabled={disabled} onPress={() => setIntensity(String(value))} style={{ minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm, borderWidth: 1, borderColor: intensity === String(value) ? colors.primary : colors.border, backgroundColor: colors.surface }}><Text style={textStyles.body}>{value}</Text></Pressable>)}
      </View>
      <Field label="Intensidade (0 a 10)" hint="Também é possível digitar um número inteiro." value={intensity} onChangeText={setIntensity} keyboardType="number-pad" maxLength={2} editable={!disabled} />
      <Text accessibilityRole="header" style={textStyles.heading}>Gatilhos (opcional)</Text>
      {URGE_TRIGGER_CATALOG.map(trigger => <Pressable key={trigger.code} accessibilityRole="checkbox" accessibilityLabel={trigger.label} accessibilityState={{ checked: triggers.includes(trigger.code), disabled }} disabled={disabled} onPress={() => setTriggers(current => current.includes(trigger.code) ? current.filter(code => code !== trigger.code) : [...current, trigger.code])} style={{ minHeight: 48, justifyContent: 'center' }}><Text style={textStyles.body}>{triggers.includes(trigger.code) ? 'Selecionado: ' : ''}{trigger.label}</Text></Pressable>)}
      <DateField label="Data do episódio" value={date} onChangeText={setDate} editable={!disabled} maxDate={dateTimeInZone(new Date(), initial.timezone).date} todayKey={dateTimeInZone(new Date(), initial.timezone).date} />
      <Field label="Horário (HH:mm)" value={time} onChangeText={setTime} maxLength={5} keyboardType="numbers-and-punctuation" editable={!disabled} />
      <Text style={textStyles.muted}>Fuso deste registro: {initial.timezone}. O momento inicial é agora; ajuste para relatar um episódio passado.</Text>
      <Field label="Nota (opcional)" value={note} onChangeText={setNote} multiline maxLength={1000} editable={!disabled} />
      <Field label="Ação realizada (opcional)" hint="Relate o que aconteceu, se desejar." value={action} onChangeText={setAction} multiline maxLength={1000} editable={!disabled} />
      <Field label="Resultado (opcional)" value={result} onChangeText={setResult} multiline maxLength={1000} editable={!disabled} />
      {error ? <Text accessibilityLiveRegion="polite" style={textStyles.body}>{error}</Text> : null}
      {!receipt ? <AppButton title="Salvar vontade" onPress={() => void save()} loading={busy} disabled={habit.ativo === false} /> : <>
        <Text accessibilityLiveRegion="polite" style={textStyles.body}>{receipt.removed ? 'Este envio foi descartado no aparelho. Não há confirmação local de sincronização.' : receipt.status === 'synced' ? 'Vontade sincronizada.' : receipt.status === 'failed' ? 'Vontade salva no aparelho, com falha na sincronização. Seus dados foram preservados.' : 'Vontade salva no aparelho; aguardando sincronização.'} O contador não foi reiniciado.</Text>
        {receipt.status === 'failed' ? <AppButton title="Resolver envio pendente" variant="secondary" onPress={() => router.push('/(app)/sync')} /> : null}
        <AppButton title="Registrar outra vontade" variant="secondary" onPress={another} disabled={habit.ativo === false} />
      </>}
    </Card>
    <AppButton title="Consultar histórico de vontades" variant="secondary" onPress={() => router.push({ pathname: '/(app)/urges', params: { habitId: habit.id } })} />
  </>;
}
