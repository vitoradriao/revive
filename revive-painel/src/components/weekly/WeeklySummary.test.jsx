import React from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import weekly from '../../../../weekly-summary.js';
import corpus from '../../../../tests/fixtures/weekly-summary.json';
import WeeklySummary from './WeeklySummary';
import { deferred } from '../../test/diaryFixture';
const state = vi.hoisted(() => ({ offline: {} }));
vi.mock('../../contexts/OfflineContext', () => ({ useOffline: () => state.offline }));
vi.mock('../diary/RecordEditor', () => ({ default: ({ recordId }) => <p>Registro aberto: {recordId}</p> }));
const habits = [{ id: corpus.habitId, nome_vicio: 'Hábito sintético', ativo: false }, { id: '10000000-0000-4000-8000-000000000002', nome_vicio: 'Outro hábito' }];
let summary, client;
beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(corpus.now);
    const scope = rows => rows.map(row => ({ ...row, usuario_id: corpus.ownerId, vicio_id: corpus.habitId }));
    summary = weekly.buildWeeklySummary({ ...corpus, now: new Date(corpus.now), records: scope(corpus.records), urges: scope(corpus.urges), relapses: scope(corpus.relapses) });
    client = { weeklySummary: vi.fn(async filters => ({ summary: { ...summary, vicio_id: filters.vicio_id, timezone: filters.timezone, intervalo: { ...summary.intervalo, inicio: filters.semana } } })), weeklySource: vi.fn(async () => ({ registro: { ...corpus.urges[0], timezone: corpus.timezone, nota: 'Detalhe sintético' } })) };
    state.offline = { accountKey: 'a:1', client, queue: [], receipts: [], loading: false };
});
afterEach(() => { cleanup(); vi.useRealTimers(); });
it('renders canonical phrases, partial interval, denominators and accessible tables, with archived habits selectable', async () => {
    render(<WeeklySummary habits={habits} />);
    expect(await screen.findByText(corpus.expected.phrase)).toBeInTheDocument();
    expect(screen.getByText(/Semana parcial/)).toBeInTheDocument();
    expect(screen.getByText(/19\/10\/2026 a 25\/10\/2026/)).toBeInTheDocument();
    expect(screen.getByText(/Intensidade informada: 6 de 6/)).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Alternativa textual ao gráfico de gatilhos' })).toHaveTextContent('Estresse4 de 6');
    expect(screen.getByRole('option', { name: 'Hábito sintético (arquivado)' })).toBeInTheDocument();
    expect(screen.getByText(/Dados insuficientes para comparação/)).toBeInTheDocument();
});
it('drills into exact source IDs from table/phrases and can open diary and urge details', async () => {
    render(<WeeklySummary habits={habits} />);
    fireEvent.click(await screen.findByRole('link', { name: 'Ver episódios: Estresse' }));
    let origins = screen.getByRole('region', { name: 'Registros de origem' });
    expect(within(origins).getAllByRole('listitem')).toHaveLength(4);
    fireEvent.click(within(origins).getAllByRole('button')[0]);
    expect(await screen.findByText('Nota: Detalhe sintético')).toBeInTheDocument();
    expect(client.weeklySource).toHaveBeenCalledWith('vontades', corpus.urges[0].id, 'a:1');
    fireEvent.click(screen.getByRole('link', { name: 'Ver check-ins: Bom' }));
    origins = screen.getByRole('region', { name: 'Registros de origem' });
    fireEvent.click(within(origins).getAllByRole('button')[0]);
    expect(screen.getByText('Registro aberto: ' + corpus.records[0].id)).toBeInTheDocument();
});
it('shows offline date and pending queue separately from the consolidated six episodes', async () => {
    state.offline.queue = [{ id: 'pending', type: 'urge.create', payload: { vicio_id: corpus.habitId, intensidade: 10 } }];
    state.offline.localOnly = true;
    client.weeklySummary.mockResolvedValue({ summary, offline: true, stale: true });
    render(<WeeklySummary habits={habits} />);
    expect(await screen.findByText(/Último resumo consolidado/)).toHaveTextContent('Offline');
    expect(screen.getByText(/1 pendência\(s\).*separadas/)).toBeInTheDocument();
    expect(screen.getByText(/Atualizado em/)).toHaveTextContent('23/10/2026');
    expect(screen.getByText(/confirmações posteriores/)).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Indicadores e registros de origem' })).toHaveTextContent('Episódios de vontade6');
});
it.each(['habit', 'timezone', 'account', 'week'])('discards visible data and late responses when changing %s', async context => {
    const wait = deferred(); client.weeklySummary.mockReturnValueOnce(wait.promise);
    const view = render(<WeeklySummary habits={habits} />);
    expect(screen.getByText('Carregando resumo semanal…')).toBeInTheDocument();
    if (context === 'habit') fireEvent.change(screen.getByLabelText('Hábito do resumo'), { target: { value: habits[1].id } });
    if (context === 'timezone') fireEvent.change(screen.getByLabelText('Fuso horário IANA'), { target: { value: 'Pacific/Auckland' } });
    if (context === 'week') fireEvent.change(screen.getByLabelText('Semana'), { target: { value: '-1' } });
    if (context === 'account') { state.offline.accountKey = 'b:2'; view.rerender(<WeeklySummary habits={[habits[1]]} />); }
    client.weeklySummary.mockResolvedValue({ summary: null, offline: true });
    await act(async () => wait.resolve({ summary: { ...summary, frases: [{ ...summary.frases[0], texto: 'Resposta antiga indevida' }] } }));
    expect(screen.queryByText('Resposta antiga indevida')).not.toBeInTheDocument();
    expect(client.weeklySummary.mock.calls[0][2].signal.aborted).toBe(true);
});
it('has empty, no-cache offline, server error and retry states', async () => {
    client.weeklySummary.mockResolvedValueOnce({ summary: null, offline: true });
    const view = render(<WeeklySummary habits={habits} />);
    expect(await screen.findByText('Offline. Nenhum resumo salvo para esta consulta.')).toBeInTheDocument();
    client.weeklySummary.mockRejectedValueOnce(new Error('failed'));
    fireEvent.click(screen.getByRole('button', { name: 'Atualizar resumo semanal' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível consultar');
    const empty = weekly.buildWeeklySummary({ ownerId: corpus.ownerId, habitId: corpus.habitId, week: corpus.week, timezone: corpus.timezone, now: new Date(corpus.now) });
    client.weeklySummary.mockResolvedValueOnce({ summary: empty });
    fireEvent.click(screen.getByRole('button', { name: 'Atualizar resumo semanal' }));
    expect(await screen.findByText(/Nenhum registro nesta semana/)).toBeInTheDocument();
    view.rerender(<WeeklySummary habits={[]} />);
    expect(screen.queryByText(corpus.expected.phrase)).not.toBeInTheDocument();
    expect(screen.getByText('Selecione um hábito para consultar o resumo.')).toBeInTheDocument();
});
it('refreshes after confirmation without treating a pending item as a server record', async () => {
    const view = render(<WeeklySummary habits={habits} />);
    await screen.findByText(corpus.expected.phrase);
    const calls = client.weeklySummary.mock.calls.length;
    state.offline.receipts = [{ key: 'confirmed', kind: 'confirmed' }];
    view.rerender(<WeeklySummary habits={habits} />);
    expect(client.weeklySummary.mock.calls.length).toBe(calls + 1);
});

it('removes the prior visible summary and source panel immediately while a new timezone is loading', async () => {
    render(<WeeklySummary habits={habits} />);
    fireEvent.click(await screen.findByRole('link', { name: 'Ver episódios: Estresse' }));
    expect(screen.getByRole('region', { name: 'Registros de origem' })).toBeInTheDocument();
    const wait = deferred(); client.weeklySummary.mockReturnValueOnce(wait.promise);
    fireEvent.change(screen.getByLabelText('Fuso horário IANA'), { target: { value: 'America/New_York' } });
    expect(screen.queryByText(corpus.expected.phrase)).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Registros de origem' })).not.toBeInTheDocument();
    expect(screen.getByText('Carregando resumo semanal…')).toBeInTheDocument();
    await act(async () => wait.resolve({ summary: null, offline: true }));
});
