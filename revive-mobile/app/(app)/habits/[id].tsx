import React, { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import NetInfo from '@react-native-community/netinfo';
import { z } from 'zod';
import { bootstrapKey, useBootstrap } from '@/features/bootstrap/use-bootstrap';
import { useReviveMutations } from '@/features/mutations/use-revive-mutations';
import { AppButton, EmptyState, Field, LoadingState, Screen, textStyles } from '@/ui/components';
import { colors, radius, spacing } from '@/ui/theme';
import { coverageLabel, currentStreak, distinctCheckinDays, formatCurrency, milestoneCategoryLabel, sequenceSavings } from '@/domain/metrics';
import { reviveApi } from '@/core/api/repositories';
import { queryClient } from '@/core/query/client';
import { useSession } from '@/features/auth/session-context';
import { recordSchema } from '@/features/checkin/record-schema';
import { RecordDetails } from '@/features/checkin/record-details';
import { HabitManagement } from '@/features/habits/habit-management';

const relapseSchema = z.object({ motivo: z.string().max(1000).optional() });

export default function HabitDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useSession();
  const { data, isLoading } = useBootstrap();
  const mutations = useReviveMutations();
  const [humor, setHumor] = useState('');
  const [gatilhos, setGatilhos] = useState('');
  const [conquistas, setConquistas] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [motivo, setMotivo] = useState('');
  const [saving, setSaving] = useState(false);
  const habit = data?.vicios.find((item) => item.id === id);
  const streak = habit ? currentStreak(habit) : null;
  const savings = habit ? sequenceSavings(habit) : null;
  const checkinDays = habit ? habit.progresso?.dias_checkin ?? distinctCheckinDays(data?.registros || [], habit.id) : 0;
  const recentRecords = useMemo(
    () => data?.registros.filter((item) => item.vicio_id === id).slice(0, 5) || [],
    [data?.registros, id],
  );

  if (isLoading && !data) return <Screen scroll={false}><LoadingState /></Screen>;
  if (!habit) return <Screen><EmptyState title="Hábito não encontrado" body="Atualize os dados e tente novamente." /></Screen>;

  const submitRecord = async () => {
    const parsed = recordSchema.safeParse({ humor, gatilhos: gatilhos || undefined, conquistas: conquistas || undefined, observacoes: observacoes || undefined });
    if (!parsed.success) return Alert.alert('Revise o registro', parsed.error.issues[0]?.message);
    setSaving(true);
    try {
      const status = await mutations.createRecord({ vicio_id: habit.id, ...parsed.data });
      setHumor(''); setGatilhos(''); setConquistas(''); setObservacoes('');
      Alert.alert(status === 'queued' ? 'Salvo no aparelho' : 'Registro salvo', status === 'queued' ? 'Será sincronizado quando a conexão voltar.' : 'Seu check-in foi registrado.');
    } catch (error) {
      Alert.alert('Não foi possível salvar', error instanceof Error ? error.message : 'Tente novamente.');
    } finally { setSaving(false); }
  };

  const submitRelapse = (resetarContador: boolean) => {
    const parsed = relapseSchema.safeParse({ motivo: motivo || undefined });
    if (!parsed.success) return Alert.alert('Revise a reflexão', parsed.error.issues[0]?.message);
    Alert.alert('Confirmar recaída', resetarContador ? 'O contador será reiniciado.' : 'O evento será registrado sem reiniciar o contador.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Confirmar', style: 'destructive', onPress: async () => {
        setSaving(true);
        try {
          const status = await mutations.createRelapse(habit.id, { ...parsed.data, resetarContador });
          setMotivo('');
          Alert.alert(status === 'queued' ? 'Salvo no aparelho' : 'Recaída registrada', status === 'queued' ? 'Será sincronizada quando a conexão voltar.' : 'Continue. Um passo difícil não apaga seu progresso.');
        } catch (error) {
          Alert.alert('Não foi possível registrar', error instanceof Error ? error.message : 'Tente novamente.');
        } finally { setSaving(false); }
      } },
    ]);
  };

  const deleteHabit = () => Alert.alert(
    'Excluir hábito?',
    'Registros, recaídas e metas associados também serão removidos. Esta ação exige conexão.',
    [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Excluir', style: 'destructive', onPress: async () => {
        const network = await NetInfo.fetch();
        if (!network.isConnected) return Alert.alert('Sem conexão', 'Conecte-se para excluir este hábito com segurança.');
        setSaving(true);
        try {
          await reviveApi.deleteAddiction(habit.id);
          if (user) await queryClient.invalidateQueries({ queryKey: bootstrapKey(user.id) });
          router.back();
        } catch (error) {
          Alert.alert('Não foi possível excluir', error instanceof Error ? error.message : 'Tente novamente.');
        } finally { setSaving(false); }
      } },
    ],
  );

  return (
    <Screen>
      <Stack.Screen options={{ title: habit.nome_vicio }} />
      <View style={styles.summary}>
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
      </View>

      {user ? <HabitManagement key={`${user.id}:${habit.id}`} habit={habit} userId={user.id} /> : null}
      <Text accessibilityRole="header" style={textStyles.heading}>Vontades</Text>
      <Text style={textStyles.muted}>Um relato de vontade é diferente de uma recaída e não reinicia o contador.</Text>
      {habit.ativo !== false ? <AppButton title="Registrar vontade" onPress={() => router.push({ pathname: '/(app)/urges/new', params: { habitId: habit.id } })} /> : null}
      <AppButton title="Consultar histórico de vontades" variant="secondary" onPress={() => router.push({ pathname: '/(app)/urges', params: { habitId: habit.id } })} />
      {habit.ativo !== false ? <>
      <Text style={textStyles.heading}>Check-in de hoje</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        {['Bem', 'Confiante', 'Ansioso', 'Desanimado'].map((mood) => <Pressable key={mood} accessibilityRole="button" accessibilityState={{ selected: humor === mood }} onPress={() => setHumor(mood)} style={[styles.mood, humor === mood && { borderColor: colors.primary, backgroundColor: colors.surfaceRaised }]}><Text style={textStyles.body}>{mood}</Text></Pressable>)}
      </View>
      <Field maxLength={100} label="Humor" value={humor} onChangeText={setHumor} placeholder="Ou descreva como está se sentindo" />
      <Field maxLength={500} label="Gatilhos" value={gatilhos} onChangeText={setGatilhos} multiline />
      <Field maxLength={500} label="Conquistas" value={conquistas} onChangeText={setConquistas} multiline />
      <Field maxLength={1000} label="Observações" value={observacoes} onChangeText={setObservacoes} multiline />
      <AppButton title="Salvar check-in" onPress={submitRecord} loading={saving} />

      <View style={styles.divider} />
      <Text style={textStyles.heading}>Registrar recaída</Text>
      <Text style={textStyles.muted}>Este registro é privado e existe para ajudar na reflexão, sem julgamentos.</Text>
      <Field maxLength={1000} label="O que aconteceu? (opcional)" value={motivo} onChangeText={setMotivo} multiline />
      <AppButton title="Registrar e reiniciar contador" variant="danger" onPress={() => submitRelapse(true)} loading={saving} />
      <AppButton title="Registrar sem reiniciar" variant="secondary" onPress={() => submitRelapse(false)} disabled={saving} />
      </> : <Text style={textStyles.body}>Hábito arquivado. O histórico permanece disponível; reative para novos registros.</Text>}

      <View style={styles.divider} />
      <Text style={textStyles.heading}>Registros recentes</Text>
      <AppButton title="Consultar diário completo" variant="secondary" onPress={() => router.push({ pathname: '/(app)/records', params: { habitId: habit.id } })} />
      {!recentRecords.length ? <Text style={textStyles.muted}>Nenhum registro ainda.</Text> : recentRecords.map((record) => (
        <View key={record.id} style={styles.record}>
          <RecordDetails record={record} /><AppButton title="Abrir e corrigir registro" variant="secondary" onPress={() => router.push({ pathname: '/(app)/records/[id]', params: { id: record.id } })} />
        </View>
      ))}
      <View style={styles.divider} />
      <AppButton title="Excluir hábito" variant="danger" onPress={deleteHabit} disabled={saving} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  mood: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border },
  summary: { borderRadius: radius.lg, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, padding: spacing.lg, gap: spacing.sm },
  milestones: { gap: spacing.xs },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.sm },
  record: { borderRadius: radius.md, backgroundColor: colors.surface, padding: spacing.md, gap: spacing.xs },
});
