import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import JourneyPreferences from './JourneyPreferences';
import { defaultPreferences } from '../../utils/journeyPreferences';
const state = vi.hoisted(() => ({ offline: {} }));
vi.mock('../../contexts/OfflineContext', () => ({ useOffline: () => state.offline }));
const habits = [{ id: 'a', nome_vicio: 'Primeiro' }, { id: 'b', nome_vicio: 'Segundo' }];
beforeEach(() => {
    sessionStorage.clear();
    state.offline = { accountKey: 'account-a:epoch', preferences: defaultPreferences(), loading: false, localOnly: false,
        client: { preferences: vi.fn(async input => input ? { ...input, revision: input.revision + 1 } : defaultPreferences()) } };
});
afterEach(cleanup);
it('ordena com botões rotulados, anuncia posição e restaura padrão sem enviar antes de salvar', async () => {
    render(<JourneyPreferences habits={habits} />);
    await screen.findByText('Configuração sincronizada disponível.');
    const down = screen.getByRole('button', { name: 'Descer Maior sequência atual entre hábitos ativos' });
    down.focus(); fireEvent.click(down);
    expect(down).toHaveFocus();
    expect(screen.getByText(/posição 2 de 4/)).toBeInTheDocument();
    expect(within(screen.getByRole('list', { name: 'Ordem dos indicadores' })).getAllByRole('listitem')[0]).toHaveTextContent('Recorde histórico');
    expect(state.offline.client.preferences).toHaveBeenCalledTimes(1);
    fireEvent.change(screen.getByLabelText('Hábito principal'), { target: { value: 'b' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar preferências' }));
    await screen.findByText('Preferências confirmadas no servidor.');
    expect(state.offline.client.preferences.mock.calls[1][0]).toMatchObject({ primary_habit_id: 'b', revision: 0, indicator_order: ['historical_record', 'current_streak', 'sequence_savings', 'accumulated_savings'] });
    fireEvent.click(screen.getByRole('button', { name: 'Restaurar ordem padrão' }));
    expect(within(screen.getByRole('list', { name: 'Ordem dos indicadores' })).getAllByRole('listitem')[0]).toHaveTextContent('Maior sequência');
});
it('mantém escolhas após conflito e reload e exige consulta/revisão explícitas', async () => {
    state.offline.client.preferences.mockImplementation(async input => {
        if (input) throw Object.assign(new Error('Conflito sintético'), { status: 409 });
        return { ...defaultPreferences(), revision: 3, indicator_order: ['future_metric', ...defaultPreferences().indicator_order] };
    });
    const view = render(<JourneyPreferences habits={habits} />);
    await screen.findByText('Configuração sincronizada disponível.');
    fireEvent.change(screen.getByLabelText('Hábito principal'), { target: { value: 'b' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar preferências' }));
    await screen.findByRole('alert');
    expect(screen.getByLabelText('Hábito principal')).toHaveValue('b');
    view.unmount(); render(<JourneyPreferences habits={habits} />);
    await screen.findByRole('region', { name: 'Revisar preferências' });
    expect(screen.getByRole('button', { name: 'Salvar preferências' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Consultar preferências atuais' }));
    await screen.findByText(/Versão atual: revisão 3/);
    fireEvent.click(screen.getByRole('button', { name: 'Manter escolhas locais e revisar com esta versão' }));
    expect(screen.getByLabelText('Hábito principal')).toHaveValue('b');
    const stored = JSON.parse(sessionStorage.getItem('revive-journey-draft:account-a:epoch'));
    expect(stored.values.revision).toBe(3); expect(stored.values.indicator_order).toContain('future_metric');
    expect(screen.getByRole('button', { name: 'Salvar preferências' })).toBeEnabled();
});
it('isola rascunho por conta e ignora leitura tardia após troca', async () => {
    let finish;
    state.offline.client.preferences.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    const view = render(<JourneyPreferences habits={habits} />);
    fireEvent.change(screen.getByLabelText('Hábito principal'), { target: { value: 'b' } });
    state.offline = { ...state.offline, accountKey: 'account-b:epoch', preferences: defaultPreferences(), localOnly: true };
    view.rerender(<JourneyPreferences habits={[]} />);
    await act(async () => finish({ ...defaultPreferences(), primary_habit_id: 'b', revision: 99 }));
    expect(screen.getByLabelText('Hábito principal')).toHaveValue('');
    expect(screen.queryByText('Segundo')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Salvar preferências' })).toBeDisabled();
    expect(screen.getByText(/Offline: última configuração/)).toBeInTheDocument();
});
it('falha de leitura deixa retry disponível e principal arquivado recebe aviso sem apagar configuração', async () => {
    state.offline.preferences.primary_habit_id = 'a';
    state.offline.client.preferences.mockRejectedValueOnce(new Error('Leitura indisponível'));
    render(<JourneyPreferences habits={[{ ...habits[0], ativo: false }, habits[1]]} />);
    await screen.findByRole('alert');
    expect(screen.getByText(/Principal arquivado ou indisponível/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Consultar preferências atuais' }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
});
it('resposta perdida mantém marcador de revisão e não repete PATCH', async () => {
    render(<JourneyPreferences habits={habits} />);
    await screen.findByText('Configuração sincronizada disponível.');
    state.offline.client.preferences.mockRejectedValueOnce(Object.assign(new Error('Resposta não confirmada'), { outcomeUnknown: true }));
    fireEvent.change(screen.getByLabelText('Hábito principal'), { target: { value: 'b' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar preferências' }));
    await screen.findByRole('alert');
    expect(screen.getByRole('button', { name: 'Salvar preferências' })).toBeDisabled();
    expect(screen.getByLabelText('Hábito principal')).toHaveValue('b');
    expect(state.offline.client.preferences).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole('button', { name: 'Consultar preferências atuais' }));
    await screen.findByText(/Versão atual: revisão 0/);
    expect(state.offline.client.preferences.mock.calls[2][0]).toBeNull();
    expect(screen.queryByText('Preferências confirmadas no servidor.')).not.toBeInTheDocument();
});
