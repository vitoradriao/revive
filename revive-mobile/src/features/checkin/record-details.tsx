import React from 'react';
import { Text, View } from 'react-native';
import type { DailyRecord } from '@/domain/types';
import { displayDate } from '@/domain/formats';
import { textStyles } from '@/ui/components';
import { spacing } from '@/ui/theme';

export function RecordDetails({ record }: { record: DailyRecord }) {
  return <View style={{ gap: spacing.xs }}>
    <Text style={textStyles.body}>Check-in: {record.humor || 'Sem humor informado'}</Text>
    <Text style={textStyles.muted}>{displayDate(record.data_registro)} · {record.pending ? 'Salvo no aparelho · aguardando sincronização' : 'Sincronizado'}</Text>
    {record.sync_error ? <Text accessibilityLiveRegion="polite" style={textStyles.body}>Correção pendente: {record.sync_error.replace(/^REVISAO_CONFLITO: /, '')}</Text> : null}
    {record.gatilhos ? <Text style={textStyles.body}>Gatilhos: {record.gatilhos}</Text> : null}
    {record.conquistas ? <Text style={textStyles.body}>Conquistas: {record.conquistas}</Text> : null}
    {record.observacoes ? <Text style={textStyles.body}>Observações: {record.observacoes}</Text> : null}
  </View>;
}
