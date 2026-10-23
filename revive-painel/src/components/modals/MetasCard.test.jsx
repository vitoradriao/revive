import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import MetasCard from './MetasCard';

const renderMetasCard = (onAddMeta = vi.fn().mockResolvedValue()) => {
  render(
    <MetasCard
      metas={[]}
      vicios={[{
        id: 'vicio-1',
        nome_vicio: 'Cigarro',
        dias_abstinencia: 63,
        valor_economizado: '995'
      }]}
      onAddMeta={onAddMeta}
      onCompleteMeta={vi.fn()}
      onDeleteMeta={vi.fn()}
      loading={false}
    />
  );

  return onAddMeta;
};

describe('MetasCard', () => {
  it('submits new goals with a today baseline by default', async () => {
    const onAddMeta = renderMetasCard();

    fireEvent.click(screen.getByRole('button', { name: /nova meta/i }));
    fireEvent.click(screen.getByRole('button', { name: /selecione um hábito/i }));
    fireEvent.click(screen.getByRole('option', { name: 'Cigarro' }));
    fireEvent.change(screen.getByPlaceholderText('Descrição da meta...'), {
      target: { value: '30 dias limpo' }
    });
    fireEvent.change(screen.getByPlaceholderText('Dias objetivo'), {
      target: { value: '30' }
    });
    fireEvent.click(screen.getByRole('button', { name: /adicionar meta/i }));

    await waitFor(() => expect(onAddMeta).toHaveBeenCalledTimes(1));
    expect(onAddMeta).toHaveBeenCalledWith(expect.objectContaining({
      vicio_id: 'vicio-1',
      descricao_meta: '30 dias limpo',
      dias_objetivo: 30,
      iniciar_hoje: true,
    }), expect.any(String));
  });
});

it('preserva formulário após erro e bloqueia ação dupla enquanto persiste', async () => {
  let reject;
  const onAdd = vi.fn(() => new Promise((_resolve, fail) => { reject = fail; }));
  renderMetasCard(onAdd);
  fireEvent.click(screen.getByRole('button', { name: /nova meta/i }));
  fireEvent.click(screen.getByRole('button', { name: /selecione um hábito/i }));
  fireEvent.click(screen.getByRole('option', { name: 'Cigarro' }));
  fireEvent.change(screen.getByLabelText('Descrição da meta'), { target: { value: 'Meta preservada' } });
  fireEvent.change(screen.getByLabelText('Dias objetivo'), { target: { value: '30' } });
  const submit = screen.getByRole('button', { name: /adicionar meta/i });
  fireEvent.click(submit); fireEvent.click(submit);
  expect(onAdd).toHaveBeenCalledTimes(1);
  reject(new Error('Armazenamento indisponível'));
  await screen.findByRole('alert');
  expect(screen.getByLabelText('Descrição da meta')).toHaveValue('Meta preservada');
});

it('exibe metas antigas arquivadas mas oferece somente hábitos ativos no formulário', () => {
  render(<MetasCard metas={[{ id: 'goal', vicio_id: 'archived', descricao_meta: 'Meta antiga', dias_objetivo: 10 }]}
    vicios={[{ id: 'archived', nome_vicio: 'Arquivado', ativo: false, dias_abstinencia: 5 }, { id: 'active', nome_vicio: 'Ativo' }]}
    onAddMeta={vi.fn()} onCompleteMeta={vi.fn()} onDeleteMeta={vi.fn()} />);
  expect(screen.getByText('Arquivado · Arquivado')).toBeInTheDocument();
  expect(screen.getByText('50%')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /nova meta/i }));
  fireEvent.click(screen.getByRole('button', { name: /selecione um hábito/i }));
  expect(screen.queryByRole('option', { name: 'Arquivado' })).not.toBeInTheDocument();
  expect(screen.getByRole('option', { name: 'Ativo' })).toBeInTheDocument();
});

it('identifica falha/conflito sem concluir nem habilitar exclusão de pendência', () => {
  render(<MetasCard metas={[{ id: 'goal', descricao_meta: 'Meta pendente', pending: true, sync_status: 'recovery', completionPending: true }]}
    vicios={[]} onAddMeta={vi.fn()} onCompleteMeta={vi.fn()} onDeleteMeta={vi.fn()} />);
  expect(screen.getByText(/Falha ou conflito/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Excluir meta' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Marcar como concluída' })).toBeDisabled();
});
