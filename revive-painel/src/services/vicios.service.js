/**
 * @file vicios.service.js
 * @description Servico de CRUD de vicios na API REVIVE.
 *
 * Fornece funcoes para listar, buscar, criar e excluir vicios do usuario
 * autenticado. A exclusão confirmada usa a coordenação da conta.
 *
 * Todas as funcoes delegam a comunicacao HTTP para {@link module:services/api~apiCall}.
 *
 * @module services/vicios.service
 * @see {@link module:services/api} Modulo adaptador HTTP
 */

import { apiCall } from './api';

/**
 * Lista todos os vicios do usuario autenticado.
 *
 * @param {string} token - Token JWT de autenticacao.
 * @returns {Promise<Array<Object>>} Array de objetos de vicio. Cada objeto contem
 *   propriedades como `id`, `nome`, `data_inicio`, `dias_limpo`, `gasto_diario`, etc.
 * @throws {Error} Se a requisicao falhar (ex: token invalido, erro de rede).
 *
 * @example
 * const vicios = await listarVicios(token);
 * // GET /api/vicios
 */
export async function listarVicios(token) {
  return apiCall('/vicios', {}, token);
}

/**
 * Busca os detalhes de um vicio especifico pelo seu ID.
 *
 * @param {string|number} id - Identificador unico do vicio.
 * @param {string} token - Token JWT de autenticacao.
 * @returns {Promise<Object>} Objeto com os dados completos do vicio, incluindo
 *   `id`, `nome`, `data_inicio`, `dias_limpo`, `gasto_diario`, `recaidas`, etc.
 * @throws {Error} Se o vicio nao for encontrado (404) ou ocorrer erro de autenticacao.
 *
 * @example
 * const vicio = await buscarVicio(42, token);
 * // GET /api/vicios/42
 */
export async function buscarVicio(id, token) {
  return apiCall(`/vicios/${id}`, {}, token);
}

/**
 * Cria um novo vicio para o usuario autenticado.
 *
 * @param {Object} payload - Dados do novo vicio.
 * @param {string} payload.nome - Nome do vicio (ex: "Cigarro", "Alcool").
 * @param {number} [payload.gasto_diario] - Valor gasto diariamente com o vicio (em reais).
 * @param {string} [payload.data_inicio] - Data de inicio da abstinencia (ISO 8601).
 * @param {string} token - Token JWT de autenticacao.
 * @returns {Promise<Object>} Objeto do vicio recem-criado, incluindo o `id` gerado.
 * @throws {Error} Se os dados forem invalidos (400) ou ocorrer erro de autenticacao.
 *
 * @example
 * const novoVicio = await criarVicio({ nome: 'Cigarro', gasto_diario: 15 }, token);
 * // POST /api/vicios
 */
export async function criarVicio(payload, token, request = apiCall) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const result = await request('/vicios', {
      method: 'POST',
      body: JSON.stringify(payload),
      signal: controller.signal
    }, token);
    if (!result?.vicio?.id) {
      throw Object.assign(new Error('O servidor não confirmou qual hábito foi salvo.'), { outcomeUnknown: true });
    }
    return result;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Exclui um vicio existente pelo seu ID.
 *
 * @param {string|number} id - Identificador unico do vicio a ser excluido.
 * @param {string} token - Token JWT de autenticacao.
 * @returns {Promise<Object>} Confirmacao da exclusao retornada pela API.
 * @throws {Error} Se o vicio nao for encontrado (404) ou o usuario nao tiver permissao.
 *
 * @example
 * await excluirVicio(42, token);
 * // DELETE /api/vicios/42
 */
export async function excluirVicio(id, token) {
  return apiCall(`/vicios/${id}`, { method: 'DELETE' }, token);
}

export const deleteConfirmedHabit = (client, accountKey, id) => client.goals('deleteHabit', [id], accountKey);

// O PATCH não entra na fila: a revisão e a recuperação pertencem à edição online.
export async function patchHabit(id, payload, request = apiCall) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
        const result = await request(`/v2/vicios/${encodeURIComponent(id)}`, {
            method: 'PATCH', body: JSON.stringify(payload), signal: controller.signal
        });
        if (result?.vicio?.id !== id || result.vicio.revision !== payload.revision + 1) {
            throw Object.assign(new Error('A resposta não confirmou a alteração. Consulte o estado remoto.'), { outcomeUnknown: true });
        }
        return result.vicio;
    } finally { clearTimeout(timeout); }
}
