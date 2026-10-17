import React, { useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useBootstrap } from '@/features/bootstrap/use-bootstrap';
import { useReviveMutations } from '@/features/mutations/use-revive-mutations';
import { toUserMessage } from '@/core/api/errors';
import { AppButton, DataUnavailable, Field, LoadingState, Screen, textStyles } from '@/ui/components';
import { BackHeader, EditorialTitle } from '@/ui/editorial';
import { localDateKey, parseMoney, formatMoneyInput } from '@/domain/formats';
import { colors, radius, spacing } from '@/ui/theme';

const schema = z.object({
  description: z.string().trim().min(2, 'Descreva a meta.'),
  days: z.string().trim().refine((v) => !v || (/^\d+$/.test(v) && Number(v) > 0 && Number(v) <= 36500), 'Informe de 1 a 36.500 dias inteiros.'),
  value: z.string().trim().refine((v) => !v || (parseMoney(v) ?? 0) > 0, 'Informe um valor maior que zero, com até 2 casas decimais.'),
  startToday: z.boolean(),
}).refine((v) => !!v.days || !!v.value, { path: ['days'], message: 'Preencha um objetivo em dias ou em dinheiro.' });
type Form = z.infer<typeof schema>;


export default function NewGoalScreen() {
  const router = useRouter();
  const { data, isLoading, refetch } = useBootstrap();
  const habits = (data?.vicios || []).filter(habit => habit.ativo !== false);
  const { createGoal } = useReviveMutations();
  const [chosenHabit, setHabitId] = useState('');
  const habitId = habits.find(habit => habit.id === chosenHabit)?.id || habits[0]?.id || '';
  const [error, setError] = useState('');
  const { control, handleSubmit, setValue, formState: { errors, isSubmitting } } = useForm<Form>({ resolver: zodResolver(schema), defaultValues: { description: '', days: '', value: '', startToday: true } });
  const startToday = useWatch({ control, name: 'startToday' });
  const submit = handleSubmit(async (values) => {
    if (!habitId) return setError('Selecione um hábito.');
    try {
      setError('');
      await createGoal({ vicio_id: habitId, descricao_meta: values.description, dias_objetivo: values.days ? Number(values.days) : undefined, valor_objetivo: values.value ? parseMoney(values.value) : undefined, iniciar_hoje: values.startToday, data_inicio_meta: values.startToday ? localDateKey() : null });
      router.back();
    } catch (caught) { setError(toUserMessage(caught)); }
  });
  if (isLoading && !data) return <Screen><BackHeader section="Nova meta" onBack={() => router.back()} /><LoadingState label="Carregando seus hábitos..." /></Screen>;
  if (!data) return <Screen><BackHeader section="Nova meta" onBack={() => router.back()} /><DataUnavailable onRetry={() => void refetch()} /></Screen>;
  return (
    <Screen>
      <BackHeader section="Nova meta" onBack={() => router.back()} />
      <EditorialTitle title="Dê forma" emphasis="ao próximo passo." />
      <View style={{ gap: 20 }}>
        <Text style={textStyles.body}>Hábito</Text>
        {habits.map((habit) => <Pressable accessibilityRole="radio" accessibilityState={{ checked: habitId === habit.id }} key={habit.id} onPress={() => setHabitId(habit.id)} style={[styles.choice, habitId === habit.id && styles.choiceActive]}><Text style={textStyles.body}>{habit.nome_vicio}</Text></Pressable>)}
        {data && !habits.length ? <><Text style={textStyles.muted}>Crie ou reative um hábito antes de definir uma meta.</Text><AppButton title="Criar hábito" variant="secondary" onPress={() => router.push('/habits/new')} /></> : null}
        <Controller control={control} name="description" render={({ field }) => <Field ref={field.ref} onBlur={field.onBlur} maxLength={240} placeholder="Ex.: completar meu primeiro mês" label="Descrição" value={field.value} onChangeText={field.onChange} error={errors.description?.message} />} />
        <View style={{ gap: 4 }}><Text style={textStyles.heading}>Seu objetivo</Text><Text style={textStyles.muted}>Preencha dias, valor ou os dois.</Text></View>
        <View style={styles.objectives}>
          <View style={styles.objective}><Controller control={control} name="days" render={({ field }) => <Field ref={field.ref} onBlur={field.onBlur} error={errors.days?.message} maxLength={5} placeholder="Ex.: 30" label="Dias" accessibilityLabel="Objetivo em dias (opcional)" keyboardType="number-pad" value={field.value} onChangeText={field.onChange} />} /></View>
          <View style={styles.objective}><Controller control={control} name="value" render={({ field }) => <Field ref={field.ref} onBlur={() => { field.onChange(formatMoneyInput(field.value)); field.onBlur(); }} error={errors.value?.message} maxLength={16} placeholder="0,00" label="Dinheiro (R$)" accessibilityLabel="Objetivo em dinheiro (R$, opcional)" keyboardType="decimal-pad" value={field.value} onChangeText={field.onChange} />} /></View>
        </View>
        <View style={styles.switchRow}><View style={{ flex: 1, gap: 4 }}><Text style={[textStyles.body, { fontSize: 14, fontWeight: '700' }]}>Contar a partir de hoje</Text><Text style={[textStyles.body, { fontSize: 12 }]}>Progresso com início nesta data.</Text></View><Switch accessibilityLabel="Contar progresso a partir de hoje" thumbColor={colors.surface} trackColor={{ false: colors.border, true: colors.primary }} value={startToday} onValueChange={(value) => setValue('startToday', value)} /></View>
        {error ? <Text style={{ color: colors.danger }}>{error}</Text> : null}
        <AppButton title="Criar meta" loading={isSubmitting} disabled={!habitId} onPress={submit} />
        <AppButton title="Cancelar" disabled={isSubmitting} variant="secondary" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  choice: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md },
  choiceActive: { borderColor: colors.primary, backgroundColor: colors.lavender },
  objectives: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  objective: { flex: 1, minWidth: 115 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, backgroundColor: colors.butter, padding: 16, borderRadius: radius.md },
});
