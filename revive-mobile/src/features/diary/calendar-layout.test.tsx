import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { expect, it, jest } from '@jest/globals';
import CalendarScreen from '../../../app/(app)/calendar';
import { useRecords } from './use-records';

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), back: jest.fn() }) }));
jest.mock('@/features/bootstrap/use-bootstrap', () => ({ useBootstrap: () => ({ data: { vicios: [], registros: [], recaidas: [] } }) }));
jest.mock('@/features/urges/use-urge-activity', () => ({ useUrgeActivity: () => ({ data: [] }) }));
jest.mock('@/features/urges/urge-list', () => ({ UrgeList: () => null }));
jest.mock('@/features/checkin/use-local-day', () => ({ useLocalDay: () => '2026-09-26' }));
jest.mock('@/domain/urge-time', () => ({ ...jest.requireActual<typeof import('@/domain/urge-time')>('@/domain/urge-time'), deviceTimezone: () => 'UTC', dateInZone: () => '2026-09-26' }));
jest.mock('./use-records', () => ({ useRecords: jest.fn((filter: { inicio: string; fim: string }) => ({
  records: filter.inicio <= '2026-06-16' && filter.fim >= '2026-06-16' ? [{ id: 'r1', vicio_id: 'h', data_registro: '2026-06-16', humor: 'Bem' }, { id: 'r2', vicio_id: 'h', data_registro: '2026-06-16', humor: 'Confiante' }] : [],
  isLoading: false, isError: false, hasNextPage: false, local: false,
})) }));
jest.mock('react-native-safe-area-context', () => { const { View } = jest.requireActual<typeof import('react-native')>('react-native'); return { SafeAreaView: View }; });
jest.mock('lucide-react-native', () => ({ CalendarDays: () => null, ChevronDown: () => null, ChevronLeft: () => null, ChevronRight: () => null, X: () => null, Eye: () => null, EyeOff: () => null }));

it('blocks the future, loads the visible month and shows both entries on a repeated date', async () => {
  await render(<CalendarScreen />);
  expect(screen.getByLabelText('27/09/2026')).toBeDisabled();
  expect(screen.getByLabelText('Próximo mês')).toBeDisabled();
  await fireEvent.press(screen.getByLabelText('Escolher mês e ano'));
  await fireEvent.press(screen.getByLabelText('Junho de 2026'));
  expect(useRecords).toHaveBeenCalledWith({ inicio: '2026-06-01', fim: '2026-06-30', vicio_id: undefined });
  await fireEvent.press(screen.getByLabelText('16/06/2026, com atividade'));
  expect(screen.getAllByText('16/06/2026')).toHaveLength(2);
  await fireEvent.press(screen.getByLabelText('Selecionar hoje'));
  expect(screen.getByLabelText('Próximo mês')).toBeDisabled();
  expect(useRecords).toHaveBeenCalledWith({ inicio: '2026-09-01', fim: '2026-09-26', vicio_id: undefined });
});
