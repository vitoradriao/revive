/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import * as authService from '../services/auth.service';
import { getSessionManager } from '../services/session-manager';
import { useUI } from './UIContext';

import { useOffline } from './OfflineContext';
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const manager = getSessionManager();
  const state = useSyncExternalStore(manager.subscribe, manager.getSnapshot, manager.getSnapshot);
  const { showToast, resetSessionUI } = useUI();
  const offline = useOffline();
  const user = state.user || (state.authError && !state.authError.status && offline.epoch === state.epoch ? offline.user : null);
  const localAccess = !!user && !state.token && !!offline.snapshot;
  const [exitOpen, setExitOpen] = useState(false), [exitBusy, setExitBusy] = useState(false), [exitError, setExitError] = useState('');
  const exitDialog = useRef(null);
  useEffect(() => {
    if (exitOpen) { exitDialog.current?.showModal?.(); exitDialog.current?.querySelector('[data-cancel-exit]')?.focus(); }
    else exitDialog.current?.close?.();
  }, [exitOpen]);
  const sessionKey = user ? `${user.id}:${state.epoch}` : 'anonymous';
  const previousKey = useRef(sessionKey);
  useLayoutEffect(() => {
    if (previousKey.current !== sessionKey) { resetSessionUI?.(); setExitOpen(false); setExitError(''); }
    previousKey.current = sessionKey;
  }, [sessionKey, resetSessionUI]);
  useEffect(() => { void manager.start(); }, [manager]);

  const login = useCallback(async (email, senha) => {
    const result = await authService.login(email, senha);
    showToast('success', 'Login realizado com sucesso!');
    return result;
  }, [showToast]);
  const cadastro = useCallback(async (nome, email, senha) => {
    const result = await authService.cadastro(nome, email, senha);
    showToast('success', 'Cadastro realizado com sucesso!');
    return result;
  }, [showToast]);
  const finishLogout = useCallback(async (choice = 'check') => {
    try {
      const done = await offline.client.logout(choice);
      if (!done) { setExitOpen(true); return false; }
      setExitOpen(false);
      showToast('info', 'Sessão encerrada.');
      return true;
    } catch (error) {
      if (error.code === 'SESSAO_ALTERADA') return false;
      showToast('error', 'Não foi possível confirmar a saída. Verifique a conexão e tente novamente.');
      return false;
    }
  }, [offline.client, showToast]);
  const logout = useCallback(() => finishLogout(), [finishLogout]);
  const exit = async choice => {
    if (exitBusy) return;
    setExitBusy(true); setExitError('');
    try { if (!await offline.client.logout(choice)) setExitError('Há novas pendências. Revise antes de sair.'); else setExitOpen(false); }
    catch (error) { setExitError(error.message); }
    finally { setExitBusy(false); }
  };

  return <AuthContext.Provider key={sessionKey} value={{
    token: state.token, user, localAccess, sessionEpoch: state.epoch, authLoading: state.authLoading || offline.loading, authError: state.authError,
    login, cadastro, logout, restoreSession: manager.restore
  }}>{children}
    <dialog ref={exitDialog} aria-labelledby="exit-title" onKeyDown={event => {
      if (event.key !== 'Tab') return;
      const buttons = [...event.currentTarget.querySelectorAll('button:not(:disabled)')];
      const first = buttons[0], last = buttons.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }} onCancel={event => { event.preventDefault(); if (!exitBusy) setExitOpen(false); }} className="surface-sand rounded-3xl p-6 max-w-lg backdrop:bg-black/60">
      <h2 id="exit-title" className="text-xl font-bold">Há operações pendentes</h2>
      <p>Sincronize antes de sair ou descarte explicitamente as pendências deste navegador. Sem conexão, cancele e mantenha o conteúdo local.</p>
      {exitError && <p role="alert">{exitError}</p>}
      <div className="flex flex-wrap gap-3 mt-4">
        <button disabled={exitBusy} className="btn-primary p-3" onClick={() => exit('sync')}>Sincronizar e sair</button>
        <button disabled={exitBusy} className="border rounded p-3" onClick={() => exit('discard')}>Descartar pendências e sair</button>
        <button data-cancel-exit disabled={exitBusy} className="border rounded p-3" onClick={() => setExitOpen(false)}>Cancelar</button>
      </div>
    </dialog>
  </AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
