/* eslint-disable react-refresh/only-export-components */
/**
 * @file DataContext.jsx - Contexto central de dados da aplicacao Revive.
 *
 * @description
 * Este arquivo implementa o **Context API do React** para gerenciamento centralizado
 * de todo o estado de dados da aplicacao. Ele atua como uma camada intermediaria
 * (similar ao pattern "Service Layer") entre os componentes da UI e os servicos
 * de API REST.
 *
 * **Arquitetura:**
 * - Os dados fluem da API -> Services -> DataContext -> Componentes (fluxo unidirecional).
 * - O DataContext consome o AuthContext (para obter o token JWT) e o UIContext
 *   (para exibir toasts e modais de confirmacao).
 * - Todos os componentes filhos podem acessar o estado via o hook customizado {@link useData}.
 *
 * **Estado gerenciado:**
 * - `addictions` - Lista de vicios do usuario
 * - `selectedAddiction` - Vicio atualmente selecionado para visualizacao detalhada
 * - `selectedAddictionRecords` - Registros diarios do vicio selecionado
 * - `allRecords` - Todos os registros de todos os vicios (para analytics)
 * - `goals` - Lista de metas do usuario
 * - `relapses` - Historico de recaidas
 * - `motivationalMessage` - Mensagem motivacional diaria
 *
 * **Funcoes expostas via hook useData():**
 * - CRUD de vicios: `createAddiction`, `deleteAddiction`, `loadAddictions`, `loadAddictionDetails`
 * - Registros diarios: `createRecord`, `createRecordForAddiction`
 * - Recaidas: `registerRelapse`, `loadRelapses`
 * - Metas: `createGoal`, `completeGoal`, `deleteGoal`, `loadGoals`
 *
 * @module contexts/DataContext
 * @see {@link module:contexts/AuthContext} - Fornece token e dados do usuario
 * @see {@link module:contexts/UIContext} - Fornece feedback visual (toasts, loading)
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from './AuthContext';
import { useUI } from './UIContext';
import * as viciosService from '../services/vicios.service';
import * as registrosService from '../services/registros.service';
import * as metasService from '../services/metas.service';
import * as recaidasService from '../services/recaidas.service';
import * as mensagensService from '../services/mensagens.service';
import { calcularTempoDecorrido } from '../utils/formatters';

/**
 * Contexto React que armazena e distribui todos os dados da aplicacao.
 * Inicializado como `null` — componentes consumidores devem estar dentro do {@link DataProvider}.
 * @type {React.Context<Object|null>}
 */
const DataContext = createContext(null);

/**
 * Componente Provider que encapsula toda a logica de dados da aplicacao.
 *
 * @description
 * Implementa o pattern **Provider/Consumer** do React Context API.
 * Todos os componentes filhos ganham acesso ao estado de dados e funcoes
 * de manipulacao via o hook {@link useData}.
 *
 * **Dependencias de contexto (consumidos internamente):**
 * - `useAuth()` -> token JWT e dados do usuario
 * - `useUI()` -> funcoes de feedback visual (toast, loading, confirm)
 *
 * @param {Object} props - Props do componente React
 * @param {React.ReactNode} props.children - Componentes filhos que terao acesso ao contexto
 * @returns {JSX.Element} Provider com o valor do contexto de dados
 *
 * @example
 * // No main.jsx, o DataProvider envolve toda a aplicacao:
 * <DataProvider>
 *   <App />
 * </DataProvider>
 */
export function DataProvider({ children }) {
  const { token, user, sessionEpoch } = useAuth();
  const accountKey = user ? `${user.id}:${sessionEpoch || ''}` : '';
  const { showToast, setLoading, showConfirm } = useUI();
  const addictionsReadRef = useRef(0);
  const activeSessionRef = useRef({ accountKey, tokens: new Set() });
  if (activeSessionRef.current.accountKey !== accountKey) {
    activeSessionRef.current = { accountKey, tokens: new Set() };
  }
  if (token) activeSessionRef.current.tokens.add(token);
  if (activeSessionRef.current.tokens.size > 3) {
    activeSessionRef.current.tokens.delete(activeSessionRef.current.tokens.values().next().value);
  }

  // ─── Estado Local (React useState) ────────────────────────────────────
  /** @type {[Array<Object>, Function]} Lista de vicios do usuario autenticado */
  const [addictions, setAddictions] = useState([]);
  /** @type {[Object|null, Function]} Vicio selecionado para visualizacao detalhada */
  const [selectedAddiction, setSelectedAddiction] = useState(null);
  /** @type {[Array<Object>, Function]} Registros diarios do vicio selecionado */
  const [selectedAddictionRecords, setSelectedAddictionRecords] = useState([]);
  /** @type {[Array<Object>, Function]} Todos os registros de todos os vicios (para graficos) */
  const [allRecords, setAllRecords] = useState([]);
  /** @type {[Array<Object>, Function]} Lista de metas do usuario */
  const [goals, setGoals] = useState([]);
  /** @type {[Array<Object>, Function]} Historico completo de recaidas */
  const [relapses, setRelapses] = useState([]);
  /** @type {[string, Function]} Mensagem motivacional diaria obtida da API */
  const [motivationalMessage, setMotivationalMessage] = useState('');

  const resetDataState = useCallback(() => {
    setAddictions([]);
    setSelectedAddiction(null);
    setSelectedAddictionRecords([]);
    setAllRecords([]);
    setGoals([]);
    setRelapses([]);
    setMotivationalMessage('');
  }, []);

  // A refresh keeps the account generation and must preserve selection/drafts.
  useEffect(() => { resetDataState(); }, [accountKey, resetDataState]);

  const isCurrentToken = useCallback((requestToken) => (
    !!requestToken && activeSessionRef.current.tokens.has(requestToken)
  ), []);

  // ─── Funcoes Auxiliares Internas ───────────────────────────────────────

  /**
   * Tratador generico de erros de dados.
   * Loga o erro no console para debug e exibe um toast de erro para o usuario.
   *
   * @param {Error} error - Objeto de erro capturado
   * @param {string} userMessage - Mensagem amigavel exibida ao usuario via toast
   */
  const handleDataError = useCallback((error, userMessage) => {
    console.error(error);
    showToast('error', userMessage);
  }, [showToast]);

  /**
   * Helper de alta ordem (Higher-Order Function) que encapsula operacoes assincronas
   * com controle de loading e tratamento de erro.
   *
   * **Principio DRY (Don't Repeat Yourself):**
   * Sem este helper, cada funcao CRUD precisaria repetir o mesmo padrao de
   * setLoading(true) -> try/catch -> setLoading(false). O `withLoading` abstrai
   * essa logica comum em um unico lugar.
   *
   * **Fluxo de execucao:**
   * 1. Ativa o indicador de loading global (spinner na UI)
   * 2. Executa a operacao assincrona passada como parametro
   * 3. Em caso de erro, exibe toast com a mensagem fornecida e retorna `null`
   * 4. No bloco `finally`, sempre desativa o loading (garante desligamento)
   *
   * @param {Function} operation - Funcao assincrona a ser executada (callback)
   * @param {string} errorMessage - Mensagem de erro exibida ao usuario se a operacao falhar
   * @returns {Promise<*|null>} Resultado da operacao ou `null` em caso de erro
   *
   * @example
   * // Uso interno — encapsula qualquer operacao com loading automatico:
   * const result = await withLoading(async () => {
   *   const data = await servicoAPI.buscarDados(token);
   *   return data;
   * }, 'Nao foi possivel buscar os dados.');
   */
  const withLoading = useCallback(async (operation, errorMessage) => {
    setLoading(true);
    try {
      return await operation();
    } catch (error) {
      handleDataError(error, errorMessage);
      return null;
    } finally {
      // O bloco finally garante que o loading e desativado mesmo em caso de erro
      setLoading(false);
    }
  }, [setLoading, handleDataError]);

  // ─── Funcoes de Carregamento de Dados (Leitura) ───────────────────────

  /**
   * Carrega a lista de vicios do usuario a partir da API e processa os dados.
   *
   * **Processamento de dados (Complexidade O(n) onde n = numero de vicios):**
   * - Garante que `dias_abstinencia` e `valor_economizado` nunca sejam negativos (Math.max)
   * - Calcula o tempo formatado caso nao venha da API (fallback local)
   *
   * @returns {Promise<void>}
   */
  const loadAddictions = useCallback(() => withLoading(async () => {
    const requestToken = token;
    const readId = ++addictionsReadRef.current;
    const data = await viciosService.listarVicios(requestToken);
    if (!isCurrentToken(requestToken) || readId !== addictionsReadRef.current) return;
    // Processamento O(n): itera sobre cada vicio aplicando sanitizacao e formatacao
    const processed = (data.vicios || []).map(addiction => ({
      ...addiction,
      dias_abstinencia: Math.max(0, addiction.dias_abstinencia || 0),
      valor_economizado: Math.max(0, addiction.valor_economizado || 0),
      tempo_formatado: addiction.tempo_formatado || calcularTempoDecorrido(addiction.data_inicio)
    }));
    setAddictions(processed);
  }, 'Nao foi possivel carregar seus vicios.'), [token, isCurrentToken, withLoading]);

  /**
   * Carrega os detalhes completos de um vicio especifico, incluindo seus registros diarios.
   * Realiza duas chamadas de API sequenciais: buscar vicio + listar registros.
   *
   * @param {string|number} id - ID do vicio a ser carregado
   * @returns {Promise<Object|null>} Objeto do vicio processado, ou `null` em caso de erro
   */
  const loadAddictionDetails = useCallback(async (id) => {
    return await withLoading(async () => {
      // Primeira chamada: busca dados do vicio
      const requestToken = token;
      const data = await viciosService.buscarVicio(id, requestToken);
      if (!isCurrentToken(requestToken)) return null;
      const processedAddiction = {
        ...data.vicio,
        dias_abstinencia: Math.max(0, data.vicio.dias_abstinencia || 0),
        valor_economizado: Math.max(0, data.vicio.valor_economizado || 0),
        tempo_formatado: data.vicio.tempo_formatado || calcularTempoDecorrido(data.vicio.data_inicio)
      };
      setSelectedAddiction(processedAddiction);
      // Segunda chamada: busca registros diarios do vicio
      const regData = await registrosService.listarRegistros(id, requestToken);
      if (!isCurrentToken(requestToken)) return null;
      setSelectedAddictionRecords(regData.registros || []);
      return processedAddiction;
    }, 'Nao foi possivel carregar os detalhes do vicio.');
  }, [token, isCurrentToken, withLoading]);

  /**
   * Carrega a lista de metas do usuario a partir da API.
   * Nao utiliza `withLoading` para evitar conflito de loading com outras operacoes simultaneas.
   * @returns {Promise<void>}
   */
  const loadGoals = useCallback(async () => {
    try {
      const requestToken = token;
      const data = await metasService.listarMetas(requestToken);
      if (!isCurrentToken(requestToken)) return;
      setGoals(data.metas || []);
    } catch (error) {
      handleDataError(error, 'Nao foi possivel carregar suas metas.');
    }
  }, [token, isCurrentToken, handleDataError]);

  /**
   * Carrega o historico de recaidas do usuario.
   * @returns {Promise<void>}
   */
  const loadRelapses = useCallback(async () => {
    try {
      const requestToken = token;
      const data = await recaidasService.listarRecaidas(requestToken);
      if (!isCurrentToken(requestToken)) return;
      setRelapses(data.recaidas || []);
    } catch (error) {
      handleDataError(error, 'Nao foi possivel carregar as recaidas.');
    }
  }, [token, isCurrentToken, handleDataError]);

  /**
   * Carrega a mensagem motivacional diaria da API.
   * Em caso de falha, utiliza uma mensagem fallback local para que o usuario
   * sempre veja algo positivo (estrategia de graceful degradation).
   * @returns {Promise<void>}
   */
  const loadMotivationalMessage = useCallback(async () => {
    const requestToken = token;
    try {
      const data = await mensagensService.getMensagemDiaria('geral', requestToken);
      if (!isCurrentToken(requestToken)) return;
      setMotivationalMessage(data.mensagem?.mensagem || 'Voce esta no caminho certo! Continue firme!');
    } catch (error) {
      if (!isCurrentToken(requestToken)) return;
      console.error(error);
      // Graceful degradation: exibe mensagem local em caso de falha na API
      setMotivationalMessage('Cada dia e uma vitoria! Parabens pela sua jornada!');
      showToast('error', 'Nao foi possivel carregar a mensagem do dia.');
    }
  }, [token, isCurrentToken, showToast]);

  /**
   * Carrega todos os registros de todos os vicios em paralelo.
   * Utiliza `Promise.all` para disparar N requisicoes simultaneas (uma por vicio).
   *
   * **Complexidade:** O(n) requisicoes HTTP onde n = numero de vicios.
   * As requisicoes sao paralelas, entao o tempo total e o da requisicao mais lenta.
   * O `flatMap` achata os arrays de resposta em um unico array — O(m) onde m = total de registros.
   *
   * @returns {Promise<void>}
   */
  const loadAllRecords = useCallback(async () => {
    const requestToken = token;
    try {
      // Dispara N requisicoes em paralelo (uma por vicio)
      const requests = addictions.map(addiction => registrosService.listarRegistros(addiction.id, requestToken));
      const responses = await Promise.all(requests);
      if (!isCurrentToken(requestToken)) return;
      // flatMap: achata [[reg1, reg2], [reg3]] -> [reg1, reg2, reg3]
      setAllRecords(responses.flatMap(response => response.registros || []));
    } catch (error) {
      if (!isCurrentToken(requestToken)) return;
      handleDataError(error, 'Nao foi possivel carregar o historico de registros.');
      setAllRecords([]);
    }
  }, [addictions, token, isCurrentToken, handleDataError]);

  // ─── Funcoes de Escrita (Criacao, Atualizacao, Exclusao) ───────────────

  /**
   * Cria um novo vicio e recarrega a lista apos sucesso.
   *
   * @param {Object} payload - Dados do vicio a ser criado
   * @param {string} payload.nome_vicio - Nome do vicio (ex: "Cigarro", "Alcool")
   * @param {number} [payload.gasto_diario] - Gasto diario estimado em reais
   * @param {string} [payload.data_inicio] - Data de inicio da abstinencia (ISO 8601)
   * @returns {Promise<void>}
   */
  const checkCreatedAddictions = useCallback(async () => {
    const requestToken = token;
    const data = await viciosService.listarVicios(requestToken);
    if (!isCurrentToken(requestToken)) throw new Error('A sessão mudou. Abra o formulário novamente.');
    if (!Array.isArray(data.vicios)) throw new Error('Não foi possível consultar os hábitos.');
    return data.vicios;
  }, [token, isCurrentToken]);

  // Creation rejects so the form keeps its draft. A failed list refresh is not a failed POST.
  const createAddiction = useCallback(async (payload) => {
    const requestToken = token;
    const response = await viciosService.criarVicio(payload, requestToken);
    if (!isCurrentToken(requestToken)) throw new Error('A sessão mudou. Consulte seus hábitos ao entrar novamente.');
    const created = response.vicio;
    const keepConfirmedHabit = () => {
      if (!isCurrentToken(requestToken)) return;
      setAddictions(previous => previous.some(item => item.id === created.id) ? previous : [{
        ...created,
        dias_abstinencia: Math.max(0, created.dias_abstinencia || 0),
        valor_economizado: Math.max(0, created.valor_economizado || 0),
        tempo_formatado: created.tempo_formatado || calcularTempoDecorrido(created.data_inicio)
      }, ...previous]);
    };
    keepConfirmedHabit();
    showToast('success', 'Hábito criado com sucesso!');
    // A slow/failed GET cannot turn a confirmed POST into an apparent failed creation.
    void loadAddictions();
    return response;
  }, [token, isCurrentToken, showToast, loadAddictions]);

  /**
   * Exclui um vicio apos confirmacao do usuario via modal.
   * Utiliza o pattern de confirmacao: primeiro mostra o modal, e so executa a exclusao
   * se o usuario confirmar (callback passado ao `showConfirm`).
   *
   * @param {Object} addiction - Objeto do vicio a ser excluido
   * @param {string|number} addiction.id - ID do vicio
   * @param {string} addiction.nome_vicio - Nome exibido no modal de confirmacao
   */
  const deleteAddiction = useCallback((addiction) => {
    showConfirm(
      'Confirmar Exclusao',
      `Tem certeza que deseja excluir "${addiction.nome_vicio}"? Esta acao nao pode ser desfeita.`,
      () => withLoading(async () => {
        await viciosService.excluirVicio(addiction.id, token);
        showToast('success', 'Vicio excluido com sucesso!');
        await loadAddictions();
        // Limpa a selecao se o vicio excluido era o selecionado atualmente
        if (selectedAddiction?.id === addiction.id) setSelectedAddiction(null);
      }, 'Nao foi possivel excluir o vicio.')
    );
  }, [token, showToast, showConfirm, loadAddictions, selectedAddiction, withLoading]);

  /**
   * Registra uma recaida para um vicio e opcionalmente reseta o contador de abstinencia.
   *
   * **Pattern de Options Object (Destructuring com default):**
   * O segundo parametro usa destructuring com valor padrao `{ resetCounter = false }`.
   * Isso permite chamadas flexiveis:
   * - `registerRelapse(vicio)` -> registra recaida sem resetar
   * - `registerRelapse(vicio, { resetCounter: true })` -> registra e reseta o contador
   *
   * Apos o registro, recarrega vicios, recaidas e detalhes do vicio (se selecionado),
   * garantindo que a UI reflita o estado atualizado.
   *
   * @param {Object} addiction - Objeto do vicio onde ocorreu a recaida
   * @param {string|number} addiction.id - ID do vicio
   * @param {Object} [options={}] - Opcoes adicionais
   * @param {boolean} [options.resetCounter=false] - Se true, reseta o contador de dias de abstinencia
   * @returns {Promise<void>}
   */
  const registerRelapse = useCallback(async (addiction, { resetCounter = false } = {}) => {
    await withLoading(async () => {
      await viciosService.registrarRecaida(addiction.id, '', resetCounter, token);
      showToast('success', resetCounter
        ? 'Contador resetado! Um novo capitulo comeca.'
        : 'Recaida registrada! Vamos refletir sobre o ocorrido.');
      // Recarrega dados relacionados para manter a UI sincronizada
      await loadAddictions();
      await loadRelapses();
      // Se o vicio com recaida e o selecionado, recarrega seus detalhes tambem
      if (selectedAddiction?.id === addiction.id) {
        await loadAddictionDetails(addiction.id);
      }
    }, 'Nao foi possivel registrar a recaida.');
  }, [token, showToast, loadAddictions, loadRelapses, loadAddictionDetails, selectedAddiction, withLoading]);

  /**
   * Cria um registro diario para o vicio atualmente selecionado.
   * Inclui validacao no frontend antes de enviar para a API.
   *
   * @param {Object} recordForm - Dados do formulario de registro diario
   * @param {string} recordForm.humor - Humor do usuario (obrigatorio): 'excelente'|'bom'|'neutro'|'ruim'|'pessimo'
   * @param {string} [recordForm.notas] - Notas adicionais do dia
   * @param {number} [recordForm.nivel_desejo] - Nivel de desejo (1-10)
   * @returns {Promise<boolean>} `true` se criado com sucesso, `false` caso contrario
   */
  const createRecordForAddiction = useCallback(async (recordForm, addictionId) => {
    // Validacao no frontend — evita chamada desnecessaria a API
    if (!recordForm.humor) {
      showToast('error', 'Selecione um humor antes de salvar');
      return false;
    }
    if (!addictionId) {
      showToast('error', 'Selecione um vicio antes de salvar o registro.');
      return false;
    }
    const result = await withLoading(async () => {
      await registrosService.criarRegistro({ ...recordForm, vicio_id: addictionId }, token);
      showToast('success', 'Registro diario criado!');
      if (selectedAddiction?.id && String(selectedAddiction.id) === String(addictionId)) {
        await loadAddictionDetails(addictionId);
      }
      await loadAllRecords();
      return true;
    }, 'Nao foi possivel criar o registro diario.');
    // O operador ?? garante retorno false se withLoading retornar null (erro)
    return result ?? false;
  }, [token, selectedAddiction, showToast, loadAddictionDetails, loadAllRecords, withLoading]);

  const createRecord = useCallback(async (recordForm) => (
    createRecordForAddiction(recordForm, selectedAddiction?.id)
  ), [createRecordForAddiction, selectedAddiction]);

  /**
   * Cria uma nova meta para o usuario.
   * @param {Object} goalForm - Dados da meta
   * @param {string} goalForm.titulo - Titulo da meta
   * @param {string} [goalForm.descricao] - Descricao da meta
   * @returns {Promise<void>}
   */
  const createGoal = useCallback(async (goalForm) => {
    await withLoading(async () => {
      const response = await metasService.criarMeta(goalForm, token);
      showToast('success', 'Meta criada com sucesso!');
      if (response?.meta) {
        setGoals(prev => [response.meta, ...prev.filter(goal => goal.id !== response.meta.id)]);
      } else {
        await loadGoals();
      }
    }, 'Nao foi possivel criar a meta.');
  }, [token, showToast, loadGoals, withLoading]);

  /**
   * Marca uma meta como concluida.
   * @param {string|number} goalId - ID da meta a ser concluida
   * @returns {Promise<void>}
   */
  const completeGoal = useCallback(async (goalId) => {
    await withLoading(async () => {
      await metasService.completarMeta(goalId, token);
      showToast('success', 'Parabens! Meta concluida!');
      await loadGoals();
    }, 'Nao foi possivel concluir a meta.');
  }, [token, showToast, loadGoals, withLoading]);

  /**
   * Exclui uma meta apos confirmacao do usuario via modal.
   * @param {string|number} goalId - ID da meta a ser excluida
   */
  const deleteGoal = useCallback((goalId) => {
    showConfirm(
      'Excluir Meta',
      'Tem certeza que deseja excluir esta meta?',
      () => withLoading(async () => {
        await metasService.excluirMeta(goalId, token);
        showToast('success', 'Meta excluida');
        await loadGoals();
      }, 'Nao foi possivel excluir a meta.')
    );
  }, [token, showToast, showConfirm, loadGoals, withLoading]);

  // ─── Efeitos Colaterais (useEffect) — Carregamento Automatico de Dados ─

  /**
   * Efeito principal: carrega todos os dados iniciais quando o usuario esta autenticado.
   *
   * **Fluxo de carregamento inicial:**
   * 1. Verifica se ha usuario e token validos (guard clause)
   * 2. Dispara 4 carregamentos em paralelo (nao sequenciais):
   *    - Vicios, Mensagem motivacional, Metas, Recaidas
   *
   * **Dependencias:** Reexecuta se user, token ou as funcoes de load mudarem.
   * Na pratica, executa uma vez apos o login bem-sucedido.
   */
  useEffect(() => {
    if (!user || !token) return;
    loadAddictions();
    loadMotivationalMessage();
    loadGoals();
    loadRelapses();
  }, [user, token, loadAddictions, loadMotivationalMessage, loadGoals, loadRelapses]);

  /**
   * Efeito secundario: carrega registros de todos os vicios apos a lista de vicios estar disponivel.
   * Depende do estado `addictions` — so executa apos `loadAddictions()` popular o array.
   * Se nao houver vicios, limpa o array de registros.
   */
  useEffect(() => {
    if (addictions.length > 0 && token) {
      loadAllRecords();
    } else {
      setAllRecords([]);
    }
  }, [addictions, token, loadAllRecords]);

  // ─── Provider Value Object ─────────────────────────────────────────────
  /**
   * O objeto `value` do Provider expoe todo o estado e funcoes para os consumidores.
   *
   * **Dados (leitura):** addictions, selectedAddiction, selectedAddictionRecords,
   *   allRecords, goals, relapses, motivationalMessage
   *
   * **Setters diretos:** setSelectedAddiction
   *
   * **Funcoes de carregamento:** loadAddictions, loadAddictionDetails, loadGoals, loadRelapses
   *
   * **Funcoes de escrita (CRUD):** createAddiction, deleteAddiction, registerRelapse,
   *   createRecord, createGoal, completeGoal, deleteGoal
   *
   * Nota: Todas as funcoes sao memoizadas com `useCallback` para evitar
   * re-renders desnecessarios nos componentes consumidores.
   */
  return (
    <DataContext.Provider
      value={{
        addictions,
        selectedAddiction,
        setSelectedAddiction,
        selectedAddictionRecords,
        allRecords,
        goals,
        relapses,
        motivationalMessage,
        loadAddictions,
        loadAddictionDetails,
        loadGoals,
        loadRelapses,
        createAddiction,
        checkCreatedAddictions,
        deleteAddiction,
        registerRelapse,
        createRecord,
        createRecordForAddiction,
        createGoal,
        completeGoal,
        deleteGoal,
      }}
    >
      {children}
    </DataContext.Provider>
  );
}

/**
 * Hook customizado para acessar o contexto de dados.
 *
 * **Pattern: Custom Hook para Context API**
 * Em vez de usar `useContext(DataContext)` diretamente nos componentes,
 * este hook encapsula o acesso e adiciona validacao automatica.
 * Se o componente nao estiver dentro de um `<DataProvider>`, lanca um erro
 * explicativo em tempo de desenvolvimento.
 *
 * @returns {Object} Objeto contendo todo o estado e funcoes do DataContext
 * @throws {Error} Se chamado fora de um DataProvider
 *
 * @example
 * // Dentro de qualquer componente filho do DataProvider:
 * function MeuComponente() {
 *   const { addictions, createAddiction, loadAddictions } = useData();
 *   // ... usar os dados e funcoes
 * }
 */
export function useData() {
  const context = useContext(DataContext);
  if (!context) throw new Error('useData must be used within DataProvider');
  return context;
}
