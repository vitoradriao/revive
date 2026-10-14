import React from 'react';
import { beforeEach, expect, jest, test } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';
import InsightsScreen from '../../../app/(app)/(tabs)/insights';
import { shareCsv, shareJson, printSummary } from '@/core/export/reporting';
import { useBootstrap } from './use-bootstrap';
import type { BootstrapData } from '@/domain/types';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('lucide-react-native', () => ({ Eye: () => null, EyeOff: () => null, FileJson: () => null, FileSpreadsheet: () => null, Printer: () => null }));
jest.mock('./use-bootstrap', () => ({ useBootstrap: jest.fn() }));
jest.mock('@/core/export/reporting', () => ({ shareCsv: jest.fn(async () => undefined), shareJson: jest.fn(async () => undefined), printSummary: jest.fn(async () => undefined) }));
jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return { SafeAreaView: View };
});

const data: BootstrapData = {
  server_time: '2026-10-14T12:00:00Z', usuario: { id: 'u', nome: 'Pessoa', email: 'test@example.invalid' },
  vicios: [], registros: [{ id: 'r', vicio_id: 'h', data_registro: '2026-10-14', humor: 'Bem' }], metas: [], recaidas: [], mensagem: null, conquistas: [],
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useBootstrap).mockReturnValue({ data, isLoading: false } as ReturnType<typeof useBootstrap>);
});

test('separates reports from overview and exports the actual snapshot', async () => {
  await render(<InsightsScreen />);
  expect(screen.getByText('1 de 1 registros')).toBeTruthy();
  expect(screen.queryByLabelText('Compartilhar CSV')).toBeNull();
  await fireEvent.press(screen.getByRole('tab', { name: 'Relatórios' }));
  expect(screen.queryByText('1 de 1 registros')).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Compartilhar CSV' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Compartilhar JSON' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Imprimir resumo' }));
  expect(shareCsv).toHaveBeenCalledWith(data);
  expect(shareJson).toHaveBeenCalledWith(data);
  expect(printSummary).toHaveBeenCalledWith(data);
  await fireEvent.press(screen.getByRole('tab', { name: 'Visão geral' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Calendário' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Conquistas' }));
  expect(mockPush.mock.calls).toEqual([['/(app)/calendar'], ['/(app)/achievements']]);
});
