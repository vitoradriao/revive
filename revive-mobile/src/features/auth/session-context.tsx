import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { authRequest, refreshAccessToken, setSessionExpiredHandler } from '@/core/api/client';
import { reviveApi } from '@/core/api/repositories';
import { tokenStore } from '@/core/auth/token-store';
import { clearUserData, countPendingMutations } from '@/core/storage/database';
import { queryClient } from '@/core/query/client';
import type { User } from '@/domain/types';

type SessionContextValue = {
  user: User | null;
  isRestoring: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (name: string, email: string, password: string) => Promise<void>;
  signOut: (discardPending?: boolean) => Promise<{ pending: number }>;
  deleteAccount: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: React.PropsWithChildren) {
  const [user, setUser] = useState<User | null>(null);
  const [isRestoring, setIsRestoring] = useState(true);

  const clearSession = useCallback(async (expected = tokenStore.getGeneration()) => {
    if (!tokenStore.isCurrent(expected)) return false;
    const cleared = await tokenStore.clear(expected);
    if (!cleared || tokenStore.getGeneration() !== expected + 1) return false;
    setUser(null);
    queryClient.clear();
    return true;
  }, []);

  useEffect(() => {
    setSessionExpiredHandler(() => clearSession().then(() => undefined));
    return () => setSessionExpiredHandler(null);
  }, [clearSession]);

  useEffect(() => {
    let active = true;
    const generation = tokenStore.getGeneration();
    (async () => {
      try {
        const refreshToken = await tokenStore.getRefreshToken();
        if (!tokenStore.isCurrent(generation)) return;
        if (!refreshToken) return;
        await refreshAccessToken(generation);
        const restoredUser = await tokenStore.getUser();
        if (active && tokenStore.isCurrent(generation)) setUser(restoredUser);
      } catch {
        // A network outage must not destroy the locally authenticated session.
        const offlineUser = await tokenStore.getUser();
        if (active && tokenStore.isCurrent(generation)) setUser(offlineUser);
      } finally {
        if (active) setIsRestoring(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const generation = tokenStore.beginSessionChange();
    setUser(null);
    queryClient.clear();
    const session = await authRequest('/v2/auth/login', { email, senha: password });
    if (await tokenStore.saveSession(generation, session)) setUser(session.usuario);
  }, []);

  const signUp = useCallback(async (name: string, email: string, password: string) => {
    const generation = tokenStore.beginSessionChange();
    setUser(null);
    queryClient.clear();
    const session = await authRequest('/v2/auth/cadastro', { nome: name, email, senha: password });
    if (await tokenStore.saveSession(generation, session)) setUser(session.usuario);
  }, []);

  const signOut = useCallback(async (discardPending = false) => {
    const currentUser = user;
    const generation = tokenStore.getGeneration();
    const pending = currentUser ? await countPendingMutations(currentUser.id) : 0;
    if (!tokenStore.isCurrent(generation)) return { pending };
    if (pending > 0 && !discardPending) return { pending };
    await reviveApi.logout().catch(() => undefined);
    if (!tokenStore.isCurrent(generation)) return { pending };
    if (currentUser) await clearUserData(currentUser.id);
    await clearSession(generation);
    return { pending: 0 };
  }, [clearSession, user]);

  const deleteAccount = useCallback(async () => {
    const currentUser = user;
    const generation = tokenStore.getGeneration();
    await reviveApi.deleteAccount();
    if (!tokenStore.isCurrent(generation)) return;
    if (currentUser) await clearUserData(currentUser.id);
    await clearSession(generation);
  }, [clearSession, user]);

  const value = useMemo(() => ({ user, isRestoring, signIn, signUp, signOut, deleteAccount }), [user, isRestoring, signIn, signUp, signOut, deleteAccount]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export const useSession = () => {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession deve ser usado dentro de SessionProvider.');
  return value;
};
