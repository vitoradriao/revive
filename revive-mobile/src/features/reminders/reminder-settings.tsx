import React, { useState } from 'react';
import { Linking, Switch, Text, View } from 'react-native';
import { AppButton, Card, Field, textStyles } from '@/ui/components';
import { colors, spacing } from '@/ui/theme';
import { Disclosure, editorialStyles } from '@/ui/editorial';
import { formatReminderTime, validReminderTime } from '@/core/notifications/reminder-contract';
import { useReminder } from './reminder-provider';

export function ReminderSettings() {
  const { state, busy, update, refresh } = useReminder();
  const { hour: savedHour, minute: savedMinute } = state.preference;
  const [draft, setDraft] = useState<{ hour?: string; minute?: string }>({});
  const hour = draft.hour ?? String(savedHour).padStart(2, '0');
  const minute = draft.minute ?? String(savedMinute).padStart(2, '0');
  const [error, setError] = useState('');

  const apply = async (enabled: boolean, requestPermission: boolean) => {
    if (!/^\d{1,2}$/.test(hour) || !/^\d{1,2}$/.test(minute) || !validReminderTime(Number(hour), Number(minute))) {
      setError('Informe hora de 00 a 23 e minuto de 00 a 59.'); return;
    }
    setError('');
    const result = await update(Number(hour), Number(minute), enabled, requestPermission);
    if (result && !result.message) setDraft({});
  };

  return <Card>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
      <View style={{ flex: 1, gap: spacing.xs }}>
        <Text accessibilityRole="header" style={textStyles.body}>Lembrete diário</Text>
        <Text accessibilityLiveRegion="polite" style={textStyles.muted}>{state.status === 'scheduled' ? `Agendado às ${formatReminderTime(savedHour, savedMinute)} no horário local do aparelho.` : state.status === 'off' ? 'Lembrete desligado.' : 'Lembrete não confirmado pelo sistema.'}</Text>
      </View>
      <Switch accessibilityLabel="Lembrete diário" accessibilityState={{ checked: state.status === 'scheduled', disabled: busy, busy }} value={state.status === 'scheduled'} disabled={busy} thumbColor={colors.surface} trackColor={{ true: colors.primary }} onValueChange={enabled => {
        if (enabled) void apply(true, true);
        else { setError(''); void update(savedHour, savedMinute, false); }
      }} />
    </View>
    <View style={editorialStyles.row}><View style={[editorialStyles.pill, { backgroundColor: colors.butter }]}><Text style={[textStyles.body, { fontSize: 12, fontWeight: '700' }]}>{formatReminderTime(savedHour, savedMinute)}</Text></View><Text style={[textStyles.body, { flex: 1, fontSize: 13 }]}>Um momento para seu check-in.</Text></View>
    <Text style={textStyles.muted}>Sem conteúdo sensível na notificação.</Text>
    <Disclosure title="Alterar horário do lembrete">
    <View style={{ flexDirection: 'row', gap: spacing.md }}>
      <View style={{ flex: 1 }}><Field label="Hora do lembrete" hint="00 a 23" keyboardType="number-pad" maxLength={2} value={hour} editable={!busy} onChangeText={hour => setDraft(previous => ({ ...previous, hour }))} /></View>
      <View style={{ flex: 1 }}><Field label="Minuto do lembrete" hint="00 a 59" keyboardType="number-pad" maxLength={2} value={minute} editable={!busy} onChangeText={minute => setDraft(previous => ({ ...previous, minute }))} /></View>
    </View>
    <AppButton title="Salvar horário" variant="secondary" disabled={busy} onPress={() => void apply(state.preference.enabled, false)} />
    <Text style={textStyles.muted}>Horário de 24 horas. O sistema pode atrasar a entrega por economia de bateria ou restrições do aparelho. Ao reabrir o app, o horário é ajustado ao fuso atual.</Text>
    </Disclosure>
    {error || state.message ? <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={{ color: colors.danger }}>{error || state.message}</Text> : null}
    {state.status === 'blocked' ? <AppButton title="Abrir configurações de notificações" variant="secondary" onPress={() => void Linking.openSettings().catch(() => setError('Não foi possível abrir as configurações do aparelho.'))} /> : null}
    {state.status === 'error' || state.status === 'blocked' ? <AppButton title="Tentar recuperar lembrete" variant="secondary" disabled={busy} onPress={() => void refresh()} /> : null}
    {state.preference.enabled && state.status !== 'scheduled' ? <AppButton title="Desativar preferência de lembrete" variant="secondary" disabled={busy} onPress={() => void update(savedHour, savedMinute, false)} /> : null}
  </Card>;
}
