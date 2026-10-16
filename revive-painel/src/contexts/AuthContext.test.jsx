import React, { useState } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from './AuthContext';
import { createSessionManager } from '../services/session-manager';

const { managerRef, mockShowToast } = vi.hoisted(() => ({ managerRef: { current: null }, mockShowToast: vi.fn() }));
vi.mock('./UIContext', () => ({ useUI: () => ({ showToast: mockShowToast }) }));
vi.mock('../services/session-manager', async importOriginal => ({
  ...await importOriginal(), getSessionManager: () => managerRef.current
}));

function Consumer() {
  const [draft, setDraft] = useState('');
  const { login, logout, restoreSession, token, user, authLoading, authError } = useAuth();
  return <div>
    <input aria-label="Rascunho sintético" value={draft} onChange={event => setDraft(event.target.value)} />
    <button disabled={authLoading} onClick={() => login('synthetic@example.invalid', 'Synthetic!1')}>Login</button>
    <button onClick={() => logout()}>Logout</button>
    <button onClick={restoreSession}>Restaurar</button>
    <span data-testid="token">{token}</span><span data-testid="user">{user?.id || ''}</span>
    <span data-testid="loading">{String(authLoading)}</span>
    {authError && <p role="alert">{authError.message}</p>}
  </div>;
}
let cookie, offline, counter;
beforeEach(() => {
  localStorage.clear(); vi.clearAllMocks(); cookie = false; offline = false; counter = 0;
  managerRef.current = createSessionManager({
    storage: localStorage, locks: { request: (_name, task) => Promise.resolve().then(task) },
    listenStorage: () => () => {}, makeChannel: () => ({ postMessage() {}, close() {} }),
    request: async (path, options) => {
      if (offline) throw Object.assign(new Error('Conexão indisponível'), { code: 'REDE_INDISPONIVEL' });
      if (path.endsWith('/logout')) { cookie = false; return {}; }
      if (path.endsWith('/login')) { expect(JSON.parse(options.body).senha).toBe('Synthetic!1'); cookie = true; }
      if (!cookie) throw Object.assign(new Error('Sem sessão'), { status: 401 });
      return { access_token: 'memory-token-' + ++counter, expires_in: 900, usuario: { id: 'synthetic-user' } };
    }
  });
});
afterEach(() => managerRef.current.dispose());

describe('AuthContext cookie session', () => {
  it('keeps login credentials only in memory and removes the old localStorage JWT', async () => {
    localStorage.setItem('revive_token', 'old-secret');
    render(<AuthProvider><Consumer /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));
    fireEvent.click(screen.getByText('Login'));
    await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('synthetic-user'));
    expect(screen.getByTestId('token')).toHaveTextContent('memory-token-1');
    expect(localStorage.getItem('revive_token')).toBeNull();
    expect(JSON.stringify({ ...localStorage })).not.toContain('memory-token');
    expect(mockShowToast).toHaveBeenCalledWith('success', 'Login realizado com sucesso!');
  });
  it('restores a valid cookie session during initialization', async () => {
    cookie = true;
    render(<AuthProvider><Consumer /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('synthetic-user'));
    expect(screen.getByTestId('loading')).toHaveTextContent('false');
  });
  it('lets a network failure be retried without calling it invalid credentials', async () => {
    cookie = true; offline = true;
    render(<AuthProvider><Consumer /></AuthProvider>);
    expect(await screen.findByRole('alert')).toHaveTextContent('Conexão indisponível');
    expect(mockShowToast).not.toHaveBeenCalled();
    offline = false; fireEvent.click(screen.getByText('Restaurar'));
    await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('synthetic-user'));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
  it('preserves a draft on refresh and removes it before the next login', async () => {
    cookie = true;
    render(<AuthProvider><Consumer /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('synthetic-user'));
    fireEvent.change(screen.getByLabelText('Rascunho sintético'), { target: { value: 'private synthetic draft' } });
    const old = managerRef.current.getSnapshot().token;
    await act(async () => { await managerRef.current.ensureToken(old); });
    expect(screen.getByLabelText('Rascunho sintético')).toHaveValue('private synthetic draft');
    fireEvent.click(screen.getByText('Logout'));
    await waitFor(() => expect(screen.getByTestId('user')).toBeEmptyDOMElement());
    expect(screen.getByLabelText('Rascunho sintético')).toHaveValue('');
    fireEvent.click(screen.getByText('Login'));
    await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('synthetic-user'));
    expect(screen.getByLabelText('Rascunho sintético')).toHaveValue('');
  });

  it('does not announce a successful logout on network failure', async () => {
    cookie = true;
    render(<AuthProvider><Consumer /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('synthetic-user'));
    offline = true; fireEvent.click(screen.getByText('Logout'));
    await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith('error', expect.stringContaining('Não foi possível confirmar a saída')));
    expect(screen.getByTestId('user')).toHaveTextContent('synthetic-user');
  });
});
