import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { DailyRecord } from '@/domain/types';
import { displayDate } from '@/domain/formats';
import { editorialStyles } from '@/ui/editorial';
import { Illustration, type IllustrationName } from '@/ui/illustration';
import { textStyles } from '@/ui/components';
import { colors, radius } from '@/ui/theme';

const moods: Record<string, IllustrationName> = { Bem: 'humor-bem', Confiante: 'humor-confiante', Ansioso: 'humor-ansioso', Desanimado: 'humor-desanimado' };

export function RecordTimeline({ records, onOpen, habitLabel }: { records: DailyRecord[]; onOpen: (record: DailyRecord) => void; habitLabel?: (id: string) => string }) {
  return <View style={styles.list}>{records.map((record, index) => <View key={record.id} style={styles.entry}>
    <View style={styles.rail} accessible={false}><View style={styles.dot} />{index < records.length - 1 ? <View style={styles.line} /> : null}</View>
    <Pressable accessibilityRole="button" accessibilityLabel={`Abrir registro de ${displayDate(record.data_registro)}: ${record.humor || 'sem humor informado'}`} accessibilityHint="Consulte os detalhes e corrija este registro." onPress={() => onOpen(record)} style={({ pressed }) => [styles.card, { backgroundColor: index % 2 ? colors.lavender : colors.butter }, pressed && { opacity: 0.75 }]}>
      <View style={editorialStyles.row}><Text style={styles.eyebrow}>CHECK-IN</Text><Text style={styles.date}>{displayDate(record.data_registro)}</Text></View>
      {habitLabel ? <Text style={styles.detail}>{habitLabel(record.vicio_id)}</Text> : null}
      <View style={editorialStyles.row}><Text accessibilityLabel={`Check-in: ${record.humor || 'Sem humor informado'}`} style={styles.mood}>{record.humor || 'Sem humor informado'}</Text><Illustration name={moods[record.humor || ''] || 'sol'} size={40} /></View>
      {record.gatilhos ? <Text style={styles.detail}>Gatilhos: {record.gatilhos}</Text> : null}
      {record.conquistas ? <Text style={styles.detail}>Conquistas: {record.conquistas}</Text> : null}
      {record.observacoes ? <Text style={styles.detail}>Observações: {record.observacoes}</Text> : null}
      {!record.gatilhos && !record.conquistas && !record.observacoes ? <Text style={styles.detail}>Um registro da sua jornada.</Text> : null}
      {record.pending ? <Text style={styles.status}>Salvo no aparelho · aguardando sincronização</Text> : null}
      {record.sync_error ? <Text accessibilityLiveRegion="polite" style={styles.status}>Correção pendente: {record.sync_error.replace(/^REVISAO_CONFLITO: /, '')}</Text> : null}
    </Pressable>
  </View>)}</View>;
}

const styles = StyleSheet.create({
  list: { gap: 18 },
  entry: { flexDirection: 'row', gap: 12 },
  rail: { width: 12, alignItems: 'center', paddingTop: 22 },
  dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.primary },
  line: { flex: 1, width: 1, backgroundColor: colors.border, marginTop: 4, marginBottom: -36 },
  card: { flex: 1, minWidth: 0, borderRadius: radius.lg, padding: 16, gap: 12 },
  eyebrow: { ...editorialStyles.eyebrow, fontSize: 9, color: colors.text },
  date: { ...textStyles.muted, color: colors.text, fontSize: 11 },
  mood: { ...textStyles.heading, flex: 1 },
  detail: { ...textStyles.body, fontSize: 13, lineHeight: 19 },
  status: { ...textStyles.body, fontSize: 12, fontWeight: '700', lineHeight: 18 },
});
