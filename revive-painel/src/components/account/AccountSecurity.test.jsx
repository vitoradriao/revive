import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AccountSecurity from './AccountSecurity';
const mocks = vi.hoisted(() => ({ remove: vi.fn() }));
vi.mock('../../contexts/OfflineContext', () => ({ useOffline: () => ({ accountKey: 'account-a:generation-a', queue: [{ id: 'pending' }], client: { deleteAccount: mocks.remove } }) }));
beforeEach(() => {
  vi.clearAllMocks();
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
});
const open = () => {
  render(<MemoryRouter><AccountSecurity /></MemoryRouter>);
  fireEvent.click(screen.getByRole('button', { name: 'Excluir conta' }));
  return screen.getByRole('dialog');
};
describe('exclusão de conta', () => {
  it('cancelar por botão ou Escape não chama exclusão e restaura foco', () => {
    const dialog = open();
    expect(dialog).toHaveAccessibleDescription(/pendências, rascunhos, páginas e preferências/);
    expect(within(dialog).getByRole('button', { name: 'Cancelar exclusão' })).toHaveFocus();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar exclusão' }));
    expect(mocks.remove).not.toHaveBeenCalled(); expect(screen.getByRole('button', { name: 'Excluir conta' })).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Excluir conta' }));
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { bubbles: false, cancelable: true }));
    expect(mocks.remove).not.toHaveBeenCalled();
  });
  it('falha remota mantém diálogo e permite tentar novamente na mesma conta', async () => {
    mocks.remove.mockRejectedValue(new Error('failure')); open();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar exclusão permanente' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('pendências locais foram preservadas');
    expect(mocks.remove).toHaveBeenCalledWith('account-a:generation-a');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Confirmar exclusão permanente' })).toBeEnabled());
  });
  it('offline preserva a conta e impede requisição', () => {
    open(); Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar exclusão permanente' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Sem conexão'); expect(mocks.remove).not.toHaveBeenCalled();
  });
});
