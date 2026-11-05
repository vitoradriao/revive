/**
 * @file registros.service.js
 * @description Servico de CRUD de registros diarios na API REVIVE.
 *
 * Registros diarios capturam o estado emocional (humor), nivel de fissura e
 * anotacoes do usuario em um determinado dia. Sao vinculados a um vicio
 * especifico e alimentam os graficos de evolucao no painel.
 *
 * @module services/registros.service
 * @see {@link module:services/api} Modulo adaptador HTTP
 */

import { apiCall } from './api';

/**
 * Cria um novo registro diario para o usuario autenticado.
 *
 * @param {Object} payload - Dados do registro diario.
 * @param {string|number} payload.vicio_id - ID do vicio ao qual o registro pertence.
 * @param {string} payload.humor - Humor do usuario (ex: 'excelente', 'bom', 'neutro', 'ruim', 'pessimo').
 * @param {number} [payload.nivel_fissura] - Nivel de fissura de 0 a 10.
 * @param {string} [payload.anotacao] - Texto livre de anotacao do dia.
 * @param {string} token - Token JWT de autenticacao.
 * @returns {Promise<Object>} Objeto do registro recem-criado, incluindo `id` e `data`.
 * @throws {Error} Se os dados forem invalidos (400) ou o token estiver expirado.
 *
 * @example
 * const registro = await criarRegistro({ vicio_id: 1, humor: 'bom', nivel_fissura: 3 }, token);
 * // POST /api/registros
 */
export async function criarRegistro(payload, token) {
  return apiCall('/registros', {
    method: 'POST',
    body: JSON.stringify(payload)
  }, token);
}

/**
 * Lista todos os registros diarios de um vicio especifico.
 *
 * @param {string|number} vicioId - Identificador unico do vicio.
 * @param {string} token - Token JWT de autenticacao.
 * @returns {Promise<Array<Object>>} Array de objetos de registro, cada um contendo
 *   `id`, `data`, `humor`, `nivel_fissura`, `anotacao`, etc.
 * @throws {Error} Se o vicio nao for encontrado (404) ou ocorrer erro de autenticacao.
 *
 * @example
 * const registros = await listarRegistros(1, token);
 * // GET /api/vicios/1/registros
 */
export async function listarRegistros(vicioId, token) {
  return apiCall(`/vicios/${vicioId}/registros`, {}, token);
}

// A UI uses the account coordinator for reads, durable writes and conflict replacement.
export const listDiaryRecords = (client, accountKey, filters) => client.diary('list', [filters], accountKey);
export const getDiaryRecord = (client, accountKey, id, remoteOnly = false) => client.diary('detail', [id, remoteOnly], accountKey);
export const createDiaryRecord = (client, accountKey, values, habitId, anotherDay) => client.diary('create', [values, habitId, anotherDay], accountKey);
export const editDiaryRecord = (client, accountKey, base, values, replaceId, remote) => client.diary('edit', [base, values, replaceId, remote], accountKey);
