import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { achievementProgress } from '@/domain/achievements';
import { useBootstrap } from '@/features/bootstrap/use-bootstrap';
import { Card, DataUnavailable, LoadingState, Screen, textStyles } from '@/ui/components';
import { BackHeader, Disclosure, EditorialTitle, editorialStyles, SectionTabs, StatusCheck } from '@/ui/editorial';
import { Illustration, type IllustrationName } from '@/ui/illustration';
import { colors } from '@/ui/theme';
import { coverageLabel, formatCurrency, formatDate } from '@/domain/metrics';

const categories = [
  { value: 'streak', label: 'Sequência' }, { value: 'savings', label: 'Economia' },
  { value: 'goals', label: 'Metas' }, { value: 'consistency', label: 'Registros' },
] as const;
type Category = typeof categories[number]['value'];
type Badge = ReturnType<typeof achievementProgress>[number];
const presentation: Record<Category, { title: string; emphasis: string; unit: string; tone: string; art: IllustrationName; footer: string }> = {
  streak: { title: 'O tempo também', emphasis: 'conta histórias.', unit: 'dias consecutivos', tone: colors.peach, art: 'sol', footer: 'Um passo de cada vez.' },
  savings: { title: 'Seu cuidado', emphasis: 'abre possibilidades.', unit: 'economia estimada acumulada', tone: colors.butter, art: 'economia-envelope', footer: 'O cuidado abre possibilidades.' },
  goals: { title: 'Planos de hoje.', emphasis: 'Conquistas de amanhã.', unit: 'metas concluídas', tone: colors.lavender, art: 'caminho', footer: 'Cada plano tem seu tempo.' },
  consistency: { title: 'Voltar para si', emphasis: 'também é cuidado.', unit: 'dias distintos com check-in', tone: colors.sage, art: 'registros-volumes', footer: 'Uma página de cada vez.' },
};
const artwork: Record<string, { name: IllustrationName; title: string }> = {
  'streak-1': { name: 'sequencia-porta', title: 'Primeiro passo' },
  'streak-7': { name: 'sequencia-aviao', title: 'Pegou o ritmo' },
  'streak-30': { name: 'sequencia-flor', title: 'Criando raízes' },
  'streak-90': { name: 'sequencia-horizonte', title: 'Novo horizonte' },
  'savings-50': { name: 'economia-moeda', title: 'Primeira reserva' },
  'savings-100': { name: 'economia-envelope', title: 'Cuidar do amanhã' },
  'savings-500': { name: 'economia-cofrinho', title: 'Mais possibilidades' },
  'savings-1000': { name: 'economia-tesouro', title: 'Seu tesouro' },
  'goals-1': { name: 'metas-bandeira', title: 'Primeiro compromisso' },
  'goals-5': { name: 'metas-escada', title: 'Passo após passo' },
  'goals-10': { name: 'metas-constelacao', title: 'Um céu de planos' },
  'consistency-7': { name: 'registros-diario', title: 'Páginas de cuidado' },
  'consistency-30': { name: 'registros-volumes', title: 'Histórias que ficam' },
};

function BadgeProgress({ badge }: { badge: Badge }) {
  return <View style={{ gap: 7 }}>
    <View style={editorialStyles.row}>
      <Text accessibilityLabel={`${badge.label}: ${badge.earned ? 'conquista permanente' : badge.legacyHistory ? 'histórico permanente indisponível neste snapshot antigo' : badge.unavailable ? 'histórico indisponível' : 'próximo marco'}. ${badge.unavailable ? 'Sem dados suficientes.' : `${Math.floor(badge.current ?? 0)} de ${badge.target}.`}`} style={[styles.status, { flex: 1 }]}>
        {badge.earned ? 'Conquista permanente' : badge.legacyHistory ? 'Histórico permanente indisponível neste snapshot antigo' : badge.unavailable ? 'Histórico indisponível' : `Próximo marco: ${Math.floor(badge.current ?? 0)} de ${badge.target}`}
      </Text>
      {badge.earned ? <StatusCheck /> : null}
    </View>
    {!badge.unavailable && !badge.earned ? <>
      <View accessibilityRole="progressbar" accessibilityLabel={`${badge.label}. Progresso atual`} accessibilityValue={{ min: 0, max: 100, now: Math.round(badge.percent) }} style={styles.track}><View style={[styles.fill, { width: `${badge.percent}%` }]} /></View>
      {badge.categoryKey === 'consistency' ? <Text style={styles.status}>{Math.round(badge.percent)}% do marco</Text> : null}
    </> : null}
  </View>;
}

export default function AchievementsScreen() {
  const router = useRouter();
  const { data, isLoading, refetch } = useBootstrap();
  const [category, setCategory] = useState<Category>('streak');
  const badges = data ? achievementProgress(data) : [];
  const visible = badges.filter(badge => badge.categoryKey === category);
  const current = visible[0]?.current;
  const view = presentation[category];
  const hasPendingProgress = data?.vicios.some(habit => habit.progresso?.pendente) || false;
  const grid = category === 'streak' || category === 'savings';
  const illustrated = visible.filter(badge => artwork[badge.id]);
  const future = visible.filter(badge => !artwork[badge.id]);
  return <Screen>
    <BackHeader section="Conquistas" onBack={() => router.back()} />
    <EditorialTitle title={view.title} emphasis={view.emphasis} compact />
    {isLoading && !data ? <LoadingState /> : !data ? <DataUnavailable onRetry={() => void refetch()} /> : <>
      <Text style={styles.total}>{badges.filter(badge => badge.earned).length} de {badges.length} marcos alcançados</Text>
      <Card style={{ backgroundColor: view.tone, borderWidth: 0 }}>
        <View style={editorialStyles.row}><View style={{ flex: 1, gap: 6 }}><Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5} accessibilityLabel={`Progresso atual: ${current == null ? 'indisponível' : category === 'savings' ? formatCurrency(current) : current}`} style={styles.summaryValue}>{current == null ? '—' : category === 'savings' ? formatCurrency(current) : current}</Text><Text style={styles.summaryUnit}>{view.unit}</Text></View><Illustration name={view.art} size={52} height={60} /></View>
        <Text style={styles.summaryUnit}>{visible.filter(badge => badge.earned).length} de {visible.length} marcos nesta categoria</Text>
      </Card>
      {hasPendingProgress ? <Card><Text accessibilityLiveRegion="polite" style={textStyles.body}>Há uma alteração pendente. Os marcos permanentes abaixo refletem apenas o histórico confirmado no servidor.</Text></Card> : null}
      <SectionTabs tabs={categories} selected={category} onSelect={setCategory} variant="pill" />
      <View style={grid ? styles.collection : styles.rows}>
        {illustrated.map(badge => {
          const art = artwork[badge.id];
          if (!art) return null;
          return <View key={badge.id} style={grid ? styles.badge : styles.rowBadge}>
            <View style={grid ? styles.art : styles.rowArt}><Illustration name={art.name} size={grid ? 88 : 70} height={grid ? 94 : 78} /></View>
            <View style={[{ gap: 8 }, !grid && { flex: 1, minWidth: 0 }]}>
              <Text style={[styles.expressiveTitle, grid && { textAlign: 'center' }]}>{art.title}</Text>
              <Text accessibilityRole="header" style={[styles.requirement, grid && { textAlign: 'center' }]}>{badge.label}</Text>
              <BadgeProgress badge={badge} />
            </View>
          </View>;
        })}
      </View>
      {future.length ? <Card><Text style={styles.total}>PRÓXIMOS CAPÍTULOS</Text>{future.map(badge => <View key={badge.id} style={{ gap: 8, paddingVertical: 8 }}><Text accessibilityRole="header" style={textStyles.body}>{badge.label}</Text><BadgeProgress badge={badge} /></View>)}</Card> : null}
      <Text style={styles.footer}>{view.footer}</Text>
      {category === 'consistency' ? <Text style={textStyles.muted}>Contamos dias distintos com check-in. Mais de um registro no mesmo dia continua valendo um dia.</Text> : null}
      {visible.some(badge => badge.award) ? <Disclosure title="Reconhecimentos permanentes">{visible.filter(badge => badge.award).map(badge => <Text key={badge.id} style={textStyles.muted}>{badge.label}: Reconhecido em {formatDate(badge.award!.awarded_at)} · {badge.award!.origem === 'legacy' ? 'registro legado' : badge.award!.origem === 'snapshot_observation' ? 'reconhecido na sincronização' : 'período confirmado'} · {coverageLabel(badge.award!.cobertura)}.</Text>)}</Disclosure> : null}
    </>}
  </Screen>;
}

const styles = StyleSheet.create({
  total: { ...editorialStyles.eyebrow, color: colors.primary, fontSize: 10, letterSpacing: 0.6 },
  summaryValue: { ...textStyles.value, fontSize: 34, letterSpacing: -1 },
  summaryUnit: { ...textStyles.body, fontSize: 12, lineHeight: 18 },
  collection: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 16, rowGap: 24 },
  badge: { flexBasis: '44%', flexGrow: 1, minWidth: 120, gap: 8 },
  rows: { gap: 26 },
  rowBadge: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 8 },
  rowArt: { alignSelf: 'flex-start' },
  art: { alignItems: 'center' },
  expressiveTitle: { ...textStyles.body, fontSize: 15, fontWeight: '700' },
  requirement: { ...textStyles.muted, fontSize: 11, lineHeight: 17 },
  status: { ...textStyles.muted, fontSize: 11, lineHeight: 17 },
  track: { height: 5, backgroundColor: colors.border, borderRadius: 3 },
  fill: { height: 5, backgroundColor: colors.primary, borderRadius: 3 },
  footer: { ...editorialStyles.note, fontSize: 18, textAlign: 'center', marginVertical: 8 },
});
