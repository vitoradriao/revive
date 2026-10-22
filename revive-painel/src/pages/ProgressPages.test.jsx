import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fixtures from '../../../tests/fixtures/progress.cjs';
import DashboardPage from './DashboardPage';
import AnalyticsPage from './AnalyticsPage';
import AchievementsPage from './AchievementsPage';
import ProfilePage from './ProfilePage';
import ReportsPage from './ReportsPage';

const state = vi.hoisted(() => ({ source: {}, user: { id: 'user-a', nome: 'Conta A' } }));
vi.mock('../contexts/DataContext', () => ({ useData: () => ({
    progressSource: state.source, addictions: state.source.data?.vicios || [], motivationalMessage: 'Um dia de cada vez.',
    deleteAddiction: vi.fn(), createRecordForAddiction: vi.fn(), registerRelapse: vi.fn(), loadAddictionDetails: vi.fn(),
}) }));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: state.user, logout: vi.fn() }) }));
vi.mock('../contexts/UIContext', () => ({ useUI: () => ({ loading: false, openNewAddictionWizard: vi.fn(), theme: 'dark', toggleTheme: vi.fn() }) }));

const pages = [DashboardPage, AnalyticsPage, AchievementsPage, ProfilePage, ReportsPage];
const mount = pageComponent => render(<MemoryRouter>{React.createElement(pageComponent)}</MemoryRouter>);

beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-02-02T12:00:00Z'));
    state.source = { data: fixtures.progressFixture() };
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe.each(pages)('histórico nas páginas: %s', Page => {
    it('declara cobertura parcial e ignora pendências nos indicadores consolidados', () => {
        state.source.localOnly = true;
        state.source.stale = true;
        state.source.queue = [{ type: 'relapse.create', status: 'recovery', lastError: { status: 409 }, payload: { reset_counter: true } }];
        mount(Page);
        expect(screen.getByRole('status')).toHaveTextContent('Cópia parcial');
        expect(screen.getByRole('status')).toHaveTextContent('Offline');
        expect(screen.getByRole('status')).toHaveTextContent('1 pendência(s)');
        expect(screen.getByRole('status')).toHaveTextContent('Há conflitos');
        expect(screen.getByRole('status')).toHaveTextContent('aguardam atualização do consolidado');
        expect(screen.queryByText('Aumento de Risco Detectado')).not.toBeInTheDocument();
        if (Page !== AchievementsPage) {
            expect(screen.getAllByText('2 dias').length).toBeGreaterThan(0);
            expect(screen.getAllByText('30 dias').length).toBeGreaterThan(0);
            expect(screen.getAllByText(/320,00/).length).toBeGreaterThan(0);
        }
    });

    it('distingue carregamento, erro e snapshot vazio sem fabricar histórico', () => {
        state.source = { loading: true };
        const view = mount(Page);
        expect(screen.getByRole('status')).toHaveTextContent('Carregando');
        state.source = { error: new Error('falha de rede') };
        view.rerender(<MemoryRouter><Page /></MemoryRouter>);
        expect(screen.getByRole('status')).toHaveTextContent('Não foi possível atualizar');
        expect(screen.getByRole('status')).toHaveTextContent('indisponível nesta conta');
        state.source = { data: { ...fixtures.progressFixture(), vicios: [], registros: [], recaidas: [], metas: [], conquistas: [] } };
        view.rerender(<MemoryRouter><Page /></MemoryRouter>);
        expect(screen.getByRole('status')).toHaveTextContent('Cópia parcial');
        expect(screen.queryByText('Hábito sintético')).not.toBeInTheDocument();
    });

    it('não mantém histórico de A após troca para B', () => {
        const view = mount(Page);
        state.source = { loading: true };
        view.rerender(<MemoryRouter><Page /></MemoryRouter>);
        expect(screen.queryByText('Hábito sintético')).not.toBeInTheDocument();
        expect(screen.queryByText('Conquista permanente')).not.toBeInTheDocument();
        expect(screen.queryByText('30 dias')).not.toBeInTheDocument();
    });

    it('deixa legado desconhecido indisponível', () => {
        state.source.data = fixtures.progressFixture({ legacy: true });
        mount(Page);
        if (Page === AchievementsPage) {
            expect(screen.getByText(/Histórico legado/)).toBeInTheDocument();
            expect(screen.queryByText('Conquista permanente')).not.toBeInTheDocument();
        } else {
            expect(screen.getAllByText('Indisponível').length).toBeGreaterThan(0);
            expect(screen.queryByText('30 dias')).not.toBeInTheDocument();
        }
    });
});

it('mantém conquista de 30 dias após reset e arquivamento, com origem e cobertura', () => {
    state.source.data = fixtures.progressFixture({ archived: true });
    mount(AchievementsPage);
    const badge = screen.getByText('1 mês').parentElement;
    expect(within(badge).getByText('Conquista permanente')).toBeInTheDocument();
    expect(within(badge).getByText(/período confirmado/)).toBeInTheDocument();
    expect(within(badge).getByText('Dados confirmados')).toBeInTheDocument();
});

it('não concede conquista apenas por um contador atual alto ou registros repetidos', () => {
    const data = fixtures.progressFixture({ reset: false });
    data.conquistas = [];
    data.registros = Array.from({ length: 30 }, (_, index) => ({ id: `record-${index}`, data_registro: '2026-02-01' }));
    state.source.data = data;
    mount(AchievementsPage);
    expect(screen.queryByText('Conquista permanente')).not.toBeInTheDocument();
    expect(screen.getAllByText(/1 \/ 7 no escopo disponível/)).toHaveLength(1);
});

it('mantém check-in e recaída na alternativa textual do heatmap', () => {
    mount(DashboardPage);
    const heatmap = screen.getByRole('region', { name: 'Presença nos últimos 28 dias' });
    expect(heatmap).toHaveTextContent('2/28 dias com check-in');
    fireEvent.click(within(heatmap).getByText('Consultar atividade em texto'));
    expect(within(heatmap).getByText('2026-02-01: 2 registro(s) de check-in; com recaída registrada.')).toBeInTheDocument();
});

it('conta recaídas descritivamente sem prever risco quando os registros aumentam', () => {
    state.source.data.recaidas.push(...Array.from({ length: 9 }, (_, index) => ({ id: `relapse-${index}`, data_recaida: '2026-02-02' })));
    mount(AnalyticsPage);
    expect(screen.getByText('Recaídas disponíveis (últimos 30 dias)').parentElement).toHaveTextContent('10');
    expect(screen.queryByText(/Taxa de recaída|Aumento de Risco Detectado|Você está melhorando/)).not.toBeInTheDocument();
});

it('filtra contagens por período e mantém economia histórica fora do filtro', () => {
    state.source.data.registros.push({ id: 'old', data_registro: '2026-01-10' });
    mount(ReportsPage);
    expect(screen.getByText('Registros disponíveis').parentElement).toHaveTextContent('4');
    fireEvent.click(screen.getByRole('button', { name: '7d' }));
    expect(screen.getByText('Registros disponíveis').parentElement).toHaveTextContent('3');
    expect(screen.getAllByText(/320,00/).length).toBeGreaterThan(0);
});

it('exclui arquivados da quantidade ativa e os preserva no relatório', () => {
    state.source.data.vicios.push({ ...fixtures.progressFixture({ archived: true }).vicios[0], id: 'archived', nome_vicio: 'Arquivo sintético' });
    mount(ReportsPage);
    expect(screen.getByText('Hábitos ativos disponíveis (snapshot)').parentElement).toHaveTextContent('1');
    expect(screen.getByText('Arquivo sintético (Arquivado)')).toBeInTheDocument();
});

it('exporta JSON parcial com marcos e CSV com cobertura sem incorporar pendências', async () => {
    const blobs = [];
    URL.createObjectURL = vi.fn(blob => { blobs.push(blob); return 'blob:synthetic'; });
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    state.source.queue = [{ type: 'record.create', payload: { data_registro: '2026-02-03' } }];
    const view = mount(ProfilePage);
    fireEvent.click(screen.getByText('Exportar dados'));
    const read = blob => new Promise(resolve => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.readAsText(blob); });
    const json = JSON.parse(await read(blobs[0]));
    expect(json.coverage).toBe('partial');
    expect(json.pendingCount).toBe(1);
    expect(json.registros).toHaveLength(3);
    expect(json.conquistas.length).toBeGreaterThan(0);
    view.unmount();
    mount(ReportsPage);
    fireEvent.click(screen.getByRole('button', { name: 'Exportar registros disponíveis em CSV' }));
    const csv = await read(blobs[1]);
    expect(csv).toContain('Cobertura');
    expect(csv).toContain('Cópia parcial');
    expect(csv).not.toContain('2026-02-03');
});
