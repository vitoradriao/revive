/* eslint-disable react-refresh/only-export-components */
/**
 * @file UIContext.jsx - Contexto de interface do usuario (UI) da aplicacao Revive.
 *
 * @description
 * Centraliza todo o gerenciamento de estado de UI utilizando o **Context API do React**.
 * Este contexto e o mais "baixo nivel" da hierarquia de providers — nao depende
 * de nenhum outro contexto, mas e consumido por AuthContext e DataContext.
 *
 * **Estado gerenciado:**
 * - `alert` - Alerta temporario global (tipo + mensagem), auto-remove em 5s
 * - `loading` - Flag global de carregamento (controla spinner overlay)
 * - `confirmModal` - Estado do modal de confirmacao (titulo, mensagem, callbacks)
 * - `toasts` - Fila de notificacoes toast empilhaveis, auto-remove em 4s
 * - `theme` - Tema visual ('dark' | 'light'), persistido em localStorage
 *
 * **Funcoes expostas via hook useUI():**
 * - `showAlert(type, message)` - Exibe alerta temporario
 * - `showToast(type, message)` - Adiciona toast a fila
 * - `removeToast(id)` - Remove toast manualmente
 * - `showConfirm(title, message, onConfirm)` - Abre modal de confirmacao
 * - `toggleTheme()` - Alterna entre tema claro e escuro
 * - `setLoading(bool)` - Controla o estado de loading global
 *
 * @module contexts/UIContext
 */

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';

/**
 * Contexto React para gerenciamento de UI.
 * Inicializado como `null` — componentes consumidores devem estar dentro do {@link UIProvider}.
 * @type {React.Context<Object|null>}
 */
const UIContext = createContext(null);

/**
 * Componente Provider que gerencia todo o estado de interface da aplicacao.
 * Deve ser o provider mais externo na arvore (antes de AuthProvider e DataProvider),
 * pois outros contextos dependem dele para exibir feedback visual.
 *
 * @param {Object} props - Props do componente
 * @param {React.ReactNode} props.children - Componentes filhos
 * @returns {JSX.Element} Provider de UI
 */
export function UIProvider({ children }) {
  /** @type {[Object|null, Function]} Alerta global — { type: string, message: string } ou null */
  const [alert, setAlert] = useState(null);
  /** @type {[boolean, Function]} Flag de loading global — controla spinner overlay */
  const [loading, setLoading] = useState(false);
  /** @type {[Object, Function]} Estado do modal de confirmacao */
  const [confirmModal, setConfirmModal] = useState({ isOpen: false });
  /** @type {[Array<Object>, Function]} Fila de notificacoes toast */
  const [toasts, setToasts] = useState([]);
  /** @type {[string, Function]} Tema atual ('dark'|'light') — lazy init do localStorage */
  const [theme, setTheme] = useState(() => localStorage.getItem('revive_theme') || 'light');
  const [isNewAddictionOpen, setIsNewAddictionOpen] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  /**
   * Exibe um alerta global temporario na interface.
   * O alerta e automaticamente removido apos 5 segundos.
   *
   * @param {string} type - Tipo do alerta ('success' | 'error' | 'warning' | 'info')
   * @param {string} message - Mensagem exibida no alerta
   */
  const showAlert = useCallback((type, message) => {
    setAlert({ type, message });
    setTimeout(() => setAlert(null), 5000);
  }, []);

  /**
   * Adiciona uma notificacao toast a fila.
   * Cada toast recebe um ID unico (timestamp) e e removido automaticamente apos 4 segundos.
   * Multiplos toasts podem ser exibidos simultaneamente (empilhamento).
   *
   * @param {string} type - Tipo do toast ('success' | 'error' | 'warning' | 'info')
   * @param {string} message - Mensagem exibida no toast
   */
  const showToast = useCallback((type, message) => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  }, []);

  /**
   * Remove um toast da fila manualmente (antes do auto-remove de 4s).
   * Util para toasts com botao de fechar.
   *
   * @param {number} id - ID unico do toast (timestamp de criacao)
   */
  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  /**
   * Abre o modal de confirmacao global.
   * O modal exibe titulo, mensagem e dois botoes (confirmar/cancelar).
   * Ao confirmar, executa o callback `onConfirm` e fecha o modal automaticamente.
   *
   * @param {string} title - Titulo do modal de confirmacao
   * @param {string} message - Mensagem descritiva da acao
   * @param {Function} onConfirm - Callback executado ao clicar em "Confirmar"
   */
  const showConfirm = useCallback((title, message, onConfirm) => {
    setConfirmModal({
      isOpen: true,
      title,
      message,
      onConfirm: () => {
        setConfirmModal({ isOpen: false });
        onConfirm();
      },
      onClose: () => setConfirmModal({ isOpen: false })
    });
  }, []);

  /**
   * Alterna entre tema claro e escuro.
   * Persiste a preferencia no localStorage (chave 'revive_theme')
   * e atualiza o atributo `data-theme` no elemento `<html>` para CSS.
   */
  const toggleTheme = useCallback(() => {
    setTheme(prev => {
      const next = prev === 'dark' ? 'light' : 'dark';
      localStorage.setItem('revive_theme', next);
      document.documentElement.setAttribute('data-theme', next);
      return next;
    });
  }, []);

  const resetSessionUI = useCallback(() => {
    setAlert(null);
    setLoading(false);
    setConfirmModal({ isOpen: false });
    setToasts([]);
    setIsNewAddictionOpen(false);
  }, []);

  const openNewAddictionWizard = useCallback(() => setIsNewAddictionOpen(true), []);
  const closeNewAddictionWizard = useCallback(() => setIsNewAddictionOpen(false), []);

  return (
    <UIContext.Provider value={{
      alert, setAlert, showAlert,
      loading, setLoading,
      confirmModal, setConfirmModal, showConfirm,
      toasts, showToast, removeToast,
      theme, toggleTheme, resetSessionUI,
      isNewAddictionOpen, openNewAddictionWizard, closeNewAddictionWizard
    }}>
      {children}
    </UIContext.Provider>
  );
}

/**
 * Hook customizado para acessar o contexto de UI.
 *
 * Encapsula `useContext(UIContext)` e adiciona validacao de uso.
 * Lanca erro se o componente nao estiver dentro de um `<UIProvider>`.
 *
 * @returns {Object} Objeto com: alert, setAlert, showAlert, loading, setLoading,
 *   confirmModal, showConfirm, toasts, showToast, removeToast, theme, toggleTheme
 * @throws {Error} Se chamado fora de um UIProvider
 */
export function useUI() {
  const context = useContext(UIContext);
  if (!context) throw new Error('useUI must be used within UIProvider');
  return context;
}
