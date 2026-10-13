import { test, expect, jest } from '@jest/globals';
import React, { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { DateCalendar, DateField } from './date-field';
import { Field } from './components';

jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('lucide-react-native', () => ({ CalendarDays: () => null, ChevronDown: () => null, ChevronLeft: () => null, ChevronRight: () => null, X: () => null, Eye: () => null, EyeOff: () => null }));

function Form() {
  const [value, setValue] = useState('08/09/2026');
  return <DateField label="Data de início" value={value} onChangeText={setValue} maxDate="2026-09-08" />;
}

test('digitação aplica máscara e cancelar calendário preserva o campo', async () => {
  await render(<Form />);
  await fireEvent.changeText(screen.getByLabelText('Data de início'), '01092026');
  expect(screen.getByDisplayValue('01/09/2026')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Abrir calendário: Data de início'));
  await fireEvent.press(screen.getByLabelText('07/09/2026'));
  await fireEvent.press(screen.getByLabelText('Cancelar seleção de data'));
  expect(screen.getByDisplayValue('01/09/2026')).toBeTruthy();
});

test('confirma seleção, bloqueia futuro e permite escolher mês e ano', async () => {
  await render(<Form />);
  await fireEvent.press(screen.getByLabelText('Abrir calendário: Data de início'));
  expect(screen.getByLabelText('09/09/2026')).toBeDisabled();
  await fireEvent.press(screen.getByLabelText('Escolher mês e ano'));
  await fireEvent.press(screen.getByLabelText('Escolher ano'));
  await fireEvent.press(screen.getByLabelText('Ano 2024'));
  await fireEvent.press(screen.getByLabelText('Fevereiro de 2024'));
  await fireEvent.press(screen.getByLabelText('29/02/2024'));
  await fireEvent.press(screen.getByText('Usar esta data'));
  expect(screen.getByDisplayValue('29/02/2024')).toBeTruthy();
});

test('permite conferir e ocultar senha sem alterar seu conteúdo', async () => {
  await render(<Field label="Senha" secureTextEntry value="teste-seguro" />);
  expect(screen.getByLabelText('Senha').props.secureTextEntry).toBe(true);
  await fireEvent.press(screen.getByLabelText('Mostrar senha'));
  expect(screen.getByLabelText('Senha').props.secureTextEntry).toBe(false);
  await fireEvent.press(screen.getByLabelText('Ocultar senha'));
  expect(screen.getByLabelText('Senha').props.secureTextEntry).toBe(true);
});

test('Hoje selects the chosen-zone day instead of the device day', async () => {
  const onSelect=jest.fn();
  await render(<DateCalendar selected="2026-01-01" maxDate="2026-01-02" todayKey="2026-01-02" onSelect={onSelect} />);
  await fireEvent.press(screen.getByLabelText('Selecionar hoje'));
  expect(onSelect).toHaveBeenCalledWith('2026-01-02');
});
