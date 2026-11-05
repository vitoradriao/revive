import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import HabitManagement from './HabitManagement';
import { managementFixture } from '../../test/habitManagementFixture';

const state = vi.hoisted(() => ({ offline: {} }));
vi.mock('../../contexts/OfflineContext', () => ({ useOffline: () => state.offline }));
const key = 'account-a:generation-a';
let fixture, coordinator;
const renderEditor = (accountKey = key, habit = fixture.data.vicios[0]) => render(
    <MemoryRouter><HabitManagement key={accountKey} accountKey={accountKey} habit={habit} /></MemoryRouter>
);
const ready = async () => screen.findByRole('button', { name: 'Salvar alterações' });
const saveDraft = async (label, value) => {
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
    await waitFor(() => expect(screen.queryByText('Salvando rascunho neste navegador…')).not.toBeInTheDocument());
};
beforeEach(() => {
    fixture = managementFixture(); coordinator = fixture.makeCoordinator();
    sessionStorage.clear();
    HTMLDialogElement.prototype.showModal = function () { this.open = true; };
    HTMLDialogElement.prototype.close = function () { this.open = false; };
    state.offline = { localOnly: false, client: {
        getHabitDraft: vi.fn(id => fixture.store.getHabitDraft(id)),
        saveHabitDraft: vi.fn((id, draft) => fixture.store.saveHabitDraft(id, draft)),
        manageHabit: vi.fn((habitId, id, input) => coordinator.manageHabit(habitId, id, input))
    } };
});

describe('gerenciamento de hábitos no painel', () => {
    it('na introdução salva somente o motivo e mantém separado o rascunho de edição completa', async () => {
        const existing = await fixture.prepare('full-editor', { name: 'Nome ainda não enviado', dailySavings: '23,00' });
        sessionStorage.setItem('revive-habit-editor:account-a:habit-1', 'full-editor');
        const onConfirmed = vi.fn();
        render(<MemoryRouter><HabitManagement habit={fixture.data.vicios[0]} accountKey={key} reasonOnly onConfirmed={onConfirmed} /></MemoryRouter>);
        await screen.findByRole('button', { name: 'Salvar motivo' });
        expect(screen.queryByLabelText('Nome do hábito')).not.toBeInTheDocument();
        await saveDraft('Motivo pessoal (opcional)', 'Motivo sintético');
        await waitFor(() => expect(screen.getByRole('button', { name: 'Salvar motivo' })).toBeEnabled());
        fireEvent.click(screen.getByRole('button', { name: 'Salvar motivo' }));
        await waitFor(() => expect(onConfirmed).toHaveBeenCalledTimes(1));
        const call = state.offline.client.manageHabit.mock.calls[0];
        expect(call[2]).toEqual({ revision: 1, motivo_pessoal: 'Motivo sintético' });
        expect(await fixture.store.getHabitDraft('full-editor')).toEqual(existing);
        expect(fixture.data.vicios[0].nome_vicio).toBe('Café');
    });
    it('preserva rascunho e versão remota após conflito e reload, exigindo revisão explícita', async () => {
        const view = renderEditor(); await ready();
        await saveDraft('Nome do hábito', 'Meu nome');
        Object.assign(fixture.data.vicios[0], { nome_vicio: 'Outro nome', revision: 2 });
        fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
        expect(await screen.findByRole('region', { name: 'Revisão da edição' })).toHaveTextContent('Outro nome');
        expect(screen.getByLabelText('Nome do hábito')).toHaveValue('Meu nome');
        view.unmount(); renderEditor(); await ready();
        expect(screen.getByLabelText('Nome do hábito')).toHaveValue('Meu nome');
        expect(screen.getByRole('button', { name: 'Salvar alterações' })).toBeDisabled();
        expect(fixture.data.vicios[0].nome_vicio).toBe('Outro nome');
        fireEvent.click(screen.getByRole('button', { name: 'Manter rascunho e revisar com esta versão' }));
        await waitFor(() => expect(screen.getByRole('button', { name: 'Salvar alterações' })).toBeEnabled());
        expect(fixture.data.vicios[0].nome_vicio).toBe('Outro nome');
        fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
        await screen.findByText('Alteração confirmada. Histórico, metas e conquistas foram preservados.');
        expect(fixture.data.vicios[0]).toMatchObject({ nome_vicio: 'Meu nome', revision: 3 });
    });
    it('confirma arquivo em diálogo com nome, descrição, foco em cancelar e ação de reativar', async () => {
        const view = renderEditor(); await ready();
        fireEvent.click(screen.getByRole('button', { name: 'Arquivar hábito' }));
        const dialog = screen.getByRole('dialog', { name: 'Arquivar hábito?' });
        expect(dialog).toHaveAccessibleDescription(/Histórico, conquistas e metas serão preservados/);
        expect(within(dialog).getByRole('button', { name: 'Cancelar' })).toHaveFocus();
        fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
        expect(state.offline.client.manageHabit).not.toHaveBeenCalled();
        expect(screen.getByRole('button', { name: 'Arquivar hábito' })).toHaveFocus();
        fireEvent.click(screen.getByRole('button', { name: 'Arquivar hábito' }));
        fireEvent.click(screen.getByRole('button', { name: 'Confirmar arquivamento' }));
        await screen.findByText('Alteração confirmada. Histórico, metas e conquistas foram preservados.');
        expect(fixture.data.vicios[0].ativo).toBe(false);
        view.unmount(); renderEditor(); await ready();
        fireEvent.click(screen.getByRole('button', { name: 'Reativar hábito' }));
        fireEvent.click(screen.getByRole('button', { name: 'Confirmar reativação' }));
        await waitFor(() => expect(fixture.data.vicios[0].ativo).toBe(true));
    });
    it('offline conserva edição local, mas bloqueia envio e arquivo', async () => {
        state.offline.localOnly = true;
        renderEditor(); await ready();
        await saveDraft('Nome do hábito', 'Rascunho local');
        expect(screen.getByRole('button', { name: 'Salvar alterações' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Arquivar hábito' })).toBeDisabled();
        expect((await fixture.store.getHabitDraft(sessionStorage.getItem('revive-habit-editor:account-a:habit-1'))).values.name).toBe('Rascunho local');
        expect(state.offline.client.manageHabit).not.toHaveBeenCalled();
    });
    it('resposta perdida permanece incerta no reload e consulta remota não envia segundo PATCH', async () => {
        const original = fixture.request.getMockImplementation();
        fixture.request.mockImplementation(async (path, options) => {
            const result = await original(path, options);
            if (options?.method === 'PATCH') throw Object.assign(new Error('Rede interrompida'), { outcomeUnknown: true });
            return result;
        });
        const view = renderEditor(); await ready(); await saveDraft('Nome do hábito', 'Nome enviado');
        fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
        await screen.findByText('Não há confirmação da alteração. Consulte o estado remoto antes de reaplicar.');
        expect(screen.queryByText(/Alteração confirmada\./)).not.toBeInTheDocument();
        view.unmount(); renderEditor(); await ready();
        expect(screen.getByRole('button', { name: 'Salvar alterações' })).toBeDisabled();
        fireEvent.click(screen.getByRole('button', { name: 'Consultar estado remoto' }));
        await screen.findByText(/Estado remoto consultado/);
        expect(screen.getByRole('region', { name: 'Revisão da edição' })).toHaveTextContent('Nome enviado');
        expect(fixture.request.mock.calls.filter(([, options]) => options?.method === 'PATCH')).toHaveLength(1);
        expect(screen.queryByText(/Alteração confirmada\./)).not.toBeInTheDocument();
    });
    it('pendência incompatível oferece recuperação e não apaga o rascunho', async () => {
        await coordinator.enqueue('record.create', { vicio_id: 'habit-1' }, { id: 'pending' });
        await fixture.store.markFailed('pending', { code: 'VALIDACAO' });
        renderEditor(); await ready(); await saveDraft('Nome do hábito', 'Texto preservado');
        fireEvent.click(screen.getByRole('button', { name: 'Arquivar hábito' }));
        fireEvent.click(screen.getByRole('button', { name: 'Confirmar arquivamento' }));
        expect(await screen.findByRole('alert')).toHaveTextContent('Nenhuma operação foi descartada');
        expect(screen.getByRole('link', { name: 'Resolver operações pendentes' })).toHaveAttribute('href', '/sincronizacao');
        expect(screen.getByLabelText('Nome do hábito')).toHaveValue('Texto preservado');
        expect(await fixture.store.getQueue()).toHaveLength(1);
    });
    it('início restrito permanece desabilitado e não é incluído no PATCH', async () => {
        fixture.data.vicios[0].inicio_editavel = false;
        renderEditor(); await ready();
        expect(screen.getByLabelText('Data de início')).toBeDisabled();
        await saveDraft('Economia diária (R$)', '25,00');
        fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
        await screen.findByText('Alteração confirmada. Histórico, metas e conquistas foram preservados.');
        const call = fixture.request.mock.calls.find(([, options]) => options?.method === 'PATCH');
        expect(JSON.parse(call[1].body)).toEqual({ revision: 1, valor_economizado_por_dia: 25 });
    });
    it('falha de armazenamento não apaga edição nem permite envio sem persistir', async () => {
        renderEditor(); await ready();
        state.offline.client.saveHabitDraft.mockRejectedValue(new Error('Armazenamento indisponível'));
        await saveDraft('Nome do hábito', 'Meu texto');
        fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
        await screen.findByRole('alert');
        expect(screen.getByLabelText('Nome do hábito')).toHaveValue('Meu texto');
        expect(state.offline.client.manageHabit).not.toHaveBeenCalled();
    });
    it('resposta tardia de A não modifica formulário nem confirmação de B', async () => {
        let finish;
        state.offline.client.manageHabit.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
        const view = renderEditor(); await ready(); await saveDraft('Nome do hábito', 'Texto A');
        await saveDraft('Motivo pessoal (opcional)', 'synthetic-private-a');
        fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
        await waitFor(() => expect(finish).toBeTypeOf('function'));
        state.offline.client.getHabitDraft.mockResolvedValue(null);
        view.rerender(<MemoryRouter><HabitManagement key="account-b" accountKey="account-b:generation-b" habit={{ ...fixture.data.vicios[0], nome_vicio: 'Hábito B', motivo_pessoal: 'synthetic-private-b' }} /></MemoryRouter>);
        await ready(); expect(screen.getByLabelText('Nome do hábito')).toHaveValue('Hábito B');
        await act(async () => finish({ status: 'confirmed', values: { name: 'Texto A', personalReason: 'synthetic-private-a' }, message: 'Alteração confirmada.' }));
        expect(screen.getByLabelText('Nome do hábito')).toHaveValue('Hábito B');
        expect(screen.queryByText('Alteração confirmada.')).not.toBeInTheDocument();
        expect(screen.getByLabelText('Motivo pessoal (opcional)')).toHaveValue('synthetic-private-b');
        expect(screen.queryByText('synthetic-private-a')).not.toBeInTheDocument();
    });
});

it('lê último motivo sincronizado offline e preserva rascunho acima do limite sem enviar', async () => {
    fixture.data.vicios[0].motivo_pessoal = 'synthetic-confirmed';
    fixture.data.vicios[0].ativo = false;
    state.offline.localOnly = true;
    const view = renderEditor(); await ready();
    expect(screen.getByLabelText('Motivo pessoal sincronizado')).toHaveTextContent('synthetic-confirmed');
    expect(screen.getByRole('button', { name: 'Salvar alterações' })).toBeDisabled();
    state.offline.localOnly = false; view.unmount(); renderEditor(); await ready();
    await saveDraft('Motivo pessoal (opcional)', '😀'.repeat(1001));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('1000');
    expect([...screen.getByLabelText('Motivo pessoal (opcional)').value]).toHaveLength(1001);
    expect(state.offline.client.manageHabit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Limpar motivo pessoal' }));
    await waitFor(() => expect(screen.queryByText('Salvando rascunho neste navegador…')).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    await screen.findByText('Alteração confirmada. Histórico, metas e conquistas foram preservados.');
    expect(fixture.data.vicios[0].motivo_pessoal).toBeNull();
    expect(fixture.data.vicios[0].ativo).toBe(false);
});

it('preserva e compara o motivo pessoal em conflito após reload', async () => {
    const view = renderEditor(); await ready();
    await saveDraft('Motivo pessoal (opcional)', 'synthetic-draft');
    Object.assign(fixture.data.vicios[0], { motivo_pessoal: 'synthetic-remote', revision: 2 });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    const region = await screen.findByRole('region', { name: 'Revisão da edição' });
    expect(region).toHaveTextContent('synthetic-draft');
    expect(region).toHaveTextContent('synthetic-remote');
    view.unmount(); renderEditor(); await ready();
    expect(screen.getByLabelText('Motivo pessoal (opcional)')).toHaveValue('synthetic-draft');
    fireEvent.click(screen.getByRole('button', { name: 'Substituir rascunho pela versão remota' }));
    await waitFor(() => expect(screen.getByLabelText('Motivo pessoal (opcional)')).toHaveValue('synthetic-remote'));
});
