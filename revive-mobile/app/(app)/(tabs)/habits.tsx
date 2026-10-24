import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Link } from 'expo-router';
import { Plus } from 'lucide-react-native';
import { useBootstrap } from '@/features/bootstrap/use-bootstrap';
import { coverageLabel, currentStreak, formatCurrency, sequenceSavings } from '@/domain/metrics';
import { AppButton, DataUnavailable, EmptyState, LoadingState, Screen, textStyles } from '@/ui/components';
import { AppHeader, ArrowMark, EditorialTitle, editorialStyles } from '@/ui/editorial';
import { Illustration } from '@/ui/illustration';
import { colors, radius, spacing } from '@/ui/theme';

export default function HabitsScreen() {
  const { data, isLoading, error, refetch } = useBootstrap();
  const [archived, setArchived] = useState(false);
  const habits = (data?.vicios || []).filter(habit => (habit.ativo === false) === archived);
  if (isLoading && !data) return <Screen scroll={false}><LoadingState /></Screen>;
  if (error && !data) return <Screen><AppHeader section="Hábitos" /><DataUnavailable onRetry={() => void refetch()} /></Screen>;
  return (
    <Screen>
      <AppHeader section="Hábitos" />
      <View style={editorialStyles.row}><EditorialTitle title="Há espaço" emphasis="para mudar." /><Link href="/(app)/habits/new" asChild><Pressable accessibilityRole="button" accessibilityLabel="Adicionar hábito" style={styles.add}><Plus color={colors.background} /></Pressable></Link></View>
      <Text style={editorialStyles.eyebrow}>{habits.length} {archived ? habits.length === 1 ? 'HÁBITO ARQUIVADO' : 'HÁBITOS ARQUIVADOS' : habits.length === 1 ? 'HÁBITO EM ACOMPANHAMENTO' : 'HÁBITOS EM ACOMPANHAMENTO'}</Text>
      {!habits.length ? <EmptyState title={archived ? 'Nenhum hábito arquivado' : 'Nenhum hábito ativo'} body={archived ? 'Os hábitos arquivados aparecerão aqui.' : 'Cadastre ou reative um hábito para começar.'} /> : habits.map((habit, index) => (
        <Link key={habit.id} href={{ pathname: '/(app)/habits/[id]', params: { id: habit.id } }} asChild>
          <Pressable accessibilityRole="button" accessibilityLabel={`Ver jornada de ${habit.nome_vicio}`} style={[styles.item, { backgroundColor: index % 2 ? colors.sage : colors.lavender }]}>
            <View style={editorialStyles.pill}><Text style={styles.badge}>SUA JORNADA</Text></View>
            <Text style={styles.habitName}>{habit.nome_vicio}</Text>
            {archived ? <Text style={[textStyles.muted, { color: colors.text }]}>Arquivado · histórico preservado</Text> : null}
            <View style={editorialStyles.row}><View style={{ flex: 1 }}><Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5} style={editorialStyles.largeValue}>{currentStreak(habit).value ?? '—'}</Text><Text style={textStyles.body}>dias{habit.tempo_formatado ? ` · ${habit.tempo_formatado}` : ''}</Text></View><Illustration name="caminho" size={74} height={110} /></View>
            <Text style={[textStyles.muted, { color: colors.text }]}>{habit.progresso?.pendente ? 'Progresso pendente de sincronização' : currentStreak(habit).legacy ? 'Contador legado · histórico parcial' : coverageLabel(currentStreak(habit).coverage)}</Text>
            <View style={editorialStyles.rule} />
            <Text style={textStyles.body}>{sequenceSavings(habit).value == null ? 'Economia indisponível' : `${formatCurrency(sequenceSavings(habit).value)} de economia estimada na sequência`}</Text>
            <View style={styles.journeyButton}><Text style={styles.journeyLink}>Ver minha jornada</Text><ArrowMark color={colors.background} /></View>
          </Pressable>
        </Link>
      ))}
      <View style={styles.encouragement}><Illustration name="sol" size={68} /><Text style={[editorialStyles.note, { flex: 1 }]}>Um passo já{`\n`}é um começo.</Text></View>
      <Link href="/(app)/habits/new" asChild><AppButton title="Adicionar um hábito" variant="secondary" /></Link>
      <AppButton title={archived ? 'Mostrar hábitos ativos' : 'Mostrar hábitos arquivados'} variant="secondary" onPress={() => setArchived(!archived)} />
      {archived ? <Text style={[textStyles.muted, { color: colors.text }]}>Arquivados: histórico, metas e conquistas preservados.</Text> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  add: { width: 48, height: 48, borderRadius: radius.pill, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  item: { borderRadius: 28, padding: 20, gap: spacing.sm },
  badge: { ...editorialStyles.eyebrow, fontSize: 10, letterSpacing: 0.3, color: colors.text },
  habitName: { ...textStyles.heading, fontSize: 30, letterSpacing: -1 },
  journeyLink: { ...textStyles.body, color: colors.background, flex: 1, fontSize: 14, fontWeight: '700' },
  journeyButton: { ...editorialStyles.row, minHeight: 48, backgroundColor: colors.text, borderRadius: radius.pill, paddingHorizontal: 16, paddingVertical: 12 },
  encouragement: { flexDirection: 'row', alignItems: 'center', gap: 20, paddingVertical: 12 },
});
