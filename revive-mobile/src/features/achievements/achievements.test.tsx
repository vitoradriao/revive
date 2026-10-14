import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';
import { useBootstrap } from '@/features/bootstrap/use-bootstrap';
import AchievementsScreen from '../../../app/(app)/achievements';
import type { BootstrapData } from '@/domain/types';

jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn() }) }));
jest.mock('lucide-react-native', () => ({ Eye: () => null, EyeOff: () => null }));
jest.mock('@/features/bootstrap/use-bootstrap', () => ({ useBootstrap: jest.fn() }));

const snapshot = (data: BootstrapData) => {
  jest.mocked(useBootstrap).mockReturnValue({ data, isLoading: false } as ReturnType<typeof useBootstrap>);
};

describe('achievement screen', () => {
  it('switches categories without duplicating milestones and keeps distinct-date progress', async () => {
    snapshot({
      server_time: '2026-10-14T12:00:00Z',
      usuario: { id: 'u', nome: 'Pessoa', email: 'test@example.invalid' },
      vicios: [], metas: [], recaidas: [], mensagem: null, conquistas: [],
      registros: [
        { id: 'one', vicio_id: 'h', data_registro: '2026-10-14' },
        { id: 'two', vicio_id: 'h', data_registro: '2026-10-14' },
      ],
    });
    const view = await render(<AchievementsScreen />);
    expect(view.getByText('0 de 15 marcos alcançados')).toBeTruthy();
    expect(view.getAllByText(/dias consecutivos/)).toHaveLength(6);
    await fireEvent.press(view.getByRole('tab', { name: 'Economia' }));
    expect(view.queryByText('30 dias consecutivos')).toBeNull();
    expect(view.getAllByText(/de economia estimada acumulada/)).toHaveLength(4);
    await fireEvent.press(view.getByRole('tab', { name: 'Metas' }));
    expect(view.getAllByText(/metas concluídas/)).toHaveLength(3);
    await fireEvent.press(view.getByRole('tab', { name: 'Registros' }));
    expect(view.getByText('Próximo marco: 1 de 7')).toBeTruthy();
    expect(view.getByText('Próximo marco: 1 de 30')).toBeTruthy();
    expect(view.getByRole('tab', { name: 'Registros' }).props.accessibilityState.selected).toBe(true);
  });

  it('shows an awarded 30-day milestone as permanent after the active streak resets to two days', async () => {
    snapshot({
      server_time: '2026-02-01T12:00:00Z',
      usuario: { id: 'u', nome: 'Pessoa', email: 'test@example.invalid' },
      vicios: [{
        id: 'habit', usuario_id: 'u', nome_vicio: 'Hábito A', data_inicio: '2025-12-01',
        progresso: {
          sequencia_atual_dias: 2, sequencia_atual_cobertura: 'confirmed', recorde_dias: 30, recorde_cobertura: 'confirmed',
          dias_checkin: 4, economia_sequencia: { valor_estimado: 20, cobertura: 'confirmed' },
          economia_acumulada: { valor_estimado: 500, cobertura: 'confirmed' }, marcos: [],
        },
      }],
      registros: [], recaidas: [], metas: [], mensagem: null,
      conquistas: [{
        id: 'award', vicio_id: null, categoria: 'streak', valor_alvo: 30,
        awarded_at: '2026-01-30T12:00:00Z', origem: 'period_threshold', cobertura: 'confirmed',
      }],
    });
    const view = await render(<AchievementsScreen />);

    expect(view.getByText('30 dias consecutivos')).toBeTruthy();
    expect(view.getByText('Conquista permanente')).toBeTruthy();
    expect(view.getByText(/Reconhecido em/)).toBeTruthy();
    expect(view.getByText('Próximo marco: 2 de 90')).toBeTruthy();
  });

  it('uses text to identify an unavailable legacy history without displaying a locked zero', async () => {
    snapshot({
      server_time: '2026-02-01T12:00:00Z',
      usuario: { id: 'u', nome: 'Pessoa', email: 'test@example.invalid' },
      vicios: [{
        id: 'legacy', usuario_id: 'u', nome_vicio: 'Hábito legado', data_inicio: '2025-12-01',
        progresso: {
          sequencia_atual_dias: null, sequencia_atual_cobertura: 'unknown', recorde_dias: null, recorde_cobertura: 'unknown',
          dias_checkin: 0, economia_sequencia: { valor_estimado: null, cobertura: 'unknown' },
          economia_acumulada: { valor_estimado: null, cobertura: 'unknown' }, marcos: [],
        },
      }],
      registros: [], recaidas: [], metas: [], mensagem: null, conquistas: [],
    });
    const view = await render(<AchievementsScreen />);

    expect(view.getAllByText('Histórico indisponível').length).toBeGreaterThan(0);
    expect(view.queryByText('0 de 30')).toBeNull();
  });
});
