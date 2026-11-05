import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { beforeEach, expect, it, jest } from '@jest/globals';
import { useReminder } from './reminder-provider';
import { ReminderSettings } from './reminder-settings';

jest.mock('lucide-react-native', () => ({ Eye: () => null, EyeOff: () => null }));
jest.mock('./reminder-provider', () => ({ useReminder: jest.fn() }));
const mockUpdate = jest.fn<ReturnType<typeof useReminder>['update']>();
const snapshot = (status: 'off' | 'scheduled' | 'blocked' = 'off', busy = false) => jest.mocked(useReminder).mockReturnValue({ state: { preference: { version: 1, hour: 20, minute: 0, enabled: status === 'scheduled' }, status }, busy, update: mockUpdate, refresh: jest.fn(async () => undefined) });
beforeEach(() => { jest.clearAllMocks(); mockUpdate.mockReset(); snapshot(); });

it('edits 20:00 to 08:30 while off without requesting permission, then activates explicitly', async () => {
  await render(<ReminderSettings />);
  await fireEvent.press(screen.getByRole('button', { name: 'Alterar horário do lembrete' }));
  expect(screen.getByLabelText('Hora do lembrete').props.value).toBe('20');
  await fireEvent.changeText(screen.getByLabelText('Hora do lembrete'), '08');
  await fireEvent.changeText(screen.getByLabelText('Minuto do lembrete'), '30');
  await fireEvent.press(screen.getByText('Salvar horário'));
  expect(mockUpdate).toHaveBeenLastCalledWith(8, 30, false, false);
  await fireEvent(screen.getByLabelText('Lembrete diário'), 'valueChange', true);
  expect(mockUpdate).toHaveBeenLastCalledWith(8, 30, true, true);
});

it('keeps the switch off for denied/unconfirmed scheduling and rejects invalid hours', async () => {
  snapshot('blocked');
  await render(<ReminderSettings />);
  await fireEvent.press(screen.getByRole('button', { name: 'Alterar horário do lembrete' }));
  expect(screen.getByLabelText('Lembrete diário').props.value).toBe(false);
  await fireEvent.changeText(screen.getByLabelText('Hora do lembrete'), '25');
  await fireEvent.press(screen.getByText('Salvar horário'));
  expect(screen.getByText('Informe hora de 00 a 23 e minuto de 00 a 59.')).toBeTruthy();
  expect(mockUpdate).not.toHaveBeenCalled();
});

it('disables activation and time fields during native scheduling', async () => {
  snapshot('off', true);
  await render(<ReminderSettings />);
  await fireEvent.press(screen.getByRole('button', { name: 'Alterar horário do lembrete' }));
  expect(screen.getByLabelText('Lembrete diário')).toBeDisabled();
  expect(screen.getByLabelText('Hora do lembrete').props.editable).toBe(false);
  expect(screen.getByRole('button', { name: 'Salvar horário' })).toBeDisabled();
});

it('permits disabling an active reminder even when an unsaved time field is invalid', async () => {
  snapshot('scheduled');
  await render(<ReminderSettings />);
  await fireEvent.press(screen.getByRole('button', { name: 'Alterar horário do lembrete' }));
  await fireEvent.changeText(screen.getByLabelText('Hora do lembrete'), '25');
  await fireEvent(screen.getByLabelText('Lembrete diário'), 'valueChange', false);
  expect(mockUpdate).toHaveBeenCalledWith(20, 0, false);
});
