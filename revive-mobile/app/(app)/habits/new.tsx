import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { reviveApi } from '@/core/api/repositories';
import { toUserMessage } from '@/core/api/errors';
import { queryClient } from '@/core/query/client';
import { useSession } from '@/features/auth/session-context';
import { bootstrapKey } from '@/features/bootstrap/use-bootstrap';
import { AppButton, Card, Field, Screen, textStyles } from '@/ui/components';
import { BackHeader, EditorialTitle, editorialStyles } from '@/ui/editorial';
import { Illustration } from '@/ui/illustration';
import { colors } from '@/ui/theme';
import { DateField } from '@/ui/date-field';
import { displayDate, localDateKey, parseDate, parseMoney, formatMoneyInput } from '@/domain/formats';

const schema = z.object({
  name: z.string().trim().min(2, 'Informe o hábito.'),
  startDate: z.string().refine((value) => !!parseDate(value), 'Informe uma data válida: DD/MM/AAAA.').refine((value) => !parseDate(value) || parseDate(value)! <= localDateKey(), 'A data não pode estar no futuro.'),
  dailyValue: z.string().trim().refine((value) => value === '' || parseMoney(value) !== undefined, 'Informe um valor positivo ou zero, com até 2 casas decimais.'),
});
type Form = z.infer<typeof schema>;

export default function NewHabitScreen() {
  const router = useRouter();
  const { user } = useSession();
  const [error, setError] = useState('');
  const { control, handleSubmit, setFocus, formState: { errors, isSubmitting } } = useForm<Form>({ resolver: zodResolver(schema), defaultValues: { name: '', startDate: displayDate(localDateKey()), dailyValue: '' } });
  const submit = handleSubmit(async (values) => {
    try {
      setError('');
      await reviveApi.createAddiction({ nome_vicio: values.name, data_inicio: parseDate(values.startDate)!, valor_economizado_por_dia: parseMoney(values.dailyValue) ?? 0 });
      if (user) await queryClient.invalidateQueries({ queryKey: bootstrapKey(user.id) });
      router.back();
    } catch (caught) { setError(toUserMessage(caught)); }
  });
  return (
    <Screen>
      <BackHeader section="Novo hábito" onBack={() => router.back()} />
      <EditorialTitle title="Todo começo" emphasis="merece espaço." />
      <Card style={{ backgroundColor: colors.peach, borderWidth: 0 }}><View style={editorialStyles.row}><Illustration name="sol" size={58} /><View style={{ flex: 1, gap: 6 }}><Text style={editorialStyles.note}>Um passo possível.</Text><Text style={[textStyles.muted, { color: colors.text }]}>No tempo que faz sentido para você.</Text></View></View></Card>
      <View style={{ gap: 24 }}>
        <Controller control={control} name="name" render={({ field }) => <Field ref={field.ref} onBlur={field.onBlur} label="Hábito ou vício" placeholder="Ex.: cigarro ou refrigerante" maxLength={120} returnKeyType="next" onSubmitEditing={() => setFocus('startDate')} value={field.value} onChangeText={field.onChange} error={errors.name?.message} />} />
        <Controller control={control} name="startDate" render={({ field }) => <DateField ref={field.ref} onBlur={field.onBlur} label="Data de início" value={field.value} onChangeText={field.onChange} error={errors.startDate?.message} />} />
        <Controller control={control} name="dailyValue" render={({ field }) => <Field ref={field.ref} onBlur={() => { field.onChange(formatMoneyInput(field.value)); field.onBlur(); }} label="Economia por dia (R$)" hint="Opcional. Deixe em branco se não quiser acompanhar dinheiro." placeholder="0,00" keyboardType="decimal-pad" maxLength={16} value={field.value} onChangeText={field.onChange} error={errors.dailyValue?.message} />} />
        {error ? <Text style={{ color: colors.danger }}>{error}</Text> : null}
        <AppButton title="Salvar hábito" loading={isSubmitting} onPress={submit} />
        <AppButton title="Cancelar" variant="secondary" disabled={isSubmitting} onPress={() => router.back()} />
      </View>
    </Screen>
  );
}
