/**
 * @file ProtectedRoute.jsx
 * @description HOC/wrapper de rota protegida que implementa o Guard Pattern.
 *
 * Verifica a autenticacao do usuario antes de permitir acesso a rotas protegidas.
 * Atua como um "guardiao" (Guard Pattern) que intercepta a renderizacao e
 * decide entre tres estados:
 *
 * 1. **Carregando**: Exibe tela de loading enquanto a autenticacao esta sendo verificada
 * 2. **Nao autenticado**: Redireciona para /login via React Router <Navigate>
 * 3. **Autenticado**: Renderiza os componentes filhos normalmente
 *
 * O uso de `replace` no Navigate garante que a pagina de login substitua
 * a entrada no historico, evitando que o usuario retorne a uma rota protegida
 * ao pressionar "Voltar" no navegador.
 *
 * Design Pattern: Guard Pattern (protecao de rota por autenticacao)
 *
 * @component
 * @example
 * // Uso no router:
 * <Route element={<ProtectedRoute><AppShell /></ProtectedRoute>}>
 *   <Route path="/" element={<DashboardPage />} />
 * </Route>
 *
 * @see {@link AuthContext} Contexto que fornece estado de autenticacao
 * @see {@link AppShell} Componente tipicamente envolvido pelo ProtectedRoute
 */

import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

/**
 * Componente wrapper que protege rotas contra acesso nao autenticado.
 *
 * Consome o AuthContext para verificar token e usuario. Enquanto a verificacao
 * esta em andamento (authLoading), exibe uma tela de carregamento centralizada.
 *
 * @param {Object} props - Props do componente
 * @param {React.ReactNode} props.children - Componentes filhos a serem renderizados se autenticado
 * @returns {JSX.Element} Loading spinner, redirecionamento para /login, ou children
 */
const ProtectedRoute = ({ children }) => {
  const { token, user, authLoading, localAccess } = useAuth();

  // Estado 1: Verificacao de autenticacao em andamento - exibe loading
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-white/60 text-lg">Carregando...</div>
      </div>
    );
  }

  // Estado 2: Usuario nao autenticado - redireciona para login com replace
  if ((!token && !localAccess) || !user) {
    return <Navigate to="/login" replace />;
  }

  // Estado 3: Usuario autenticado - renderiza componentes filhos
  return children;
};

export default ProtectedRoute;
