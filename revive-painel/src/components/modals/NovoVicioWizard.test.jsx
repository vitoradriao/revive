import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import NovoVicioWizard from './NovoVicioWizard';
import { localDateKey } from '../../utils/habitForm';

function setup(onSubmit = vi.fn().mockResolvedValue({ vicio: { id: '1' } }), onCheckHabits = vi.fn().mockResolvedValue([])) {
  const onClose = vi.fn();
  render(<NovoVicioWizard isOpen onSubmit={onSubmit} onClose={onClose} onCheckHabits={onCheckHabits} />);
  fireEvent.change(screen.getByLabelText('Nome do hábito'), { target: { value: 'Café' } });
  return { onSubmit, onClose, onCheckHabits };
}
describe('NovoVicioWizard', () => {
  it('shows only effective fields and submits blank savings as zero', async () => {
    const { onSubmit, onClose } = setup();
    expect(screen.queryByText('Reduzir')).not.toBeInTheDocument();
    expect(screen.queryByText('Lembretes diários')).not.toBeInTheDocument();
    expect(screen.queryByText('Prazo')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Data de início')).toHaveValue(localDateKey());
    fireEvent.click(screen.getByRole('button', { name: 'Salvar hábito' }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({ nome_vicio: 'Café', data_inicio: localDateKey(), valor_economizado_por_dia: 0 });
  });
  it('uses category only to fill the editable name, parses Brazilian money and chosen day', async () => {
    const { onSubmit } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Cigarro' }));
    fireEvent.change(screen.getByLabelText('Nome do hábito'), { target: { value: ' Meu hábito ' } });
    fireEvent.change(screen.getByLabelText('Data de início'), { target: { value: '2024-02-29' } });
    fireEvent.change(screen.getByLabelText('Economia por dia (R$)'), { target: { value: '1.234,56' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar hábito' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ nome_vicio: 'Meu hábito', data_inicio: '2024-02-29', valor_economizado_por_dia: 1234.56 }));
  });
  it('retains inputs and does not close on server rejection', async () => {
    const { onClose } = setup(vi.fn().mockRejectedValue(new Error('Serviço indisponível')));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar hábito' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Serviço indisponível');
    expect(screen.getByLabelText('Nome do hábito')).toHaveValue('Café');
    expect(onClose).not.toHaveBeenCalled();
  });
  it('blocks double click, cancel and Escape while sending', async () => {
    let resolve;
    const { onSubmit, onClose } = setup(vi.fn().mockReturnValue(new Promise(done => { resolve = done; })));
    const button = screen.getByRole('button', { name: 'Salvar hábito' });
    fireEvent.click(button); fireEvent.click(button);
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
    await act(async () => resolve({ vicio: { id: '1' } }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
  it('requires a successful consultation and explicit decision before an uncertain retry', async () => {
    const uncertain = Object.assign(new Error('Sem confirmação'), { outcomeUnknown: true });
    const { onSubmit, onClose, onCheckHabits } = setup(vi.fn().mockRejectedValueOnce(uncertain).mockResolvedValueOnce({ vicio: { id: '2' } }));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar hábito' }));
    await screen.findByText(/O envio anterior não foi confirmado/);
    expect(screen.getByRole('button', { name: 'Tentar salvar novamente' })).toBeDisabled();
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Consultar hábitos cadastrados' }));
    await screen.findByText('Nenhum hábito encontrado nesta consulta.');
    expect(onCheckHabits).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Tentar salvar novamente' })).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Tentar salvar novamente' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2));
    expect(onSubmit.mock.calls[1][0]).toEqual(onSubmit.mock.calls[0][0]);
  });
  it('keeps retry disabled when consultation fails', async () => {
    setup(vi.fn().mockRejectedValue(Object.assign(new Error('Sem confirmação'), { outcomeUnknown: true })), vi.fn().mockRejectedValue(new Error('offline')));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar hábito' }));
    await screen.findByText(/O envio anterior não foi confirmado/);
    fireEvent.click(screen.getByRole('button', { name: 'Consultar hábitos cadastrados' }));
    await screen.findByText(/Não foi possível consultar os hábitos/);
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tentar salvar novamente' })).toBeDisabled();
  });
  it('shows confirmed habits after an uncertain response without claiming a match', async () => {
    const { onClose } = setup(vi.fn().mockRejectedValue(Object.assign(new Error('Sem confirmação'), { outcomeUnknown: true })),
      vi.fn().mockResolvedValue([{ id: '1', nome_vicio: 'Café', data_inicio: '2026-10-01', valor_economizado_por_dia: 12.5 }]));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar hábito' }));
    await screen.findByText(/O envio anterior não foi confirmado/);
    fireEvent.click(screen.getByRole('button', { name: 'Consultar hábitos cadastrados' }));
    expect(await screen.findByRole('list', { name: 'Hábitos cadastrados' })).toHaveTextContent('Café');
    expect(onClose).not.toHaveBeenCalled();
  });
  it('validates before sending and focuses the invalid field', () => {
    const { onSubmit } = setup();
    fireEvent.change(screen.getByLabelText('Data de início'), { target: { value: '9999-12-31' } });
    fireEvent.change(screen.getByLabelText('Economia por dia (R$)'), { target: { value: '-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar hábito' }));
    expect(screen.getByLabelText('Data de início')).toHaveFocus();
    expect(screen.getByLabelText('Economia por dia (R$)')).toHaveAttribute('aria-invalid', 'true');
    expect(onSubmit).not.toHaveBeenCalled();
  });
  it('keeps keyboard focus inside the dialog and supports Escape', () => {
    const { onClose } = setup();
    const first = screen.getByRole('button', { name: 'Fechar' });
    const last = screen.getByRole('button', { name: 'Salvar hábito' });
    last.focus(); fireEvent.keyDown(window, { key: 'Tab' });
    expect(first).toHaveFocus();
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
    expect(last).toHaveFocus();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });
});
