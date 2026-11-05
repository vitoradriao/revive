/**
 * @file App.jsx - Componente raiz de roteamento da aplicacao Revive.
 *
 * @description
 * Define toda a estrutura de rotas da aplicacao utilizando React Router v6.
 * As rotas sao divididas em dois grupos:
 *
 * **Rotas publicas:**
 * - `/login` e `/cadastro` — Pagina de login/cadastro. Redireciona para `/` se ja autenticado.
 *
 * **Rotas protegidas (dentro de ProtectedRoute + AppShell):**
 * - `/` — Dashboard principal
 * - `/analytics` — Painel de analises gerais
 * - `/metas` — Gerenciamento de metas
 * - `/vicios/:id` — Detalhes de um vicio especifico (rota dinamica)
 * - `/calendario` — Calendario interativo de humor/recaidas
 * - `/conquistas` — Sistema de badges/gamificacao
 * - `/relatorios` — Relatorios com exportacao CSV
 * - `/perfil` — Configuracoes de perfil e dados
 * - `/dicas` — Dicas de recuperacao
 *
 * **Layout:** Rotas protegidas sao renderizadas dentro do `AppShell` (sidebar + header).
 * Nao utiliza lazy loading — todos os componentes sao importados estaticamente.
 *
 * **Catch-all:** Qualquer rota nao mapeada redireciona para `/` (autenticado) ou `/login`.
 *
 * @module App
 * @see {@link module:components/layout/AppShell} Layout principal com sidebar
 * @see {@link module:components/layout/ProtectedRoute} Guard de autenticacao
 * @see {@link module:contexts/AuthContext} Contexto de autenticacao (token, user, authLoading)
 */

import React from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import AppShell from './components/layout/AppShell';
import ProtectedRoute from './components/layout/ProtectedRoute';
import LoginPage from './pages/LoginPage';
import PasswordRecoveryPage from './pages/PasswordRecoveryPage';
import DashboardPage from './pages/DashboardPage';
import AnalyticsPage from './pages/AnalyticsPage';
import DetalhesPage from './pages/DetalhesPage';
import MetasPage from './pages/MetasPage';
import CalendarPage from './pages/CalendarPage';
import AchievementsPage from './pages/AchievementsPage';
import ReportsPage from './pages/ReportsPage';
import ProfilePage from './pages/ProfilePage';
import SyncPage from './pages/SyncPage';
import TipsPage from './pages/TipsPage';

/**
 * Componente raiz da aplicacao que define a arvore de rotas.
 *
 * Exibe tela de loading enquanto a verificacao de token JWT esta em andamento (authLoading).
 * Apos a verificacao, renderiza as rotas publicas e protegidas conforme o estado de autenticacao.
 *
 * @returns {JSX.Element} Arvore de rotas React Router ou tela de carregamento
 */
export default function App() {
  const { token, user, sessionEpoch, authLoading, authError, restoreSession, localAccess } = useAuth();

  const location = useLocation();
  if (location.pathname === '/recuperar-senha') return <PasswordRecoveryPage key={user ? `${user.id}:${sessionEpoch}` : 'public'} />;

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-white/60 text-lg animate-pulse">Carregando Revive...</div>
      </div>
    );
  }

  if (authError && !token && !localAccess) {
    return <main className="min-h-screen flex flex-col gap-4 items-center justify-center p-6">
      <p role="alert">Não foi possível restaurar sua sessão. {authError.message}</p>
      <button type="button" className="btn-primary px-5 py-3" onClick={restoreSession}>Tentar novamente</button>
    </main>;
  }

  return (
    <Routes>
      {/* Public routes */}
      <Route path="/login" element={
        token && user ? <Navigate to="/" replace /> : <LoginPage />
      } />
      <Route path="/cadastro" element={
        token && user ? <Navigate to="/" replace /> : <LoginPage />
      } />

      {/* Protected routes inside AppShell */}
      <Route element={
        <ProtectedRoute>
          <AppShell key={`${user?.id}:${sessionEpoch}`} />
        </ProtectedRoute>
      }>
        <Route index element={<DashboardPage />} />
        <Route path="analytics" element={<AnalyticsPage />} />
        <Route path="metas" element={<MetasPage />} />
        <Route path="vicios/:id" element={<DetalhesPage />} />
        <Route path="calendario" element={<CalendarPage />} />
        <Route path="conquistas" element={<AchievementsPage />} />
        <Route path="relatorios" element={<ReportsPage />} />
        <Route path="perfil" element={<ProfilePage />} />
        <Route path="sincronizacao" element={<SyncPage />} />
        <Route path="dicas" element={<TipsPage />} />
      </Route>

      {/* Catch all - redirect to dashboard or login */}
      <Route path="*" element={<Navigate to={token ? "/" : "/login"} replace />} />
    </Routes>
  );
}
