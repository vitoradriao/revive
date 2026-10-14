import React, { useState } from 'react';
import { Linking, Switch, Text, View } from 'react-native';
import { AppButton, Card, Field, textStyles } from '@/ui/components';
import { colors, spacing } from '@/ui/theme';
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
    <Text style={textStyles.muted}>Horário de 24 horas. Conteúdo neutro, sem nomes de hábitos ou registros.</Text>
    <View style={{ flexDirection: 'row', gap: spacing.md }}>
      <View style={{ flex: 1 }}><Field label="Hora do lembrete" hint="00 a 23" keyboardType="number-pad" maxLength={2} value={hour} editable={!busy} onChangeText={hour => setDraft(previous => ({ ...previous, hour }))} /></View>
      <View style={{ flex: 1 }}><Field label="Minuto do lembrete" hint="00 a 59" keyboardType="number-pad" maxLength={2} value={minute} editable={!busy} onChangeText={minute => setDraft(previous => ({ ...previous, minute }))} /></View>
    </View>
    <AppButton title="Salvar horário" variant="secondary" disabled={busy} onPress={() => void apply(state.preference.enabled, false)} />
    {error || state.message ? <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={{ color: colors.danger }}>{error || state.message}</Text> : null}
    {state.status === 'blocked' ? <AppButton title="Abrir configurações de notificações" variant="secondary" onPress={() => void Linking.openSettings().catch(() => setError('Não foi possível abrir as configurações do aparelho.'))} /> : null}
    {state.status === 'error' || state.status === 'blocked' ? <AppButton title="Tentar recuperar lembrete" variant="secondary" disabled={busy} onPress={() => void refresh()} /> : null}
    {state.preference.enabled && state.status !== 'scheduled' ? <AppButton title="Desativar preferência de lembrete" variant="secondary" disabled={busy} onPress={() => void update(savedHour, savedMinute, false)} /> : null}
    <Text style={textStyles.muted}>O sistema pode atrasar a entrega por economia de bateria ou restrições do aparelho. Ao reabrir o app, o horário é ajustado ao fuso atual.</Text>
  </Card>;
}
