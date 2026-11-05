import React, { useMemo, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import NetInfo from '@react-native-community/netinfo';
import { z } from 'zod';
import { bootstrapKey, useBootstrap } from '@/features/bootstrap/use-bootstrap';
import { useReviveMutations } from '@/features/mutations/use-revive-mutations';
import { AppButton, Card, DataUnavailable, EmptyState, Field, LoadingState, Screen, textStyles } from '@/ui/components';
import { colors, radius, spacing } from '@/ui/theme';
import { BackHeader, Disclosure, EditorialTitle, editorialStyles, Flourish, SectionTabs } from '@/ui/editorial';
import { MoodPicker } from '@/ui/mood-picker';
import { coverageLabel, currentStreak, distinctCheckinDays, formatCurrency, milestoneCategoryLabel, sequenceSavings } from '@/domain/metrics';
import { reviveApi } from '@/core/api/repositories';
import { queryClient } from '@/core/query/client';
import { useSession } from '@/features/auth/session-context';
import { recordSchema } from '@/features/checkin/record-schema';
import { RecordTimeline } from '@/features/diary/record-timeline';
import { HabitManagement } from '@/features/habits/habit-management';

const sections = [{ value: 'checkin', label: 'Check-in' }, { value: 'relapse', label: 'Recaída' }, { value: 'records', label: 'Registros' }] as const;
type Section = typeof sections[number]['value'];

const relapseSchema = z.object({ motivo: z.string().max(1000).optional() });

export default function HabitDetailRoute() {
  const { id, section } = useLocalSearchParams<{ id: string; section?: string }>();
  const { user } = useSession();
  return <HabitDetailScreen key={`${user?.id}:${id}`} id={id} initialSection={section} />;
}

function HabitDetailScreen({ id, initialSection }: { id: string; initialSection?: string }) {
  const router = useRouter();
  const { user } = useSession();
  const { data, isLoading, error, refetch } = useBootstrap();
  const mutations = useReviveMutations();
  const [humor, setHumor] = useState('');
  const [gatilhos, setGatilhos] = useState('');
  const [conquistas, setConquistas] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [motivo, setMotivo] = useState('');
  const [saving, setSaving] = useState(false);
  const [section, setSection] = useState<Section>(initialSection === 'relapse' || initialSection === 'records' ? initialSection : 'checkin');
  const inFlight = useRef(false);
  const confirming = useRef(false);
  const habit = data?.vicios.find((item) => item.id === id);
  const streak = habit ? currentStreak(habit) : null;
  const savings = habit ? sequenceSavings(habit) : null;
  const checkinDays = habit ? habit.progresso?.dias_checkin ?? distinctCheckinDays(data?.registros || [], habit.id) : 0;
  const recentRecords = useMemo(
    () => data?.registros.filter((item) => item.vicio_id === id).sort((a, b) => b.data_registro.localeCompare(a.data_registro)).slice(0, 5) || [],
    [data?.registros, id],
  );

  if (isLoading && !data) return <Screen scroll={false}><BackHeader section="Hábito" onBack={() => router.back()} /><LoadingState /></Screen>;
  if (!habit) return <Screen><BackHeader section="Hábito" onBack={() => router.back()} />{error && !data ? <DataUnavailable onRetry={() => void refetch()} /> : <><EmptyState title="Hábito não encontrado" body="Atualize os dados e tente novamente." /><AppButton title="Atualizar dados" variant="secondary" onPress={() => void refetch()} /></>}</Screen>;

  const submitRecord = async () => {
    if (inFlight.current || habit.ativo === false) return;
    const parsed = recordSchema.safeParse({ humor, gatilhos: gatilhos || undefined, conquistas: conquistas || undefined, observacoes: observacoes || undefined });
    if (!parsed.success) return Alert.alert('Revise o registro', parsed.error.issues[0]?.message);
    inFlight.current = true; setSaving(true);
    try {
      const status = await mutations.createRecord({ vicio_id: habit.id, ...parsed.data });
      setHumor(''); setGatilhos(''); setConquistas(''); setObservacoes('');
      Alert.alert(status === 'queued' ? 'Salvo no aparelho' : 'Registro salvo', status === 'queued' ? 'Será sincronizado quando a conexão voltar.' : 'Seu check-in foi registrado.');
    } catch (error) {
      Alert.alert('Não foi possível salvar', error instanceof Error ? error.message : 'Tente novamente.');
    } finally { inFlight.current = false; setSaving(false); }
  };

  const submitRelapse = (resetarContador: boolean) => {
    if (inFlight.current || confirming.current || habit.ativo === false) return;
    const parsed = relapseSchema.safeParse({ motivo: motivo || undefined });
    if (!parsed.success) return Alert.alert('Revise a reflexão', parsed.error.issues[0]?.message);
    confirming.current = true;
    Alert.alert('Confirmar recaída', resetarContador ? 'O contador será reiniciado.' : 'O evento será registrado sem reiniciar o contador.', [
      { text: 'Cancelar', style: 'cancel', onPress: () => { confirming.current = false; } },
      { text: 'Confirmar', style: 'destructive', onPress: async () => {
        confirming.current = false;
        if (inFlight.current) return;
        inFlight.current = true; setSaving(true);
        try {
          const status = await mutations.createRelapse(habit.id, { ...parsed.data, resetarContador });
          setMotivo('');
          Alert.alert(status === 'queued' ? 'Salvo no aparelho' : 'Recaída registrada', status === 'queued' ? 'Será sincronizada quando a conexão voltar.' : 'Continue. Um passo difícil não apaga seu progresso.');
        } catch (error) {
          Alert.alert('Não foi possível registrar', error instanceof Error ? error.message : 'Tente novamente.');
        } finally { inFlight.current = false; setSaving(false); }
      } },
    ], { cancelable: true, onDismiss: () => { confirming.current = false; } });
  };

  const deleteHabit = () => {
    if (inFlight.current || confirming.current) return;
    confirming.current = true;
    Alert.alert('Excluir hábito?', 'Registros, recaídas, vontades e metas associados também serão removidos. Esta ação exige conexão.', [
      { text: 'Cancelar', style: 'cancel', onPress: () => { confirming.current = false; } },
      { text: 'Excluir', style: 'destructive', onPress: async () => {
        confirming.current = false;
        if (inFlight.current) return;
        inFlight.current = true; setSaving(true);
        try {
          const network = await NetInfo.fetch();
          if (!network.isConnected) return Alert.alert('Sem conexão', 'Conecte-se para excluir este hábito com segurança.');
          await reviveApi.deleteAddiction(habit.id);
          if (user) await queryClient.invalidateQueries({ queryKey: bootstrapKey(user.id) });
          router.back();
        } catch (error) {
          Alert.alert('Não foi possível excluir', error instanceof Error ? error.message : 'Tente novamente.');
        } finally { inFlight.current = false; setSaving(false); }
      } },
    ], { cancelable: true, onDismiss: () => { confirming.current = false; } });
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: habit.nome_vicio }} />
      <BackHeader section={`${habit.nome_vicio}${section === 'relapse' ? ' · Recaída' : section === 'records' ? ' · Registros' : ''}`} onBack={() => router.back()} />
      <SectionTabs tabs={sections} selected={section} onSelect={setSection} variant="pill" disabled={saving} />
      {section === 'checkin' ? <>
        <Card style={styles.summary}>
          <View style={[editorialStyles.row, { flexWrap: 'wrap' }]}><View style={styles.summaryDays}><Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5} accessibilityLabel={`Sequência atual: ${streak?.value == null ? 'histórico indisponível' : `${streak.value} dias`}`} style={styles.days}>{streak?.value ?? '—'}</Text><Text style={editorialStyles.note}>dias</Text></View><View style={editorialStyles.pill}><Text style={styles.badge}>SUA JORNADA</Text></View></View>
          <Text style={styles.summaryText}>{savings?.value == null ? 'Economia da sequência indisponível' : `${formatCurrency(savings.value)} de economia estimada na sequência`}</Text>
          <Text style={styles.summaryText}>{habit.tempo_formatado || (streak?.legacy ? 'Contador legado · histórico parcial' : coverageLabel(streak?.coverage || 'unknown'))}</Text>
          {habit.progresso?.pendente ? <Text accessibilityLiveRegion="polite" style={styles.summaryText}>Progresso pendente de sincronização.</Text> : null}
        </Card>
        {habit.ativo !== false ? <>
          <EditorialTitle title="Como foi seu dia?" emphasis="Pode ser sincero." compact />
          <MoodPicker value={humor} onChange={setHumor} disabled={saving} />
          <Field maxLength={100} label="Humor" value={humor} editable={!saving} onChangeText={setHumor} placeholder="Ou descreva como está se sentindo" />
          <Field maxLength={500} label="Gatilhos" value={gatilhos} editable={!saving} onChangeText={setGatilhos} placeholder="Algo tornou seu dia mais difícil?" multiline compact />
          <Field maxLength={500} label="Conquistas" value={conquistas} editable={!saving} onChangeText={setConquistas} placeholder="Que pequena vitória você quer guardar?" multiline compact />
          <Field maxLength={1000} label="Observações" value={observacoes} editable={!saving} onChangeText={setObservacoes} placeholder="Este espaço é seu." multiline compact />
          <AppButton title="Salvar check-in" onPress={() => void submitRecord()} loading={saving} />
          <Text style={styles.footer}>Um registro de cada vez.</Text>
        </> : <Card><Text style={textStyles.body}>Hábito arquivado. O histórico permanece disponível; reative para novos registros.</Text></Card>}
        <Disclosure title="Ver progresso completo">
          <Card>
            <Text accessibilityRole="header" style={textStyles.heading}>Progresso de {habit.nome_vicio}</Text>
            <Text style={textStyles.muted}>Sequência atual</Text>
            <Text accessibilityLabel={`Sequência atual: ${streak?.value == null ? 'histórico indisponível' : `${streak.value} dias`}`} style={textStyles.value}>
              {streak?.value == null ? 'Indisponível' : `${streak.value} dias`}
            </Text>
            <Text style={textStyles.muted}>{streak?.legacy ? `Contador legado do servidor · ${coverageLabel('unknown')}` : coverageLabel(streak?.coverage || 'unknown')}</Text>
            <Text style={textStyles.muted}>Recorde histórico</Text>
            <Text accessibilityLabel={`Recorde histórico: ${habit.progresso?.recorde_dias == null || habit.progresso.recorde_cobertura === 'unknown' ? 'histórico indisponível' : `${habit.progresso.recorde_dias} dias`}`} style={textStyles.body}>
              {habit.progresso?.recorde_dias == null || habit.progresso.recorde_cobertura === 'unknown'
                ? 'Indisponível: o histórico não permite confirmar um recorde.'
                : `${habit.progresso.recorde_dias} dias`}
            </Text>
            {habit.progresso?.pendente ? <Text accessibilityLiveRegion="polite" style={textStyles.muted}>Recaída pendente de sincronização; o recorde salvo não foi alterado.</Text> : null}
            <Text style={textStyles.muted}>Dias distintos com check-in</Text>
            <Text accessibilityLabel={`${checkinDays} dias distintos com check-in`} style={textStyles.body}>{checkinDays} dias</Text>
            <Text style={textStyles.muted}>Economia estimada da sequência atual</Text>
            <Text accessibilityLabel={savings?.value == null ? 'Economia estimada da sequência indisponível' : `Economia estimada da sequência: ${formatCurrency(savings.value)}`} style={textStyles.body}>
              {savings?.value == null ? 'Indisponível: cobertura insuficiente' : `${formatCurrency(savings.value)} · ${coverageLabel(savings.coverage)}`}
            </Text>
            {habit.progresso?.economia_acumulada.valor_estimado != null ? <Text style={textStyles.muted}>
              Economia estimada acumulada: {formatCurrency(habit.progresso.economia_acumulada.valor_estimado)} · {coverageLabel(habit.progresso.economia_acumulada.cobertura)}.
            </Text> : null}
            {habit.progresso?.marcos.length ? <View style={styles.milestones}>
              <Text style={textStyles.muted}>Marcos permanentes</Text>
              {habit.progresso.marcos.map((award) => <Text key={award.id} accessibilityLabel={`${award.valor_alvo} ${milestoneCategoryLabel(award.categoria)}, marco permanente, ${coverageLabel(award.cobertura)}`} style={textStyles.body}>
                {award.valor_alvo} {milestoneCategoryLabel(award.categoria)} · {coverageLabel(award.cobertura)}
              </Text>)}
            </View> : null}
          </Card>
        </Disclosure>
      </> : section === 'relapse' ? <>
        <EditorialTitle title="Um dia difícil" emphasis="não apaga tudo." />
        <Card style={{ backgroundColor: colors.lavender, borderWidth: 0, gap: 12 }}><Text style={[textStyles.heading, { fontSize: 16, lineHeight: 23 }]}>Um espaço sem julgamentos.</Text><Text style={[textStyles.body, { fontSize: 14, lineHeight: 21 }]}>Este registro é privado e existe para ajudar você a refletir.</Text></Card>
        {habit.ativo !== false ? <>
          <Field label="O que aconteceu? (opcional)" maxLength={1000} value={motivo} onChangeText={setMotivo} editable={!saving} placeholder="Escreva o que fizer sentido para você." multiline style={{ minHeight: 150 }} />
          <View style={[editorialStyles.pill, { backgroundColor: colors.sage }]}><Text style={styles.badge}>OPCIONAL</Text></View>
          <View style={styles.relapseAction}><AppButton title="Registrar sem reiniciar" onPress={() => submitRelapse(false)} loading={saving} /><Text style={styles.actionHint}>Mantém o contador atual.</Text></View>
          <View style={styles.relapseAction}><AppButton title="Registrar e reiniciar contador" variant="softDanger" onPress={() => submitRelapse(true)} disabled={saving} /><Text style={styles.actionHint}>Reinicia a contagem de dias.</Text></View>
          <Text style={styles.footer}>Você confirma antes de registrar.</Text>
        </> : <Text style={textStyles.body}>Hábito arquivado. Reative para registrar uma recaída.</Text>}
      </> : <>
        <EditorialTitle title="Sua história," emphasis="um dia por vez." />
        <View style={editorialStyles.row}><View style={[editorialStyles.pill, { backgroundColor: colors.lavender }]}><Text style={styles.badge}>{recentRecords.length} REGISTROS CARREGADOS</Text></View><Text style={textStyles.muted}>Mais recentes</Text></View>
        {!recentRecords.length ? <EmptyState title="Sua história começa aqui" body="Seus check-ins aparecerão neste espaço. Consulte o diário para buscar outros períodos." /> : <RecordTimeline records={recentRecords} onOpen={record => router.push({ pathname: '/(app)/records/[id]', params: { id: record.id } })} />}
        <Text style={editorialStyles.note}>Até os pequenos dias{`\n`}merecem ser lembrados.</Text>
        <View style={{ alignItems: 'flex-end' }}><Flourish /></View>
        <AppButton title="Consultar diário completo" variant="secondary" onPress={() => router.push({ pathname: '/(app)/records', params: { habitId: habit.id } })} />
        <View style={editorialStyles.rule} />
        <AppButton title="Excluir hábito" variant="softDanger" onPress={deleteHabit} disabled={saving} />
        <Text style={textStyles.muted}>Também remove registros, recaídas, vontades e metas vinculados. Você confirma antes de excluir.</Text>
      </>}
      <Disclosure title="Vontades e gerenciamento">
        <Text accessibilityRole="header" style={textStyles.heading}>Vontades</Text>
        <Text style={textStyles.muted}>Um relato de vontade é diferente de uma recaída e não reinicia o contador.</Text>
        {habit.ativo !== false ? <AppButton title="Registrar vontade" onPress={() => router.push({ pathname: '/(app)/urges/new', params: { habitId: habit.id } })} /> : null}
        <AppButton title="Consultar histórico de vontades" variant="secondary" onPress={() => router.push({ pathname: '/(app)/urges', params: { habitId: habit.id } })} />
        {user ? <HabitManagement key={`${user.id}:${habit.id}`} habit={habit} userId={user.id} /> : null}
      </Disclosure>
    </Screen>
  );
}

const styles = StyleSheet.create({
  summary: { borderRadius: radius.lg, backgroundColor: colors.peach, borderWidth: 0, gap: 8 },
  summaryDays: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', gap: 10, flex: 1, minWidth: 150 },
  days: { ...textStyles.value, fontSize: 36, letterSpacing: -1 },
  summaryText: { ...textStyles.body, fontSize: 12, lineHeight: 18 },
  badge: { ...editorialStyles.eyebrow, fontSize: 9, letterSpacing: 0.4, color: colors.text },
  milestones: { gap: spacing.xs },
  relapseAction: { gap: 8, marginTop: 10 },
  actionHint: { ...textStyles.muted, textAlign: 'center', fontSize: 13 },
  footer: { ...editorialStyles.note, fontSize: 16, textAlign: 'center', marginVertical: 8 },
});
