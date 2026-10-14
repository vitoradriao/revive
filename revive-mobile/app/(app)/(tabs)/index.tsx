import React from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Link } from 'expo-router';
import { Plus, RefreshCw } from 'lucide-react-native';
import { useBootstrap } from '@/features/bootstrap/use-bootstrap';
import { useSession } from '@/features/auth/session-context';
import { accountAccumulatedSavings, accountRecordHolder, completedGoals, coverageLabel, currentStreak, distinctCheckinDays, formatCurrency } from '@/domain/metrics';
import { Card, EmptyState, LoadingState, Screen, textStyles } from '@/ui/components';
import { AppHeader, ArrowMark, EditorialTitle, editorialStyles, Flourish } from '@/ui/editorial';
import { Illustration } from '@/ui/illustration';
import { colors, radius, spacing } from '@/ui/theme';
import { QuickCheckin } from '@/features/checkin/quick-checkin';

export default function DashboardScreen() {
  const { user } = useSession();
  const { width, fontScale } = useWindowDimensions();
  const compact = width < 360 || fontScale > 1.2;
  const { data, isLoading, error, refetch, isFetching } = useBootstrap();
  const activeHabits = (data?.vicios || []).filter(habit => habit.ativo !== false);
  const recordHolder = accountRecordHolder(data?.vicios || []);
  const savings = accountAccumulatedSavings(data?.vicios || []);
  const hasPendingProgress = Boolean(data?.vicios.some(habit => habit.progresso?.pendente));
  if (isLoading && !data) return <Screen scroll={false}><LoadingState label="Preparando sua jornada..." /></Screen>;
  return (
    <Screen>
      <AppHeader section="Sua jornada" />
      <View style={editorialStyles.row}>
        <EditorialTitle eyebrow={`Olá, ${user?.nome?.split(' ')[0] || 'você'}`} title="Um dia de" emphasis="cada vez." />
        <Pressable accessibilityRole="button" accessibilityLabel="Atualizar dados" accessibilityState={{ busy: isFetching }} onPress={() => void refetch()} style={styles.iconButton}><RefreshCw color={colors.text} size={22} /></Pressable>
      </View>
      {error && !data ? <Card><Text style={{ color: colors.danger }}>{error.message}</Text></Card> : null}
      <Card style={styles.poster}>
        <Text style={[editorialStyles.eyebrow, { color: colors.text }]}>SUA MAIOR SEQUÊNCIA</Text>
        <View style={editorialStyles.row}>
          <View style={{ flex: 1 }}><Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5} accessibilityLabel={recordHolder?.progresso?.recorde_dias == null ? 'Recorde histórico indisponível' : `Recorde histórico: ${recordHolder.progresso.recorde_dias} dias`} style={[editorialStyles.largeValue, compact && { fontSize: 64 }]}>{recordHolder?.progresso?.recorde_dias ?? '—'}</Text><Text style={styles.posterCaption}>dias de recomeço.</Text></View>
          <Illustration name="sol" size={compact ? 64 : 86} height={compact ? 70 : 94} />
        </View>
        <View style={editorialStyles.row}><Text style={[textStyles.body, { flex: 1, fontSize: 14, lineHeight: 20 }]}>Não precisa ser perfeito.{'\n'}Só precisa ser seu.</Text><Flourish width={80} /></View>
      </Card>
      <View style={styles.stats}>
        <View style={[styles.stat, styles.moneyStat]}><Text accessibilityLabel={savings.value == null ? 'Economia acumulada indisponível' : `Economia estimada acumulada: ${formatCurrency(savings.value)}`} style={textStyles.value}>{savings.value == null ? '—' : formatCurrency(savings.value)}</Text><Text style={textStyles.muted}>economia estimada acumulada</Text><Text style={styles.coverage}>{coverageLabel(savings.coverage)}</Text></View>
        <View style={[styles.stat, styles.statBorder]}><Text style={textStyles.value}>{distinctCheckinDays(data?.registros || [])}</Text><Text style={textStyles.muted}>dias distintos com check-in</Text></View>
      </View>
      {hasPendingProgress ? <Card><Text accessibilityLiveRegion="polite" style={textStyles.body}>Há uma atualização de progresso aguardando sincronização. Recordes e conquistas mostram apenas dados já salvos.</Text></Card> : null}
      <View style={editorialStyles.rule} />
      <View style={editorialStyles.row}><Text style={textStyles.heading}>Seu cuidado de hoje</Text><Link href="/(app)/habits/new" asChild><Pressable accessibilityRole="button" accessibilityLabel="Adicionar hábito" style={styles.iconButton}><Plus color={colors.text} size={22} /></Pressable></Link></View>
      {!activeHabits.length ? <EmptyState title="Nenhum hábito ativo" body="Adicione ou reative um hábito para acompanhar sua evolução." /> : activeHabits.slice(0, 3).map(habit => (
        <Link key={habit.id} href={{ pathname: '/(app)/habits/[id]', params: { id: habit.id } }} asChild>
          <Pressable accessibilityRole="button" accessibilityLabel={`Ver jornada de ${habit.nome_vicio}`} style={styles.habit}>
            <View style={{ flex: 1, gap: spacing.xs }}><Text style={textStyles.heading}>{habit.nome_vicio}</Text><Text style={[textStyles.muted, { color: colors.text }]}>{habit.tempo_formatado || 'Sua jornada continua.'}</Text><Text style={[styles.coverage, { color: colors.text }]}>{habit.progresso?.pendente ? 'Pendente de sincronização' : currentStreak(habit).legacy ? 'Contador legado · histórico parcial' : coverageLabel(currentStreak(habit).coverage)}</Text></View>
            <View style={{ alignItems: 'flex-end', gap: 16 }}><View style={editorialStyles.pill}><Text accessibilityLabel={`Sequência atual: ${currentStreak(habit).value == null ? 'indisponível' : `${currentStreak(habit).value} dias`}`} style={styles.badge}>{currentStreak(habit).value ?? '—'} DIAS</Text></View><ArrowMark /></View>
          </Pressable>
        </Link>
      ))}
      <Text style={textStyles.body}>{completedGoals(data?.metas || [])} metas concluídas. <Text style={styles.note}>Tudo tem seu tempo.</Text></Text>
      <QuickCheckin />
      {data?.mensagem ? <Card style={{ backgroundColor: colors.sage }}><Text style={textStyles.body}>“{data.mensagem.mensagem}”</Text></Card> : null}
      <Text style={textStyles.muted}>Recorde e economia acumulada incluem o histórico dos hábitos arquivados.</Text>
      {isFetching ? <Text accessibilityLiveRegion="polite" style={textStyles.muted}>Sincronizando...</Text> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  iconButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  poster: { backgroundColor: colors.peach, borderWidth: 0, padding: 20, gap: 10, borderRadius: 28 },
  posterCaption: { ...textStyles.heading, fontSize: 18 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  stat: { flex: 1, minWidth: 90, gap: 4 },
  moneyStat: { flex: 2, minWidth: 170 },
  statBorder: { borderLeftWidth: 1, borderColor: colors.border, paddingLeft: 16 },
  coverage: { ...textStyles.muted, fontSize: 12, lineHeight: 18 },
  habit: { borderRadius: radius.lg, backgroundColor: colors.lavender, padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: 8 },
  badge: { ...editorialStyles.eyebrow, color: colors.text, letterSpacing: 0.3, fontSize: 10 },
  note: { ...editorialStyles.note, fontSize: 16, lineHeight: 23 },
});
