/**
 * @file main.jsx - Ponto de entrada da aplicacao React Revive.
 *
 * @description
 * Inicializa a aplicacao usando `ReactDOM.createRoot` (React 18+) para renderizacao
 * concorrente. Monta a arvore de componentes dentro do elemento DOM `#root`.
 *
 * **Ordem de aninhamento dos Providers (de fora para dentro):**
 * 1. `React.StrictMode` - Ativa verificacoes extras em desenvolvimento
 * 2. `BrowserRouter` - Habilita roteamento SPA com History API
 * 3. `UIProvider` - Estado de UI (toasts, loading, tema) — sem dependencias de outros contextos
 * 4. `AuthProvider` - Autenticacao (login, cadastro, token JWT) — depende de UIProvider para feedback
 * 5. `DataProvider` - Dados do usuario (vicios, metas, registros) — depende de AuthProvider e UIProvider
 *
 * A ordem dos providers e importante: cada contexto pode consumir os que estao acima dele,
 * mas nao os que estao abaixo.
 *
 * Alem da renderizacao, registra um Service Worker para suporte offline (falha silenciosa).
 *
 * @module main
 * @see {@link module:App} Componente raiz com definicao de rotas
 * @see {@link module:contexts/UIContext} Provider de interface
 * @see {@link module:contexts/AuthContext} Provider de autenticacao
 * @see {@link module:contexts/DataContext} Provider de dados
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { UIProvider } from './contexts/UIContext';
import { OfflineProvider } from './contexts/OfflineContext';
import { AuthProvider } from './contexts/AuthContext';
import { DataProvider } from './contexts/DataContext';
import ToastContainer from './components/ui/Toast';
import './index.css';

/**
 * Cria a raiz React e renderiza a arvore de componentes.
 * `createRoot` e a API do React 18 para renderizacao concorrente.
 * O elemento `#root` e definido no index.html.
 */
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <UIProvider>
        <OfflineProvider>
        <AuthProvider>
          <DataProvider>
            <App />
          </DataProvider>
        </AuthProvider>
        </OfflineProvider>
        <ToastContainer />
      </UIProvider>
    </BrowserRouter>
  </React.StrictMode>
);

/**
 * Registro do Service Worker para suporte offline.
 * Falha silenciosa caso o registro nao seja possivel —
 * a aplicacao continua funcionando normalmente sem cache offline.
 */
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).catch(() => {
      // Falha silenciosa: a app continua funcionando sem offline.
    });
  });
} else if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations?.().then((registrations) => {
    registrations.forEach((registration) => registration.unregister());
  });

  caches?.keys?.().then((keys) => {
    keys
      .filter((key) => key.startsWith('revive-'))
      .forEach((key) => caches.delete(key));
  });
}
