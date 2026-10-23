import { API_BASE } from '../config/env';

export async function httpRequest(endpoint, options = {}, token = null) {
  const { expectedStatus, ...fetchOptions } = options;
  const headers = { Accept: 'application/json', 'Content-Type': 'application/json', ...options.headers };
  if (token) headers.Authorization = `Bearer ${token}`;
  let response, text;
  try {
    response = await fetch(`${API_BASE}${endpoint}`, { ...fetchOptions, credentials: 'same-origin', cache: 'no-store', headers });
    text = await response.text();
  } catch {
    throw Object.assign(new Error('Não foi possível confirmar a resposta do servidor.'), { outcomeUnknown: true, code: 'REDE_INDISPONIVEL' });
  }
  let data = {};
  if (text) {
    try { data = JSON.parse(text); }
    catch {
      if (response.ok) throw Object.assign(new Error('Resposta inválida do servidor.'), { status: response.status, code: 'RESPOSTA_INVALIDA', outcomeUnknown: true });
      data = {};
    }
  }
  if (!response.ok) {
    throw Object.assign(new Error(data.mensagem || data.erro || `Erro na requisição (${response.status})`), {
      status: response.status, code: data.codigo, fields: data.campos, requestId: data.request_id,
      retryAfter: response.headers?.get('Retry-After'), outcomeUnknown: response.status >= 500
    });
  }
  if (expectedStatus && response.status !== expectedStatus) {
    throw Object.assign(new Error('Resposta inesperada do servidor. A operação não foi confirmada.'), { code: 'RESPOSTA_INVALIDA', outcomeUnknown: true });
  }
  return data;
}
