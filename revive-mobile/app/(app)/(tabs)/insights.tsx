import React from 'react';
import { useRouter } from 'expo-router';
import { Alert, Text, View } from 'react-native';
import { useBootstrap } from '@/features/bootstrap/use-bootstrap';
import { accountAccumulatedSavings, accountCurrentStreak, accountRecordHolder, completedGoals, coverageLabel, currentStreak, distinctCheckinDays, formatCurrency, moodDistribution } from '@/domain/metrics';
import { AppButton, Card, LoadingState, PageTitle, Screen, textStyles } from '@/ui/components';
import { spacing } from '@/ui/theme';
import { printSummary } from '@/core/export/reporting';

export default function InsightsScreen() {
  const router = useRouter();
  const { data, isLoading } = useBootstrap();
  if (isLoading && !data) return <Screen scroll={false}><LoadingState /></Screen>;
  if (!data) return <Screen><PageTitle title="Insights" subtitle="Sem dados disponíveis." /></Screen>;
  const currentLeader = accountCurrentStreak(data.vicios);
  const recordHolder = accountRecordHolder(data.vicios);
  const accumulatedSavings = accountAccumulatedSavings(data.vicios);
  const hasPendingProgress = data.vicios.some((habit) => habit.progresso?.pendente);
  return (
    <Screen>
      <PageTitle title="Insights" subtitle="Indicadores calculados a partir da sua jornada." />
      <Text style={textStyles.muted}>Sequência atual: somente hábitos ativos. Recorde, economia acumulada, registros e conquistas incluem hábitos arquivados.</Text>
      {hasPendingProgress ? <Card><Text accessibilityLiveRegion="polite" style={textStyles.body}>Há uma atualização de progresso aguardando sincronização. Marcos permanentes só aparecem depois da confirmação do servidor.</Text></Card> : null}
      <AppButton title="Calendário" variant="secondary" onPress={() => router.push('/(app)/calendar')} />
      <AppButton title="Conquistas" variant="secondary" onPress={() => router.push('/(app)/achievements')} />
      <Card>
        <Text style={textStyles.muted}>Sequência atual mais longa</Text>
        <Text accessibilityLabel={currentLeader ? `${currentLeader.nome_vicio}: ${currentStreak(currentLeader).value} dias atuais` : 'Sequência atual indisponível por histórico parcial'} style={textStyles.value}>
          {currentLeader ? `${currentStreak(currentLeader).value} dias` : 'Indisponível'}
        </Text>
        <Text style={textStyles.body}>{currentLeader?.nome_vicio || 'Atualize o histórico para identificar a sequência atual.'}</Text>
      </Card>
      <Card>
        <Text style={textStyles.muted}>Recorde histórico</Text>
        <Text accessibilityLabel={recordHolder ? `${recordHolder.nome_vicio}: recorde de ${recordHolder.progresso?.recorde_dias} dias` : 'Recorde histórico indisponível'} style={textStyles.value}>
          {recordHolder?.progresso?.recorde_dias == null ? 'Indisponível' : `${recordHolder.progresso.recorde_dias} dias`}
        </Text>
        <Text style={textStyles.body}>{recordHolder?.nome_vicio || 'Cobertura incompleta ou snapshot legado'}</Text>
      </Card>
      <Card>
        <Text style={textStyles.muted}>Economia estimada acumulada</Text>
        <Text accessibilityLabel={accumulatedSavings.value == null ? 'Economia acumulada indisponível' : `Economia estimada acumulada: ${formatCurrency(accumulatedSavings.value)}`} style={textStyles.value}>
          {accumulatedSavings.value == null ? 'Indisponível' : formatCurrency(accumulatedSavings.value)}
        </Text>
        <Text style={textStyles.muted}>{coverageLabel(accumulatedSavings.coverage)}</Text>
      </Card>
      <Card><Text style={textStyles.muted}>Dias distintos com check-in</Text><Text accessibilityLabel={`${distinctCheckinDays(data.registros)} dias distintos com check-in`} style={textStyles.value}>{distinctCheckinDays(data.registros)} dias</Text></Card>
      <Card><Text style={textStyles.muted}>Metas concluídas</Text><Text style={textStyles.value}>{completedGoals(data.metas)}</Text></Card>
      <Card><Text style={textStyles.heading}>Distribuição de humor</Text><View style={{ gap: spacing.sm }}>{moodDistribution(data).map(([mood, count]) => <Text key={mood} style={textStyles.body}>{mood}: {count}</Text>)}</View></Card>
      <Card><Text style={textStyles.heading}>Recaídas registradas</Text><Text style={textStyles.value}>{data.recaidas.length}</Text></Card>
      <Card>
        <Text style={textStyles.heading}>Relatórios e dados</Text>
        <Text style={textStyles.muted}>Arquivos exportados podem conter informações pessoais. Compartilhe apenas com quem você confia.</Text>
        <AppButton title="Exportar dados selecionados" onPress={() => router.push('/(app)/export')} />
        <AppButton title="Imprimir resumo da jornada" variant="secondary" onPress={() => void printSummary(data).catch((error) => Alert.alert('Relatório', error.message))} />
      </Card>
    </Screen>
  );
}
