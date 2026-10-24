import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { beforeEach, expect, it, jest } from '@jest/globals';
import HabitDetailScreen from '../../../app/(app)/habits/[id]';
import { useBootstrap } from '@/features/bootstrap/use-bootstrap';
import { useReviveMutations } from '@/features/mutations/use-revive-mutations';
import { reviveApi } from '@/core/api/repositories';
import type { BootstrapData } from '@/domain/types';

const mockPush = jest.fn(), mockBack = jest.fn();
let mockHabitId = 'h';
const mockCreateRecord = jest.fn<ReturnType<typeof useReviveMutations>['createRecord']>();
const mockCreateRelapse = jest.fn<ReturnType<typeof useReviveMutations>['createRelapse']>();
jest.mock('expo-router', () => ({ useLocalSearchParams: () => ({ id: mockHabitId }), useRouter: () => ({ push: mockPush, back: mockBack }), Stack: { Screen: () => null } }));
jest.mock('@/features/bootstrap/use-bootstrap', () => ({ useBootstrap: jest.fn(), bootstrapKey: (id: string) => ['bootstrap', id] }));
jest.mock('@/features/auth/session-context', () => ({ useSession: () => ({ user: { id: 'u' } }) }));
jest.mock('@/features/mutations/use-revive-mutations', () => ({ useReviveMutations: () => ({ createRecord: mockCreateRecord, createRelapse: mockCreateRelapse }) }));
jest.mock('@/core/api/repositories', () => ({ reviveApi: { deleteAddiction: jest.fn(async () => undefined) } }));
jest.mock('@/core/query/client', () => ({ queryClient: { invalidateQueries: jest.fn(async () => undefined) } }));
jest.mock('@react-native-community/netinfo', () => ({ fetch: async () => ({ isConnected: true }) }));
jest.mock('./habit-management', () => ({ HabitManagement: () => null }));
jest.mock('lucide-react-native', () => ({ Eye: () => null, EyeOff: () => null }));
jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return { SafeAreaView: View };
});
const data: BootstrapData = {
  usuario: { id: 'u', nome: 'Pessoa', email: 'test@example.invalid' }, server_time: '2026-10-14T12:00:00Z',
  vicios: [{ id: 'h', usuario_id: 'u', nome_vicio: 'Hábito de teste', ativo: true, data_inicio: '2026-06-01', dias_abstinencia: 2 }],
  registros: [{ id: 'r1', vicio_id: 'h', data_registro: '2026-06-16', humor: 'Excelente' }, { id: 'r2', vicio_id: 'h', data_registro: '2026-06-16', humor: 'Excelente' }],
  metas: [], recaidas: [], conquistas: [], mensagem: null,
};
const confirmation = () => {
  const calls = jest.mocked(Alert.alert).mock.calls;
  return calls[calls.length - 1]![2]!;
};
beforeEach(() => {
  jest.clearAllMocks();
  mockHabitId = 'h';
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  jest.mocked(useBootstrap).mockReturnValue({ data, isLoading: false } as ReturnType<typeof useBootstrap>);
  mockCreateRecord.mockResolvedValue('synced'); mockCreateRelapse.mockResolvedValue('queued');
});

it('never carries a check-in draft into a different habit on the same route', async () => {
  const view = await render(<HabitDetailScreen />);
  await fireEvent.press(screen.getByLabelText('Humor: Bem'));
  await fireEvent.changeText(screen.getByLabelText('Gatilhos'), 'Rascunho do primeiro hábito');
  mockHabitId = 'other';
  jest.mocked(useBootstrap).mockReturnValue({ data: { ...data, vicios: [{ ...data.vicios[0]!, id: 'other', nome_vicio: 'Outro hábito' }] }, isLoading: false } as ReturnType<typeof useBootstrap>);
  await view.rerender(<HabitDetailScreen />);
  expect(screen.getByLabelText('Gatilhos').props.value).toBe('');
  expect(screen.getByLabelText('Humor').props.value).toBe('');
});

it('keeps an unselected mood and preserves check-in drafts while switching the three sections', async () => {
  await render(<HabitDetailScreen />);
  expect(screen.getAllByRole('radio').every(item => !item.props.accessibilityState.checked)).toBe(true);
  await fireEvent.press(screen.getByLabelText('Humor: Bem'));
  await fireEvent.changeText(screen.getByLabelText('Gatilhos'), 'Um dia cansativo');
  await fireEvent.press(screen.getByRole('tab', { name: 'Recaída' }));
  expect(screen.queryByLabelText('Gatilhos')).toBeNull();
  await fireEvent.press(screen.getByRole('tab', { name: 'Check-in' }));
  expect(screen.getByLabelText('Gatilhos').props.value).toBe('Um dia cansativo');
  await fireEvent.press(screen.getByRole('button', { name: 'Salvar check-in' }));
  expect(mockCreateRecord).toHaveBeenCalledWith({ vicio_id: 'h', humor: 'Bem', gatilhos: 'Um dia cansativo', conquistas: undefined, observacoes: undefined });
});

it('confirms each relapse choice and preserves the non-reset/reset contracts', async () => {
  await render(<HabitDetailScreen />);
  await fireEvent.press(screen.getByRole('tab', { name: 'Recaída' }));
  await fireEvent.changeText(screen.getByLabelText('O que aconteceu? (opcional)'), 'Minha reflexão');
  await fireEvent.press(screen.getByText('Registrar sem reiniciar'));
  expect(mockCreateRelapse).not.toHaveBeenCalled();
  await act(async () => { confirmation().find(button => button.text === 'Cancelar')!.onPress!(); });
  expect(mockCreateRelapse).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByText('Registrar sem reiniciar'));
  await act(async () => { await confirmation().find(button => button.text === 'Confirmar')!.onPress!(); });
  expect(mockCreateRelapse).toHaveBeenLastCalledWith('h', { motivo: 'Minha reflexão', resetarContador: false });
  expect(screen.getByLabelText('O que aconteceu? (opcional)').props.value).toBe('');
  await fireEvent.press(screen.getByText('Registrar e reiniciar contador'));
  await act(async () => { await confirmation().find(button => button.text === 'Confirmar')!.onPress!(); });
  expect(mockCreateRelapse).toHaveBeenLastCalledWith('h', { motivo: undefined, resetarContador: true });
});

it('keeps two records from the same day and requires confirmation before deleting the habit', async () => {
  await render(<HabitDetailScreen />);
  await fireEvent.press(screen.getByRole('tab', { name: 'Registros' }));
  expect(screen.getAllByText('16/06/2026')).toHaveLength(2);
  const entries = screen.getAllByRole('button', { name: /Abrir registro de/ });
  await fireEvent.press(entries[0]!);
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/(app)/records/[id]', params: { id: 'r1' } });
  await fireEvent.press(screen.getByRole('button', { name: 'Excluir hábito' }));
  expect(reviveApi.deleteAddiction).not.toHaveBeenCalled();
  await act(async () => { await confirmation().find(button => button.text === 'Excluir')!.onPress!(); });
  expect(reviveApi.deleteAddiction).toHaveBeenCalledWith('h');
  expect(mockBack).toHaveBeenCalled();
});

it('retains a failed reflection for retry and prevents new records for archived habits', async () => {
  mockCreateRelapse.mockRejectedValueOnce(new Error('Falha de gravação'));
  const view = await render(<HabitDetailScreen />);
  await fireEvent.press(screen.getByRole('tab', { name: 'Recaída' }));
  await fireEvent.changeText(screen.getByLabelText('O que aconteceu? (opcional)'), 'Preservar este texto');
  await fireEvent.press(screen.getByText('Registrar sem reiniciar'));
  await act(async () => { await confirmation().find(button => button.text === 'Confirmar')!.onPress!(); });
  expect(screen.getByLabelText('O que aconteceu? (opcional)').props.value).toBe('Preservar este texto');
  jest.mocked(useBootstrap).mockReturnValue({ data: { ...data, vicios: [{ ...data.vicios[0]!, ativo: false }] }, isLoading: false } as ReturnType<typeof useBootstrap>);
  await view.rerender(<HabitDetailScreen />);
  expect(screen.queryByText('Registrar sem reiniciar')).toBeNull();
  await fireEvent.press(screen.getByRole('tab', { name: 'Check-in' }));
  expect(screen.queryByText('Salvar check-in')).toBeNull();
});
