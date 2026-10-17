import React, { useState } from 'react';
import { useRouter } from 'expo-router';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { FileJson, FileSpreadsheet, Printer } from 'lucide-react-native';
import { useBootstrap } from '@/features/bootstrap/use-bootstrap';
import { accountAccumulatedSavings, accountCurrentStreak, accountRecordHolder, completedGoals, coverageLabel, currentStreak, distinctCheckinDays, formatCurrency, moodDistribution } from '@/domain/metrics';
import { AppButton, Card, DataUnavailable, LoadingState, Screen, textStyles } from '@/ui/components';
import { ActionRow, AppHeader, EditorialTitle, editorialStyles, Flourish, SectionTabs } from '@/ui/editorial';
import { Illustration } from '@/ui/illustration';
import { colors } from '@/ui/theme';
import { shareCsv, shareJson, printSummary } from '@/core/export/reporting';

const tabs = [{ value: 'overview', label: 'Visão geral' }, { value: 'reports', label: 'Relatórios' }] as const;

export default function InsightsScreen() {
  const router = useRouter();
  const { data, isLoading, refetch } = useBootstrap();
  const [tab, setTab] = useState<'overview' | 'reports'>('overview');
  if (isLoading && !data) return <Screen scroll={false}><LoadingState /></Screen>;
  if (!data) return <Screen><AppHeader section="Insights" /><EditorialTitle title="Seu caminho," emphasis="no seu tempo." /><DataUnavailable onRetry={() => void refetch()} /></Screen>;
  const currentLeader = accountCurrentStreak(data.vicios);
  const recordHolder = accountRecordHolder(data.vicios);
  const accumulatedSavings = accountAccumulatedSavings(data.vicios);
  const hasPendingProgress = data.vicios.some(habit => habit.progresso?.pendente);
  const moods = moodDistribution(data);
  const dominantMood = moods[0];
  return (
    <Screen>
      <AppHeader section="Insights" />
      <EditorialTitle title={tab === 'overview' ? 'Olha só o seu' : 'Essa história'} emphasis={tab === 'overview' ? 'caminho.' : 'é sua.'} />
      <SectionTabs tabs={tabs} selected={tab} onSelect={setTab} />
      {hasPendingProgress ? <Card><Text accessibilityLiveRegion="polite" style={textStyles.body}>Há uma atualização de progresso aguardando sincronização. Marcos permanentes só aparecem depois da confirmação do servidor.</Text></Card> : null}
      {tab === 'overview' ? <>
        <View style={editorialStyles.row}>
          <View style={{ flex: 1 }}><Text style={editorialStyles.eyebrow}>RECORDE HISTÓRICO</Text><Text accessibilityLabel={recordHolder ? `${recordHolder.nome_vicio}: recorde de ${recordHolder.progresso?.recorde_dias} dias` : 'Recorde histórico indisponível'} style={editorialStyles.largeValue}>{recordHolder?.progresso?.recorde_dias ?? '—'}</Text><Text style={editorialStyles.note}>dias</Text></View>
          <Illustration name="caminho" size={82} height={116} />
        </View>
        <Text style={textStyles.muted}>{recordHolder?.nome_vicio || 'Cobertura incompleta ou snapshot legado'}</Text>
        <Text accessibilityLabel={currentLeader ? `${currentLeader.nome_vicio}: ${currentStreak(currentLeader).value} dias atuais` : 'Sequência atual indisponível por histórico parcial'} style={textStyles.muted}>Sequência atual mais longa: {currentLeader ? `${currentStreak(currentLeader).value} dias · ${currentLeader.nome_vicio}` : 'indisponível'}</Text>
        <View style={editorialStyles.rule} />
        <View style={styles.stats}>
          <View style={[styles.stat, styles.moneyStat]}><Text accessibilityLabel={accumulatedSavings.value == null ? 'Economia acumulada indisponível' : `Economia estimada acumulada: ${formatCurrency(accumulatedSavings.value)}`} style={textStyles.value}>{accumulatedSavings.value == null ? '—' : formatCurrency(accumulatedSavings.value)}</Text><Text style={textStyles.muted}>economia estimada acumulada</Text><Text style={textStyles.muted}>{coverageLabel(accumulatedSavings.coverage)}</Text></View>
          <View style={styles.stat}><Text style={textStyles.value}>{completedGoals(data.metas)}</Text><Text style={textStyles.muted}>metas concluídas</Text></View>
        </View>
        <Card style={{ backgroundColor: colors.butter, borderWidth: 0 }}>
          <Text style={[editorialStyles.eyebrow, { color: colors.text }]}>HUMOR NOS REGISTROS</Text>
          <View style={editorialStyles.row}><View style={{ flex: 1 }}><Text style={textStyles.value}>{dominantMood?.[0] || 'Cada dia conta.'}</Text><Text style={textStyles.body}>{dominantMood ? `${dominantMood[1]} de ${data.registros.length} registros` : 'Seus check-ins aparecerão aqui.'}</Text></View><Illustration name="sol" size={72} /></View>
          {dominantMood ? <View accessibilityRole="progressbar" accessibilityLabel={`Frequência de humor ${dominantMood[0]}`} accessibilityValue={{ min: 0, max: 100, now: Math.round(dominantMood[1] / data.registros.length * 100) }} style={styles.track}><View style={[styles.fill, { width: `${dominantMood[1] / data.registros.length * 100}%` }]} /></View> : null}
          {moods.length > 1 ? <View style={{ gap: 4 }}>{moods.slice(1).map(([mood, count]) => <Text key={mood} style={textStyles.body}>{mood}: {count}</Text>)}</View> : null}
        </Card>
        <View style={editorialStyles.row}><Text style={[textStyles.muted, { flex: 1 }]}>Dias distintos com check-in</Text><Text accessibilityLabel={`${distinctCheckinDays(data.registros)} dias distintos com check-in`} style={textStyles.value}>{distinctCheckinDays(data.registros)}</Text></View>
        <View style={editorialStyles.rule} />
        <View style={editorialStyles.row}><Text style={textStyles.muted}>Recaídas registradas</Text><Text style={textStyles.value}>{data.recaidas.length}</Text></View>
        <View style={styles.stats}><View style={styles.stat}><AppButton title="Calendário" variant="secondary" onPress={() => router.push('/(app)/calendar')} /></View><View style={styles.stat}><AppButton title="Conquistas" variant="secondary" onPress={() => router.push('/(app)/achievements')} /></View></View>
      </> : <>
        <Card style={styles.postcard}>
          <Text style={[editorialStyles.eyebrow, { color: colors.text }]}>UM RETRATO DO CAMINHO</Text>
          <View style={editorialStyles.row}><View style={{ flex: 1, gap: 8 }}><Text style={textStyles.value}>{recordHolder?.progresso?.recorde_dias ?? '—'} dias de recorde</Text><Text style={textStyles.heading}>{accumulatedSavings.value == null ? 'Economia indisponível' : formatCurrency(accumulatedSavings.value)}</Text><Text style={textStyles.body}>economia estimada acumulada</Text></View><Illustration name="economia-envelope" size={76} /></View>
          <Flourish width={72} />
        </Card>
        <Text style={textStyles.heading}>Leve seu progresso com você.</Text>
        <View>
          <ActionRow title="Compartilhar CSV" subtitle="Para abrir em planilhas" icon={<FileSpreadsheet color={colors.text} size={21} />} onPress={() => void shareCsv(data).catch(error => Alert.alert('Exportação', error.message))} />
          <ActionRow title="Compartilhar JSON" subtitle="Uma cópia dos seus dados" tone={colors.sage} icon={<FileJson color={colors.text} size={21} />} onPress={() => void shareJson(data).catch(error => Alert.alert('Exportação', error.message))} />
          <ActionRow title="Imprimir resumo" subtitle="Sua jornada em um documento" tone={colors.butter} icon={<Printer color={colors.text} size={21} />} onPress={() => void printSummary(data).catch(error => Alert.alert('Relatório', error.message))} />
        </View>
        <Text style={textStyles.muted}>Arquivos exportados podem conter informações pessoais. Compartilhe apenas com quem você confia.</Text>
      </>}
      <Text style={textStyles.muted}>Sequência atual: somente hábitos ativos. Recorde, economia acumulada, registros e conquistas incluem hábitos arquivados.</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  stat: { flex: 1, minWidth: 90, gap: 4 },
  moneyStat: { flex: 2, minWidth: 170 },
  track: { height: 5, borderRadius: 3, backgroundColor: colors.background, marginTop: 8 },
  fill: { height: 5, borderRadius: 3, backgroundColor: colors.text },
  postcard: { backgroundColor: colors.peach, borderWidth: 0, borderRadius: 10, padding: 20, gap: 16 },
});
