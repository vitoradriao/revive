/**
 * @file api.js
 * @description Modulo central de comunicacao HTTP com a API REVIVE.
 *
 * Implementa o **Adapter Pattern**: encapsula a Fetch API nativa em uma funcao
 * generica `apiCall` que injeta automaticamente o token JWT, faz parsing de JSON
 * e padroniza o tratamento de erros.
 *
 * Todos os modulos de servico (`vicios.service`, `metas.service`, etc.) consomem
 * exclusivamente esta funcao para realizar requisicoes, garantindo um unico ponto
 * de manutencao para headers, autenticacao e tratamento de falhas.
 *
 * @module services/api
 * @see {@link module:services/vicios.service} Exemplo de servico que consome apiCall
 * @see {@link module:services/auth.service}   Servico de autenticacao
 */

import { API_BASE } from '../config/env';

/**
 * Realiza uma chamada HTTP a API REVIVE.
 *
 * Fluxo interno:
 * 1. Monta os headers com `Content-Type: application/json`.
 * 2. Se um `token` for fornecido, adiciona o header `Authorization: Bearer <token>`.
 * 3. Executa `fetch` concatenando `API_BASE` + `endpoint`.
 * 4. Faz parsing do corpo da resposta como JSON.
 * 5. Se `response.ok` for `false` (status >= 400), lanca um `Error` com a mensagem
 *    retornada pela API (`mensagem` ou `erro`).
 *
 * @param {string} endpoint - Caminho relativo do endpoint (ex: '/vicios', '/auth/login').
 * @param {Object} [options={}] - Opcoes adicionais do fetch (`method`, `body`, `headers`, etc.).
 * @param {string|null} [token=null] - Token JWT para autenticacao (enviado como Bearer).
 * @returns {Promise<Object>} Dados da resposta parseados como JSON.
 * @throws {Error} Se a resposta HTTP nao for ok (status >= 400). A mensagem do erro
 *   e extraida de `data.mensagem` ou `data.erro`, com fallback para "Erro na requisicao".
 *
 * @example
 * // GET sem autenticacao
 * const dados = await apiCall('/auth/login', { method: 'POST', body: JSON.stringify({ email, senha }) });
 *
 * @example
 * // GET autenticado
 * const vicios = await apiCall('/vicios', {}, token);
 */
export async function apiCall(endpoint, options = {}, token = null) {
  const headers = {
    'Accept': 'application/json',
    'Content-Type': 'application/json'
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  let response;
  try {
    response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      cache: 'no-store',
      headers: { ...headers, ...options.headers }
    });
  } catch {
    throw Object.assign(new Error('Não foi possível confirmar a resposta do servidor.'), { outcomeUnknown: true });
  }

  let text;
  try { text = await response.text(); }
  catch { throw Object.assign(new Error('A conexão foi interrompida antes da confirmação.'), { outcomeUnknown: true }); }
  let data = {};

  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { erro: text };
    }
  }

  if (!response.ok) {
    throw Object.assign(new Error(data.mensagem || data.erro || `Erro na requisição (${response.status})`), {
      status: response.status, code: data.codigo, outcomeUnknown: response.status >= 500
    });
  }

  return data;
}
