import React from 'react';
import { beforeEach, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import NewGoalScreen from '../../app/(app)/goals/new';
import { useReviveMutations } from '@/features/mutations/use-revive-mutations';
import { localDateKey } from '@/domain/formats';

const mockBack = jest.fn();
const mockCreate = jest.fn<ReturnType<typeof useReviveMutations>['createGoal']>();
jest.mock('expo-router', () => ({ useRouter: () => ({ back: mockBack, push: jest.fn() }) }));
jest.mock('@/features/bootstrap/use-bootstrap', () => ({ useBootstrap: () => ({ data: { vicios: [{ id: 'h', nome_vicio: 'Ativo' }, { id: 'archived', nome_vicio: 'Arquivado', ativo: false }] } }) }));
jest.mock('@/features/mutations/use-revive-mutations', () => ({ useReviveMutations: () => ({ createGoal: mockCreate }) }));
jest.mock('react-native-safe-area-context', () => { const { View } = jest.requireActual<typeof import('react-native')>('react-native'); return { SafeAreaView: View }; });
jest.mock('lucide-react-native', () => ({ Eye: () => null, EyeOff: () => null }));
beforeEach(() => { jest.clearAllMocks(); mockCreate.mockResolvedValue('synced'); });

it('creates a goal with both days and money, the selected active habit and today enabled', async () => {
  await render(<NewGoalScreen />);
  expect(screen.queryByText('Arquivado')).toBeNull();
  await fireEvent.changeText(screen.getByLabelText('Descrição'), 'Meu próximo passo');
  await fireEvent.changeText(screen.getByLabelText('Objetivo em dias (opcional)'), '30');
  await fireEvent.changeText(screen.getByLabelText('Objetivo em dinheiro (R$, opcional)'), '100,75');
  await fireEvent.press(screen.getByRole('button', { name: 'Criar meta' }));
  await waitFor(() => expect(mockCreate).toHaveBeenCalledWith({ vicio_id: 'h', descricao_meta: 'Meu próximo passo', dias_objetivo: 30, valor_objetivo: 100.75, iniciar_hoje: true, data_inicio_meta: localDateKey() }));
  expect(mockBack).toHaveBeenCalled();
});

it('requires at least one target and rejects an invalid supplied amount even with valid days', async () => {
  await render(<NewGoalScreen />);
  await fireEvent.changeText(screen.getByLabelText('Descrição'), 'Meu próximo passo');
  await fireEvent.press(screen.getByRole('button', { name: 'Criar meta' }));
  await waitFor(() => expect(screen.getByText('Preencha um objetivo em dias ou em dinheiro.')).toBeTruthy());
  await fireEvent.changeText(screen.getByLabelText('Objetivo em dias (opcional)'), '30');
  await fireEvent.changeText(screen.getByLabelText('Objetivo em dinheiro (R$, opcional)'), '0');
  await fireEvent.press(screen.getByRole('button', { name: 'Criar meta' }));
  await waitFor(() => expect(screen.getByText('Informe um valor maior que zero, com até 2 casas decimais.')).toBeTruthy());
  expect(mockCreate).not.toHaveBeenCalled();
});
