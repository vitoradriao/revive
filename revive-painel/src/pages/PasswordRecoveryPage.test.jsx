import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PasswordRecoveryPage from './PasswordRecoveryPage';
const mocks = vi.hoisted(() => ({ request: vi.fn(), confirm: vi.fn() }));
vi.mock('../services/password-recovery.service', async original => ({ ...await original(), requestRecovery: mocks.request, confirmRecovery: mocks.confirm }));
const renderPage = () => render(<MemoryRouter initialEntries={['/recuperar-senha']}><Routes><Route path="/recuperar-senha" element={<PasswordRecoveryPage />} /><Route path="/login" element={<h1>Login público</h1>} /></Routes></MemoryRouter>);
const send = async () => {
  fireEvent.change(screen.getByLabelText('E-mail da conta'), { target: { value: 'Synthetic@example.invalid' } });
  fireEvent.click(screen.getByRole('button', { name: 'Solicitar código' }));
  await screen.findByLabelText('Código de oito dígitos');
  await screen.findByRole('button', { name: 'Reenviar em 123s' });
};
beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear(); sessionStorage.clear();
  mocks.request.mockResolvedValue({ request_id: '00000000-0000-4000-8000-000000000001', reenviar_apos: 123, mensagem: 'Se houver uma conta com este e-mail, você receberá um código.' });
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
});
afterEach(() => { vi.useRealTimers(); });
describe('recuperação de senha', () => {
  it('informa neutralidade, foca código, impede reenvio antecipado e não persiste segredos', async () => {
    renderPage(); await send();
    expect(screen.getByText(/não confirma a entrega/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Reenviar em 123s/ })).toBeDisabled();
    expect(screen.getByLabelText('Código de oito dígitos')).toHaveFocus();
    fireEvent.change(screen.getByLabelText('Código de oito dígitos'), { target: { value: '12345678' } });
    fireEvent.change(screen.getByLabelText(/^Nova senha/), { target: { value: 'Synthetic!1' } });
    fireEvent.change(screen.getByLabelText('Confirmar nova senha'), { target: { value: 'Synthetic!1' } });
    mocks.confirm.mockRejectedValueOnce(new Error('Código inválido, expirado ou já utilizado.'));
    fireEvent.click(screen.getByRole('button', { name: 'Redefinir senha' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Código inválido');
    expect(screen.queryByText('Login público')).not.toBeInTheDocument();
    mocks.confirm.mockResolvedValue({});
    fireEvent.click(screen.getByRole('button', { name: 'Redefinir senha' }));
    await screen.findByText('Login público');
    expect(localStorage.length + sessionStorage.length).toBe(0);
  });
  it('usa o relógio para liberar reenvio e limpar os campos sensíveis', async () => {
    renderPage(); await send(); vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 123000);
    await screen.findByRole('button', { name: 'Reenviar código' }, { timeout: 2000 });
    fireEvent.click(screen.getByRole('button', { name: 'Reenviar código' }));
    await act(async () => {});
    expect(mocks.request).toHaveBeenCalledTimes(2);
    expect(screen.getByLabelText('Código de oito dígitos')).toHaveValue('');
  });
  it('offline não envia nem coloca recuperação na fila', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false }); renderPage();
    fireEvent.change(screen.getByLabelText('E-mail da conta'), { target: { value: 's@example.invalid' } });
    fireEvent.click(screen.getByRole('button', { name: 'Solicitar código' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Sem conexão'); expect(mocks.request).not.toHaveBeenCalled();
  });
  it('ignora retorno tardio depois de sair da página', async () => {
    let release; mocks.request.mockImplementation(() => new Promise(done => { release = done; }));
    const view = renderPage(); fireEvent.change(screen.getByLabelText('E-mail da conta'), { target: { value: 's@example.invalid' } });
    fireEvent.click(screen.getByRole('button', { name: 'Solicitar código' })); view.unmount();
    await act(async () => { release({ request_id: 'synthetic', reenviar_apos: 10 }); });
    expect(mocks.confirm).not.toHaveBeenCalled();
  });
  it('não anuncia solicitação quando a resposta é perdida', async () => {
    mocks.request.mockRejectedValue(new Error('Não foi possível confirmar a resposta do servidor.')); renderPage();
    fireEvent.change(screen.getByLabelText('E-mail da conta'), { target: { value: 's@example.invalid' } });
    fireEvent.click(screen.getByRole('button', { name: 'Solicitar código' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível confirmar'));
    expect(screen.queryByLabelText('Código de oito dígitos')).not.toBeInTheDocument();
  });
});
