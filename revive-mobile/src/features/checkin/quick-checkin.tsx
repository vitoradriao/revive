import React, { useEffect, useRef, useState } from 'react';
import { Keyboard, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSession } from '@/features/auth/session-context';
import { useBootstrap } from '@/features/bootstrap/use-bootstrap';
import { useReviveMutations, type MutationReceipt } from '@/features/mutations/use-revive-mutations';
import { tokenStore } from '@/core/auth/token-store';
import { getPendingMutations } from '@/core/storage/database';
import type { BootstrapData, DailyRecord } from '@/domain/types';
import { displayDate, localDateKey } from '@/domain/formats';
import { AppButton, Card, Field, textStyles } from '@/ui/components';
import { colors, radius, spacing } from '@/ui/theme';
import { MoodPicker } from '@/ui/mood-picker';
import { checkinSelection } from './selection-preferences';
import { recordSchema } from './record-schema';
import { RecordDetails } from './record-details';
import { useLocalDay } from './use-local-day';

export function QuickCheckin() {
  const { user, isRestoring } = useSession();
  const { data } = useBootstrap();
  if (isRestoring || !user || !data || data.usuario.id !== user.id) return null;
  // Account changes destroy drafts, selection and asynchronous confirmations.
  return <CheckinForm key={user.id} userId={user.id} data={data} />;
}

function CheckinForm({ userId, data }: { userId: string; data: BootstrapData }) {
  const router = useRouter();
  const mutations = useReviveMutations();
  const today = useLocalDay();
  const habits = data.vicios.filter(habit => habit.usuario_id === userId && habit.ativo !== false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [consulting, setConsulting] = useState(false);
  const [another, setAnother] = useState<string | null>(null);
  const [humor, setHumor] = useState('');
  const [gatilhos, setGatilhos] = useState('');
  const [conquistas, setConquistas] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState<{ receipt: MutationReceipt; record: DailyRecord; leftQueue?: boolean } | null>(null);
  const sending = useRef(false);
  const mounted = useRef(true);
  const [generation] = useState(() => tokenStore.getGeneration());
  const habit = habits.find(item => item.id === selectedId) || habits[0];
  const records = data.registros.filter(record => record.vicio_id === habit?.id && record.data_registro === today);
  const savedToday = Boolean(saved && !saved.leftQueue && habit && saved.record.vicio_id === habit.id && saved.record.data_registro === today);
  const hasToday = records.length > 0 || savedToday;
  const confirmationKey = `${habit?.id}:${today}`;
  const canCreate = !hasToday || another === confirmationKey;
  const current = () => mounted.current && tokenStore.isCurrent(generation);

  useEffect(() => {
    mounted.current = true;
    void checkinSelection.get(userId).then(id => {
      if (mounted.current) setSelectedId(id);
    }).catch(() => undefined).finally(() => {
      if (mounted.current) setReady(true);
    });
    return () => { mounted.current = false; };
  }, [userId]);

  // A durable intent can later be acknowledged or fail during background sync.
  const savedId = saved?.receipt.id;
  useEffect(() => {
    if (!savedId) return;
    let active = true;
    const refresh = async () => {
      try {
        const pending = (await getPendingMutations(userId)).find(item => item.id === savedId);
        if (!active || !tokenStore.isCurrent(generation)) return;
        setSaved(previous => previous?.receipt.id === savedId ? {
          ...previous,
          // Absence alone can mean acknowledgment OR an explicit discard on /sync.
          leftQueue: !pending && previous.receipt.status !== 'synced',
          receipt: { id: savedId, status: pending?.status === 'failed' ? 'failed' : pending ? 'queued' : previous.receipt.status },
        } : previous);
      } catch { /* Keep the last confirmed local receipt when storage is unavailable. */ }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 10_000);
    return () => { active = false; clearInterval(timer); };
  }, [savedId, userId, generation, data.registros]);

  const select = (id: string) => {
    if (sending.current) return;
    setSelectedId(id); setChoosing(false); setAnother(null); setConsulting(false); setSaved(null); setError('');
    void checkinSelection.set(userId, id).catch(() => undefined);
  };

  const submit = async () => {
    if (sending.current || !ready || !habit || !current()) return;
    // Sample the local day at the actual tap, even if the display was open at midnight.
    const day = localDateKey();
    const alreadyRecorded = data.registros.some(record => record.vicio_id === habit.id && record.data_registro === day)
      || (saved?.record.vicio_id === habit.id && saved.record.data_registro === day);
    if (alreadyRecorded && another !== `${habit.id}:${day}`) {
      setError('Já existe um check-in neste dia. Escolha registrar outro para criar um novo registro.');
      return;
    }
    const parsed = recordSchema.safeParse({ humor, gatilhos: gatilhos || undefined, conquistas: conquistas || undefined, observacoes: observacoes || undefined });
    if (!parsed.success) { setError(parsed.error.issues[0]?.message || 'Revise o registro.'); return; }
    sending.current = true;
    setSaving(true); setError('');
    try {
      const input = { ...parsed.data, vicio_id: habit.id, data_registro: day, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' };
      const receipt = await mutations.createRecordWithReceipt(input);
      if (!current()) return;
      setSaved({ receipt, record: { ...input, id: receipt.id, pending: receipt.status !== 'synced' } });
      setAnother(null); setConsulting(false);
      setHumor(''); setGatilhos(''); setConquistas(''); setObservacoes('');
      setExpanded(false);
      Keyboard.dismiss();
      void checkinSelection.set(userId, habit.id).catch(() => undefined);
    } catch {
      if (current()) setError('Não foi possível confirmar o salvamento no aparelho. Seus campos foram mantidos; tente novamente.');
    } finally {
      sending.current = false;
      if (current()) setSaving(false);
    }
  };

  if (!habit) return <Card>
    <Text accessibilityRole="header" style={textStyles.heading}>Check-in rápido</Text>
    <Text style={textStyles.body}>Cadastre um hábito para registrar como você está se sentindo.</Text>
    <AppButton title="Adicionar hábito" onPress={() => router.push('/(app)/habits/new')} />
  </Card>;

  return <Card>
    <Text accessibilityRole="header" style={textStyles.heading}>Check-in rápido</Text>
    <Text style={textStyles.muted}>Hoje, {displayDate(today)} · dia local do aparelho</Text>
    <Text style={textStyles.body}>Hábito: {habit.nome_vicio}</Text>
    {habits.length > 1 ? <AppButton title="Escolher hábito" variant="secondary" disabled={saving || !ready} accessibilityState={{ expanded: choosing }} onPress={() => setChoosing(!choosing)} /> : null}
    {choosing ? <View accessibilityRole="radiogroup" accessibilityLabel="Hábito do check-in" style={styles.options}>
      {habits.map(item => <Pressable key={item.id} accessibilityRole="radio" accessibilityLabel={item.nome_vicio} accessibilityState={{ checked: item.id === habit.id, disabled: saving }} disabled={saving} onPress={() => select(item.id)} style={[styles.option, item.id === habit.id && styles.selected]}>
        <Text style={textStyles.body}>{item.nome_vicio}{item.id === habit.id ? ' · Selecionado' : ''}</Text>
      </Pressable>)}
    </View> : null}
    {hasToday ? <>
      <Text accessibilityLiveRegion="polite" style={textStyles.body}>Já há check-in para este hábito hoje. Os registros anteriores serão preservados.</Text>
      <AppButton title={consulting ? 'Ocultar registros de hoje' : 'Consultar check-ins de hoje'} variant="secondary" disabled={saving} accessibilityState={{ expanded: consulting }} onPress={() => setConsulting(!consulting)} />
      {consulting ? records.length ? records.map(record => <RecordDetails key={record.id} record={record} />) : savedToday && saved ? <RecordDetails record={{ ...saved.record, pending: saved.receipt.status !== 'synced' }} /> : null : null}
      {!canCreate ? <AppButton title="Registrar outro check-in" variant="secondary" disabled={saving} onPress={() => { setAnother(confirmationKey); setSaved(null); setError(''); }} /> : null}
    </> : <Text style={textStyles.muted}>Nenhum check-in de hoje nos dados disponíveis.</Text>}
    {saved ? <View style={styles.options}>
      <Text accessibilityLiveRegion="polite" style={textStyles.body}>{saved.leftQueue ? 'A intenção saiu da fila. Consulte o histórico atualizado para verificar o resultado.' : saved.receipt.status === 'synced' ? 'Check-in sincronizado.' : saved.receipt.status === 'failed' ? 'Salvo no aparelho. A sincronização falhou; o registro pode ser recuperado.' : 'Salvo no aparelho. Aguardando sincronização.'}</Text>
      {saved.leftQueue ? <AppButton title="Consultar histórico" variant="secondary" onPress={() => router.push('/(app)/calendar')} /> : saved.receipt.status !== 'synced' ? <AppButton title="Ver pendências de sincronização" variant="secondary" onPress={() => router.push('/(app)/sync')} /> : null}
    </View> : null}
    {canCreate ? <>
      <Text style={textStyles.body}>Como você está se sentindo?</Text>
      <MoodPicker value={humor} onChange={setHumor} disabled={saving} />
      <AppButton title={expanded ? 'Recolher reflexão opcional' : 'Adicionar reflexão (opcional)'} variant="secondary" disabled={saving} accessibilityState={{ expanded }} onPress={() => setExpanded(!expanded)} />
      {expanded ? <>
        <Field label="Humor (texto livre)" maxLength={100} value={humor} editable={!saving} onChangeText={setHumor} placeholder="Ou descreva como está se sentindo" />
        <Field label="Gatilhos (opcional)" maxLength={500} value={gatilhos} editable={!saving} onChangeText={setGatilhos} multiline />
        <Field label="Conquistas (opcional)" maxLength={500} value={conquistas} editable={!saving} onChangeText={setConquistas} multiline />
        <Field label="Observações (opcional)" maxLength={1000} value={observacoes} editable={!saving} onChangeText={setObservacoes} multiline />
      </> : null}
      <AppButton title="Salvar check-in" loading={saving} disabled={!ready || !humor.trim()} onPress={() => void submit()} />
    </> : null}
    {error ? <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={{ color: colors.danger }}>{error}</Text> : null}
  </Card>;
}

const styles = StyleSheet.create({
  options: { gap: spacing.sm },
  option: { minHeight: 48, padding: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, justifyContent: 'center' },
  selected: { borderColor: colors.primary, backgroundColor: colors.surfaceRaised },
});
