import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { achievementProgress } from '@/domain/achievements';
import { useBootstrap } from '@/features/bootstrap/use-bootstrap';
import { Card, LoadingState, Screen, textStyles } from '@/ui/components';
import { BackHeader, EditorialTitle, editorialStyles, SectionTabs, StatusCheck } from '@/ui/editorial';
import { Illustration, type IllustrationName } from '@/ui/illustration';
import { colors, radius } from '@/ui/theme';
import { coverageLabel, formatDate } from '@/domain/metrics';

const categories = [
  { value: 'streak', label: 'Sequência' },
  { value: 'savings', label: 'Economia' },
  { value: 'goals', label: 'Metas' },
  { value: 'consistency', label: 'Registros' },
] as const;
const artwork: Record<string, { name: IllustrationName; title: string }> = {
  'streak-1': { name: 'sequencia-porta', title: 'Primeiro passo' },
  'streak-7': { name: 'sequencia-aviao', title: 'Pegou o ritmo' },
  'streak-30': { name: 'sequencia-flor', title: 'Criando raízes' },
  'streak-90': { name: 'sequencia-horizonte', title: 'Novo horizonte' },
  'savings-50': { name: 'economia-moeda', title: 'Cada moeda conta' },
  'savings-100': { name: 'economia-envelope', title: 'Um cuidado guardado' },
  'savings-500': { name: 'economia-cofrinho', title: 'Novas possibilidades' },
  'savings-1000': { name: 'economia-tesouro', title: 'Seu tesouro' },
  'goals-1': { name: 'metas-bandeira', title: 'Primeira chegada' },
  'goals-5': { name: 'metas-escada', title: 'Um passo de cada vez' },
  'goals-10': { name: 'metas-constelacao', title: 'Novos caminhos' },
  'consistency-7': { name: 'registros-diario', title: 'Sua história começa' },
  'consistency-30': { name: 'registros-volumes', title: 'Páginas da sua jornada' },
};
const tones = { streak: colors.lavender, savings: colors.butter, goals: colors.peach, consistency: colors.sage };

export default function AchievementsScreen() {
  const router = useRouter();
  const { data, isLoading } = useBootstrap();
  const [category, setCategory] = useState<typeof categories[number]['value']>('streak');
  const badges = data ? achievementProgress(data) : [];
  const visible = badges.filter(badge => badge.categoryKey === category);
  const hasPendingProgress = data?.vicios.some(habit => habit.progresso?.pendente) || false;
  return <Screen>
    <BackHeader section="Conquistas" onBack={() => router.back()} />
    <EditorialTitle title="Cada passo" emphasis="merece ser visto." />
    {isLoading && !data ? <LoadingState /> : <>
      <Card style={{ backgroundColor: tones[category], borderWidth: 0 }}><View style={editorialStyles.row}><View style={{ flex: 1, gap: 8 }}><Text style={textStyles.heading}>{badges.filter(badge => badge.earned).length} de {badges.length} marcos alcançados</Text><Text style={textStyles.body}>O que você construiu segue com você.</Text></View><Illustration name="sol" size={58} /></View></Card>
      {hasPendingProgress ? <Card><Text accessibilityLiveRegion="polite" style={textStyles.body}>Há uma alteração pendente. Os marcos permanentes abaixo refletem apenas o histórico confirmado no servidor.</Text></Card> : null}
      <SectionTabs tabs={categories} selected={category} onSelect={setCategory} />
      {!data ? <Text style={textStyles.muted}>Sem dados disponíveis. Atualize sua jornada e tente novamente.</Text> : <>
        <Text style={textStyles.heading}>{categories.find(item => item.value === category)?.label}</Text>
        <Text style={textStyles.muted}>{visible.filter(badge => badge.earned).length} de {visible.length} nesta categoria{category === 'consistency' ? ' · contamos dias distintos com check-in.' : '.'}</Text>
        <View style={styles.collection}>
          {visible.map(badge => {
            const art = artwork[badge.id];
            const futureChapter = category === 'streak' && badge.target >= 180;
            return <Card key={badge.id} style={[styles.badge, futureChapter && styles.future]}>
              {art ? <View style={styles.art}><Illustration name={art.name} size={86} height={92} /></View> : null}
              {art ? <Text style={styles.expressiveTitle}>{art.title}</Text> : null}
              <Text accessibilityRole="header" style={styles.requirement}>{badge.label}</Text>
              <View style={editorialStyles.row}>
                <Text accessibilityLabel={`${badge.label}: ${badge.earned ? 'conquista permanente' : badge.legacyHistory ? 'histórico permanente indisponível neste snapshot antigo' : badge.unavailable ? 'histórico indisponível' : 'próximo marco'}. ${badge.unavailable ? 'Sem dados suficientes.' : `${Math.floor(badge.current ?? 0)} de ${badge.target}.`}`} style={[textStyles.body, { flex: 1, fontSize: 14 }]}>
                  {badge.earned ? 'Conquista permanente' : badge.legacyHistory ? 'Histórico permanente indisponível neste snapshot antigo' : badge.unavailable ? 'Histórico indisponível' : `Próximo marco: ${Math.floor(badge.current ?? 0)} de ${badge.target}`}
                </Text>
                {badge.earned ? <StatusCheck /> : null}
              </View>
              {badge.award ? <Text style={styles.award}>Reconhecido em {formatDate(badge.award.awarded_at)} · {badge.award.origem === 'legacy' ? 'registro legado' : badge.award.origem === 'snapshot_observation' ? 'reconhecido na sincronização' : 'período confirmado'} · {coverageLabel(badge.award.cobertura)}.</Text> : null}
              {!badge.unavailable && !badge.earned ? <View accessibilityRole="progressbar" accessibilityLabel={`${badge.label}. Progresso atual`} accessibilityValue={{ min: 0, max: 100, now: Math.round(badge.percent) }} style={styles.track}><View style={[styles.fill, { width: `${badge.percent}%` }]} /></View> : null}
            </Card>;
          })}
        </View>
      </>}
    </>}
  </Screen>;
}

const styles = StyleSheet.create({
  collection: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  badge: { flexBasis: '46%', flexGrow: 1, minWidth: 130, borderRadius: radius.md, padding: 14, gap: 10 },
  future: { flexBasis: '100%', backgroundColor: 'transparent' },
  art: { alignItems: 'center' },
  expressiveTitle: { ...textStyles.body, fontWeight: '700', textAlign: 'center' },
  requirement: { ...textStyles.muted, fontSize: 12, textAlign: 'center' },
  award: { ...textStyles.muted, fontSize: 11, lineHeight: 16 },
  track: { height: 6, backgroundColor: colors.border, borderRadius: 3 },
  fill: { height: 6, backgroundColor: colors.primary, borderRadius: 3 },
});
