import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import FirstHabitIntroduction from './FirstHabitIntroduction';
import { defaultPreferences } from '../../utils/journeyPreferences';
const state = vi.hoisted(() => ({ offline: {} }));
vi.mock('../../contexts/OfflineContext', () => ({ useOffline: () => state.offline }));
vi.mock('../habits/HabitManagement', () => ({ default: ({ habit, onConfirmed }) => <button onClick={onConfirmed}>Confirmar motivo de {habit.id}</button> }));
beforeEach(() => {
    state.offline = { accountKey: 'account-a:epoch', loading: false, localOnly: false, preferences: defaultPreferences(),
        snapshot: { data: { usuario: { id: 'account-a' }, vicios: [] } },
        client: { introduction: vi.fn(async () => null), preferences: vi.fn(async () => defaultPreferences()), refresh: vi.fn() } };
});
afterEach(cleanup);
const mount = props => render(<MemoryRouter><FirstHabitIntroduction {...props} /></MemoryRouter>);
const ready = () => screen.findByText(/Etapas disponíveis/);
it('offers a nonblocking skip, uses the current revision and does not create a habit', async () => {
    mount(); await ready();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Pular introdução e ir à Jornada' }));
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Primeiros passos' })).not.toBeInTheDocument());
    expect(state.offline.client.preferences).toHaveBeenLastCalledWith({ revision: 0, intro: { version: 1, state: 'dismissed', step: 'habit' } }, 'account-a:epoch');
    expect(state.offline.client.introduction).toHaveBeenCalledTimes(1);
});
it('requires consultation after a preferences conflict and keeps the confirmed habit', async () => {
    state.offline.preferences = { ...defaultPreferences(), revision: 2, intro: { version: 1, state: 'pending', step: 'reason', habit_id: 'habit-a' } };
    state.offline.snapshot.data.vicios = [{ id: 'habit-a' }];
    mount(); await ready();
    state.offline.client.preferences.mockRejectedValueOnce(new Error('Conflito sintético'));
    fireEvent.click(screen.getByRole('button', { name: 'Pular motivo' }));
    await screen.findByRole('alert');
    expect(screen.getByRole('button', { name: 'Pular motivo' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Cadastrar primeiro hábito' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Consultar etapas atuais' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Pular motivo' })).toBeEnabled());
    expect(state.offline.client.preferences).toHaveBeenLastCalledWith(null, 'account-a:epoch');
});
it('recovers only the reason after reopening with a confirmed local ID', async () => {
    state.offline.preferences.intro = { version: 1, state: 'pending', step: 'habit' };
    state.offline.snapshot.data.vicios = [{ id: 'habit-a' }];
    state.offline.client.introduction.mockResolvedValue({ status: 'confirmed', habitId: 'habit-a' });
    mount(); await ready();
    expect(screen.getByRole('button', { name: 'Confirmar motivo de habit-a' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cadastrar primeiro hábito' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar motivo de habit-a' }));
    await waitFor(() => expect(state.offline.client.preferences).toHaveBeenLastCalledWith({ revision: 0, intro: { version: 1, state: 'pending', step: 'checkin', habit_id: 'habit-a' } }, 'account-a:epoch'));
});
it('revisits saved dismissal in the profile without resetting it or requiring an online write', async () => {
    state.offline.preferences.intro = { version: 1, state: 'dismissed', step: 'habit' };
    state.offline.localOnly = true;
    mount({ review: true });
    fireEvent.click(screen.getByRole('button', { name: 'Rever introdução' }));
    await screen.findByText(/Offline: etapas remotas/);
    expect(screen.getByRole('link', { name: 'Ir para a Jornada' })).toHaveAttribute('href', '/');
    expect(state.offline.client.preferences).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Começar introdução' })).not.toBeInTheDocument();
});
it('destroys account A progress and ignores late responses after switching to B', async () => {
    let finish;
    state.offline.client.introduction.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    const view = mount();
    state.offline = { ...state.offline, accountKey: 'account-b:epoch', client: { ...state.offline.client, introduction: vi.fn(async () => null) } };
    view.rerender(<MemoryRouter><FirstHabitIntroduction /></MemoryRouter>);
    await act(async () => finish({ status: 'confirmed', habitId: 'private-a' }));
    await ready();
    expect(screen.queryByText(/private-a/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Começar introdução' })).toBeEnabled();
});
