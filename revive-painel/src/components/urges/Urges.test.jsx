import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import UrgeForm from './UrgeForm';
import UrgeHistory from './UrgeHistory';
import SyncPage from '../../pages/SyncPage';
import CalendarPage from '../../pages/CalendarPage';
const state = vi.hoisted(() => ({ offline: {}, data: {} }));
vi.mock('../../contexts/OfflineContext', () => ({ useOffline: () => state.offline }));
vi.mock('../../contexts/DataContext', () => ({ useData: () => state.data }));
const habit = { id: 'habit', nome_vicio: 'Hábito sintético', ativo: true };
const event = { id: 'event', vicio_id: habit.id, occurred_at: '2026-10-22T12:00:00Z', timezone: 'UTC', intensidade: 10, gatilhos: ['future_code'] };
const mount = component => render(<MemoryRouter>{component}</MemoryRouter>);
beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-23T15:30:42Z'));
    state.offline = { accountKey: 'a:1', queue: [], receipts: [], client: { getUrgeDraft: vi.fn(async () => null), saveUrgeDraft: vi.fn(async () => {}), urges: vi.fn(async (method, args) => method === 'list' ? { events: [event], partial: true } : { id: args[1].eventId }) } };
    state.data = { allRecords: [], relapses: [], goals: [], addictions: [habit] };
});
afterEach(() => { cleanup(); vi.useRealTimers(); });
it('mantém o instante inicial, campos opcionais e contador descritivo', async () => {
    mount(<UrgeForm habit={habit} accountKey="a:1" />);
    await waitFor(() => expect(screen.getByLabelText('Intensidade (0 a 10)')).toBeEnabled());
    fireEvent.change(screen.getByLabelText('Intensidade (0 a 10)'), { target: { value: '0' } });
    fireEvent.click(screen.getByLabelText('Estresse'));
    vi.setSystemTime(new Date('2026-10-23T16:00:00Z'));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar vontade' }));
    await waitFor(() => expect(state.offline.client.urges).toHaveBeenCalledWith('create', [expect.objectContaining({ intensidade: 0, occurred_at: '2026-10-23T15:30:42.000Z', gatilhos: ['estresse'] }), expect.objectContaining({ eventId: expect.any(String) })], 'a:1'));
    expect(screen.getByText(/não cria recaída e não reinicia o contador/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Salvar vontade' })).toBeDisabled();
});
it('preserva rascunho ao arquivar durante preenchimento e após reabrir', async () => {
    const view = mount(<UrgeForm habit={habit} accountKey="a:1" />);
    await waitFor(() => expect(screen.getByLabelText('Nota (opcional)')).toBeEnabled());
    fireEvent.change(screen.getByLabelText('Nota (opcional)'), { target: { value: 'Nota sintética' } });
    view.rerender(<MemoryRouter><UrgeForm habit={{ ...habit, ativo: false }} accountKey="a:1" /></MemoryRouter>);
    expect(screen.getByLabelText('Nota (opcional)')).toHaveValue('Nota sintética');
    expect(screen.getByRole('button', { name: 'Salvar vontade' })).toBeDisabled();
    expect(screen.getByText(/Hábito arquivado. Seu rascunho/)).toBeInTheDocument();
    const draft = state.offline.client.saveUrgeDraft.mock.calls.at(-1)[1]; view.unmount();
    state.offline.client.getUrgeDraft.mockResolvedValue(draft);
    mount(<UrgeForm habit={{ ...habit, ativo: false }} accountKey="a:1" />);
    await waitFor(() => expect(screen.getByLabelText('Nota (opcional)')).toHaveValue('Nota sintética'));
});
it('valida fracionários, futuro e informa falha sem afirmar confirmação', async () => {
    mount(<UrgeForm habit={habit} accountKey="a:1" />);
    await waitFor(() => expect(screen.getByLabelText('Intensidade (0 a 10)')).toBeEnabled());
    fireEvent.change(screen.getByLabelText('Intensidade (0 a 10)'), { target: { value: '1.5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar vontade' }));
    expect(screen.getByRole('status')).toHaveTextContent('inteira'); expect(state.offline.client.urges).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Intensidade (0 a 10)'), { target: { value: '10' } });
    state.offline.client.urges.mockRejectedValue(new Error('Storage indisponível'));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar vontade' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Storage indisponível'));
    expect(screen.getByLabelText('Intensidade (0 a 10)')).toHaveValue(10);
});
it('expõe cobertura parcial, código futuro e erro de consulta', async () => {
    mount(<UrgeHistory habitId="habit" accountKey="a:1" />);
    await screen.findByText('Gatilhos: Outro (future_code)');
    expect(screen.getByText(/Cobertura parcial:/)).toBeInTheDocument();
    state.offline.client.urges.mockRejectedValue(new Error('Consulta indisponível'));
    fireEvent.click(screen.getByRole('button', { name: 'Atualizar vontades' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Consulta indisponível');
});
it('calendário distingue vontade por texto e nome acessível, sem recaída', async () => {
    mount(<CalendarPage />);
    const day = await screen.findByRole('button', { name: '2026-10-22: 0 registros, 1 vontades, 0 recaídas, 0 metas concluídas' });
    expect(within(day).getByText('Vontade 1')).toBeInTheDocument();
    fireEvent.click(day); expect(day).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getAllByText('Vontade · intensidade 10/10')).toHaveLength(1);
});

it('Sincronização oferece rascunho explícito apenas para recusa definitiva', async () => {
    const item = { id: 'refused', type: 'urge.create', payload: event, status: 'recovery', attempts: 1, lastError: { status: 404, code: 'VICIO_NAO_ENCONTRADO', outcomeUnknown: false } };
    state.offline.queue = [item]; state.offline.client.urges.mockResolvedValue(habit.id);
    const view = mount(<SyncPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Recuperar vontade como rascunho' }));
    await waitFor(() => expect(state.offline.client.urges).toHaveBeenCalledWith('recover', ['refused'], 'a:1'));
    state.offline.queue = [{ ...item, lastError: { ...item.lastError, outcomeUnknown: true } }];
    view.rerender(<MemoryRouter><SyncPage /></MemoryRouter>);
    expect(screen.queryByRole('button', { name: 'Recuperar vontade como rascunho' })).not.toBeInTheDocument();
});
