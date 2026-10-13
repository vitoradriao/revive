import React from 'react';
import { Text, View } from 'react-native';
import type { UrgeEvent } from '@/domain/types';
import { displayZonedMoment, deviceTimezone } from '@/domain/urge-time';
import { urgeTriggerLabel } from '@/domain/urge-triggers';
import { textStyles } from '@/ui/components';
import { spacing } from '@/ui/theme';

export function UrgeDetails({ event, timezone = deviceTimezone() }: { event: UrgeEvent; timezone?: string }) {
  return <View style={{ gap: spacing.sm }}>
    <Text accessibilityRole="header" style={textStyles.heading}>Vontade registrada</Text>
    <Text style={textStyles.body}>Intensidade: {event.intensidade} de 10</Text>
    <Text style={textStyles.muted}>{displayZonedMoment(event.occurred_at, timezone)} · {timezone}</Text>
    {event.timezone !== timezone ? <Text style={textStyles.muted}>Fuso salvo no registro: {event.timezone}</Text> : null}
    <Text accessibilityLiveRegion="polite" style={textStyles.body}>{event.sync_error ? `Falha de sincronização: ${event.sync_error}` : event.pending ? 'Salvo no aparelho · aguardando sincronização' : 'Sincronizado'}</Text>
    <Text style={textStyles.body}>Gatilhos: {event.gatilhos.length ? event.gatilhos.map(urgeTriggerLabel).join(', ') : 'Não informados'}</Text>
    {event.nota ? <Text style={textStyles.body}>Nota: {event.nota}</Text> : null}
    {event.acao_realizada ? <Text style={textStyles.body}>Ação realizada: {event.acao_realizada}</Text> : null}
    {event.resultado ? <Text style={textStyles.body}>Resultado: {event.resultado}</Text> : null}
  </View>;
}
