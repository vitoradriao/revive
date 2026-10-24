import React from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Link } from 'expo-router';
import { Check, Plus, Trash2 } from 'lucide-react-native';
import NetInfo from '@react-native-community/netinfo';
import { bootstrapKey, useBootstrap } from '@/features/bootstrap/use-bootstrap';
import { useReviveMutations } from '@/features/mutations/use-revive-mutations';
import { DataUnavailable, EmptyState, LoadingState, Screen, textStyles } from '@/ui/components';
import { AppHeader, EditorialTitle, editorialStyles, Flourish } from '@/ui/editorial';
import { colors, radius, spacing } from '@/ui/theme';
import { reviveApi } from '@/core/api/repositories';
import { queryClient } from '@/core/query/client';
import { useSession } from '@/features/auth/session-context';

export default function GoalsScreen() {
  const { data, isLoading, error, refetch } = useBootstrap();
  const { completeGoal } = useReviveMutations();
  const { user } = useSession();
  const removeGoal = (id: string) => Alert.alert('Excluir meta?', 'Esta ação exige conexão.', [
    { text: 'Cancelar', style: 'cancel' },
    { text: 'Excluir', style: 'destructive', onPress: async () => {
      if (!(await NetInfo.fetch()).isConnected) return Alert.alert('Sem conexão', 'Conecte-se para excluir a meta.');
      try {
        await reviveApi.deleteGoal(id);
        if (user) await queryClient.invalidateQueries({ queryKey: bootstrapKey(user.id) });
      } catch (error) { Alert.alert('Não foi possível excluir', error instanceof Error ? error.message : 'Tente novamente.'); }
    } },
  ]);
  if (isLoading && !data) return <Screen scroll={false}><LoadingState /></Screen>;
  if (error && !data) return <Screen><AppHeader section="Metas" /><DataUnavailable onRetry={() => void refetch()} /></Screen>;
  return (
    <Screen>
      <AppHeader section="Metas" />
      <EditorialTitle title="Pequenos planos." emphasis="Novos capítulos." />
      <View style={editorialStyles.row}><View style={[editorialStyles.pill, { backgroundColor: colors.lavender }]}><Text style={styles.badge}>{data?.metas.filter(goal => !goal.concluida).length || 0} EM ANDAMENTO</Text></View><Text style={textStyles.muted}>{data?.metas.filter(goal => goal.concluida).length || 0} concluídas</Text></View>
      <View style={editorialStyles.rule} />
      <View style={styles.header}><Text style={textStyles.heading}>O que vem agora?</Text><Link href="/(app)/goals/new" asChild><Pressable accessibilityRole="button" accessibilityLabel="Criar meta" style={styles.add}><Plus color={colors.background} /></Pressable></Link></View>
      {!data?.metas.length ? <EmptyState title="Nenhuma meta" body="Crie uma meta ligada a um dos seus hábitos." /> : data.metas.map((goal, index) => (
        <View key={goal.id} style={[styles.item, { backgroundColor: index % 2 ? colors.butter : colors.peach }, goal.concluida && styles.done]}>
          <View style={editorialStyles.row}><Text style={editorialStyles.note}>{String(index + 1).padStart(2, '0')}</Text><Text style={[styles.badge, { flex: 1, textAlign: 'right' }]}>{goal.vicios?.nome_vicio || 'Meta pessoal'}{data.vicios.find(habit => habit.id === goal.vicio_id)?.ativo === false ? ' · hábito arquivado' : ''}</Text></View>
          <Text style={[textStyles.heading, { minHeight: 64 }]}>{goal.descricao_meta}</Text>
          <View style={editorialStyles.row}>
          {!goal.concluida && !goal.pending ? <Pressable accessibilityRole="button" accessibilityLabel="Concluir meta" onPress={() => void completeGoal(goal.id).catch((error) => Alert.alert('Não foi possível concluir', error instanceof Error ? error.message : 'Tente novamente.'))} style={styles.check}><Check color={colors.background} size={17} /><Text style={styles.checkText}>Marcar como concluída</Text></Pressable> : goal.concluida ? <View style={editorialStyles.row}><Check color={colors.success} /><Text style={textStyles.body}>Concluída</Text></View> : <Text style={[textStyles.muted, { color: colors.text }]}>Pendente</Text>}
          {!goal.pending ? <Pressable accessibilityRole="button" accessibilityLabel="Excluir meta" onPress={() => removeGoal(goal.id)} style={styles.delete}><Trash2 color={colors.text} size={20} /></Pressable> : null}
          </View>
        </View>
      ))}
      <View style={editorialStyles.row}><Flourish width={80} /><Text style={[editorialStyles.note, { flex: 1, fontSize: 18 }]}>Sem pressa. Com intenção.</Text></View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  add: { width: 48, height: 48, borderRadius: radius.pill, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  item: { borderRadius: radius.sm, padding: spacing.md, gap: spacing.md },
  done: { backgroundColor: colors.sage },
  badge: { ...editorialStyles.eyebrow, color: colors.text, fontSize: 10, letterSpacing: 0.7 },
  check: { minHeight: 44, borderRadius: radius.pill, backgroundColor: colors.text, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 10, flex: 1 },
  checkText: { color: colors.background, fontSize: 12, fontWeight: '700', flexShrink: 1 },
  delete: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});
