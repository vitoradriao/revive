import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import RecaidaModal from './RecaidaModal';
const props = () => ({ isOpen: true, vicio: { id: 'habit', nome_vicio: 'Hábito sintético' }, onClose: vi.fn(), onRefletir: vi.fn().mockResolvedValue({ id: 'saved' }), onResetar: vi.fn().mockResolvedValue({ id: 'saved' }) });

describe('registro de recaída', () => {
  it.each([false, true])('exige escolha explícita e envia momento/fuso preservados com reset %s', async reset => {
    const p = props(); render(<RecaidaModal {...p} />);
    expect(screen.getByRole('dialog', { name: 'Registrar recaída' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Salvar recaída' })).toBeDisabled();
    fireEvent.click(screen.getByRole('radio', { name: reset ? /Sim, iniciar/ : /Não, manter/ }));
    fireEvent.change(screen.getByLabelText('Data da recaída'), { target: { value: '2026-01-02' } });
    fireEvent.change(screen.getByLabelText('Horário da recaída'), { target: { value: '22:30' } });
    fireEvent.change(screen.getByLabelText('Fuso da recaída'), { target: { value: 'America/Sao_Paulo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar recaída' }));
    await waitFor(() => expect(reset ? p.onResetar : p.onRefletir).toHaveBeenCalledWith(p.vicio, {
      motivo: '', resetarContador: reset, occurred_at: '2026-01-03T01:30:00.000Z', timezone: 'America/Sao_Paulo'
    }, expect.any(String)));
    expect(p.onClose).toHaveBeenCalledOnce();
  });
  it('falha preserva formulário e não fecha nem alega registro confirmado', async () => {
    const p = props(); p.onRefletir.mockRejectedValue(new Error('Storage indisponível'));
    render(<RecaidaModal {...p} />);
    expect(screen.queryByText('Recaída registrada')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: /Não, manter/ }));
    fireEvent.change(screen.getByLabelText('Motivo (opcional)'), { target: { value: 'Conteúdo sintético' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar recaída' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Storage indisponível');
    expect(p.onClose).not.toHaveBeenCalled(); expect(screen.getByLabelText('Motivo (opcional)')).toHaveValue('Conteúdo sintético');
  });
  it('archive durante formulário bloqueia envio e mantém conteúdo', () => {
    const p = props(), view = render(<RecaidaModal {...p} />);
    fireEvent.click(screen.getByRole('radio', { name: /Sim, iniciar/ }));
    fireEvent.change(screen.getByLabelText('Motivo (opcional)'), { target: { value: 'Rascunho sintético' } });
    view.rerender(<RecaidaModal {...p} vicio={{ ...p.vicio, ativo: false }} />);
    expect(screen.getByRole('button', { name: 'Salvar recaída' })).toBeDisabled();
    expect(screen.getByLabelText('Motivo (opcional)')).toHaveValue('Rascunho sintético');
    expect(p.onResetar).not.toHaveBeenCalled();
  });
  it('restaura foco ao cancelar pelo teclado', () => {
    const p = props(); render(<RecaidaModal {...p} />);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' }); expect(p.onClose).toHaveBeenCalledOnce();
  });
});
