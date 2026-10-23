import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import QuickCheckIn from './QuickCheckIn';
import Diary from './Diary';
import RecordEditor from './RecordEditor';
import { diaryHabit, diaryRecord, deferred } from '../../test/diaryFixture';

const state = vi.hoisted(() => ({ offline: {} }));
vi.mock('../../contexts/OfflineContext', () => ({ useOffline: () => state.offline }));
const wrapper = ({ children }) => <MemoryRouter>{children}</MemoryRouter>;
let client;
beforeEach(() => {
    sessionStorage.clear();
    const drafts = new Map();
    client = {
        diary: vi.fn(async method => method === 'list' ? { records: [], partial: false } : method === 'detail' ? { record: diaryRecord } : { id: 'intent', payload: { data_registro: '2026-10-22' } }),
        getRecordDraft: vi.fn(async id => drafts.get(id)),
        saveRecordDraft: vi.fn(async (id, draft) => { drafts.set(id, draft); })
    };
    state.offline = { client, accountKey: 'a:epoch', queue: [], receipts: [], localOnly: false };
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

it('cria no novo dia, bloqueia duplo toque e mantém falha legível', async () => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(2026, 9, 22, 23, 59));
    const pending = deferred();
    client.diary.mockImplementation(async method => method === 'list' ? { records: [] } : pending.promise);
    render(<QuickCheckIn habits={[diaryHabit]} />, { wrapper });
    await screen.findByText('Nenhum registro de hoje nos dados disponíveis.');
    fireEvent.change(screen.getByLabelText('Humor'), { target: { value: 'bom' } });
    vi.setSystemTime(new Date(2026, 9, 23, 0, 1));
    const button = screen.getByRole('button', { name: 'Salvar check-in' });
    fireEvent.submit(button.closest('form')); fireEvent.submit(button.closest('form'));
    expect(client.diary.mock.calls.filter(([method]) => method === 'create')).toHaveLength(1);
    await act(async () => pending.reject(new Error('Não foi possível gravar.')));
    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível gravar.');
    expect(screen.getByLabelText('Humor')).toHaveValue('bom');
    expect(screen.getByText(/dia local 23\/10\/2026/)).toBeInTheDocument();
});

it('exige ação explícita para outro registro e oferece reflexão opcional com rótulos', async () => {
    client.diary.mockResolvedValue({ records: [diaryRecord] });
    render(<QuickCheckIn habits={[diaryHabit]} />, { wrapper });
    await screen.findByText('Já existe registro para este hábito hoje.');
    expect(screen.getByLabelText('Humor')).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar outro registro hoje' }));
    expect(screen.getByLabelText('Humor')).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar reflexão opcional' }));
    for (const field of ['Gatilhos', 'Conquistas', 'Observações']) expect(screen.getByLabelText(field)).toBeInTheDocument();
});

it('mostra estado arquivado, vazio e cobertura offline', async () => {
    state.offline.localOnly = true;
    render(<QuickCheckIn habits={[{ ...diaryHabit, ativo: false }]} full />, { wrapper });
    await screen.findByText('Nenhum registro de hoje nos dados disponíveis.');
    expect(screen.getByRole('button', { name: 'Salvar registro' })).toBeDisabled();
    expect(screen.getByText(/Cobertura local parcial/)).toBeInTheDocument();
});

it('não duplica registros entre páginas e limpa a consulta ao mudar período', async () => {
    client.diary.mockResolvedValueOnce({ records: [diaryRecord], nextCursor: 'page2', partial: false })
        .mockResolvedValueOnce({ records: [diaryRecord, { ...diaryRecord, id: 'second' }], nextCursor: null, partial: false })
        .mockResolvedValueOnce({ records: [], nextCursor: null, partial: true });
    render(<Diary habitId={diaryHabit.id} accountKey="a:epoch" />, { wrapper });
    fireEvent.click(await screen.findByRole('button', { name: 'Carregar mais registros' }));
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(2));
    fireEvent.change(screen.getByLabelText('Início'), { target: { value: '2026-09-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Consultar período' }));
    await screen.findByText('Nenhum registro neste período nos dados disponíveis.');
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
    expect(screen.getByText(/Cobertura parcial/)).toBeInTheDocument();
});

it('preserva texto legado inteiro no editor e salva o rascunho antes da intenção', async () => {
    const legacy = { ...diaryRecord, observacoes: 'L'.repeat(1800) };
    client.diary.mockImplementation(async method => method === 'detail' ? { record: legacy } : { id: 'edit' });
    render(<RecordEditor accountKey="a:epoch" recordId={legacy.id} onClose={() => {}} />, { wrapper });
    expect(await screen.findByLabelText('Observações')).toHaveValue(legacy.observacoes);
    fireEvent.change(screen.getByLabelText('Humor'), { target: { value: 'neutro' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar correção' }));
    await screen.findByText(/Correção salva neste navegador/);
    const edit = client.diary.mock.calls.find(([method]) => method === 'edit');
    expect(edit[1][1].observacoes).toBe(legacy.observacoes);
    expect(client.saveRecordDraft.mock.invocationCallOrder[1]).toBeLessThan(client.diary.mock.invocationCallOrder[1]);
});

it('restaura conflito da fila após montagem e compara remoto sem substituir texto local', async () => {
    const pending = { id: 'edit', type: 'record.update', payload: { recordId: diaryRecord.id, humor: 'neutro' }, status: 'recovery', lastError: { code: 'REVISAO_CONFLITO' } };
    state.offline.queue = [pending];
    client.diary.mockImplementation(async (method, args) => method === 'detail' ? { record: { ...diaryRecord, revision: args[1] ? 2 : 1 }, pending } : { id: 'replacement' });
    render(<RecordEditor accountKey="a:epoch" recordId={diaryRecord.id} onClose={() => {}} />, { wrapper });
    expect(await screen.findByLabelText('Humor')).toHaveValue('neutro');
    fireEvent.click(screen.getByRole('button', { name: 'Consultar versão remota sem apagar meu texto' }));
    const compare = await screen.findByRole('region', { name: 'Comparação local e remota' });
    expect(within(compare).getByText('bom')).toBeInTheDocument();
    expect(screen.getByLabelText('Humor')).toHaveValue('neutro');
    fireEvent.click(screen.getByRole('button', { name: 'Reaplicar minha correção nesta versão' }));
    await waitFor(() => expect(client.diary.mock.calls.find(([method]) => method === 'edit')[1][2]).toBe('edit'));
});

it('descarta respostas tardias da conta A na consulta da conta B', async () => {
    const late = deferred();
    client.diary.mockImplementation((_method, _args, account) => account === 'a:epoch' ? late.promise : Promise.resolve({ records: [] }));
    const { rerender } = render(<Diary key="a" habitId={diaryHabit.id} accountKey="a:epoch" />, { wrapper });
    state.offline.accountKey = 'b:epoch';
    rerender(<Diary key="b" habitId="b-habit" accountKey="b:epoch" />);
    await screen.findByText('Nenhum registro neste período nos dados disponíveis.');
    await act(async () => late.resolve({ records: [diaryRecord] }));
    expect(screen.queryByText(diaryRecord.observacoes)).not.toBeInTheDocument();
});

it('aguarda abertura do banco e refaz consulta depois do bootstrap', async () => {
    state.offline.loading = true;
    const { rerender } = render(<QuickCheckIn habits={[diaryHabit]} />, { wrapper });
    expect(client.diary).not.toHaveBeenCalled();
    state.offline.loading = false; state.offline.snapshot = { updatedAt: 'first' };
    rerender(<QuickCheckIn habits={[diaryHabit]} />);
    await screen.findByText('Nenhum registro de hoje nos dados disponíveis.');
    client.diary.mockResolvedValue({ records: [diaryRecord] });
    state.offline.snapshot = { updatedAt: 'second' };
    rerender(<QuickCheckIn habits={[diaryHabit]} />);
    await screen.findByText('Já existe registro para este hábito hoje.');
});
