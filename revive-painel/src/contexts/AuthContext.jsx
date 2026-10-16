/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import * as authService from '../services/auth.service';
import { getSessionManager } from '../services/session-manager';
import { useUI } from './UIContext';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const manager = getSessionManager();
  const state = useSyncExternalStore(manager.subscribe, manager.getSnapshot, manager.getSnapshot);
  const { showToast, resetSessionUI } = useUI();
  const sessionKey = state.user ? `${state.user.id}:${state.epoch}` : 'anonymous';
  const previousKey = useRef(sessionKey);
  useLayoutEffect(() => {
    if (previousKey.current !== sessionKey) resetSessionUI?.();
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
  const logout = useCallback(async (showMessage = true) => {
    try {
      await manager.logout();
      if (showMessage) showToast('info', 'Sessão encerrada.');
      return true;
    } catch {
      showToast('error', 'Não foi possível confirmar a saída. Verifique a conexão e tente novamente.');
      return false;
    }
  }, [manager, showToast]);

  return <AuthContext.Provider key={sessionKey} value={{
    token: state.token, user: state.user, sessionEpoch: state.epoch, authLoading: state.authLoading, authError: state.authError,
    login, cadastro, logout, restoreSession: manager.restore
  }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
