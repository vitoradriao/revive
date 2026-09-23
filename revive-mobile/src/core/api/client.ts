import { env } from '@/core/config/env';
import { tokenStore } from '@/core/auth/token-store';
import { ApiError } from './errors';
import type { AuthSession } from '@/domain/types';

type ApiOptions = RequestInit & {
  authenticated?: boolean;
  retryAuth?: boolean;
  idempotencyKey?: string;
};

let refreshPromise: { generation: number; promise: Promise<string | null> } | null = null;
let sessionExpiredHandler: (() => void | Promise<void>) | null = null;

export const setSessionExpiredHandler = (handler: (() => void | Promise<void>) | null) => {
  sessionExpiredHandler = handler;
};

const parseResponse = async (response: Response) => {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { mensagem: text };
  }
};

export const refreshAccessToken = async (expectedGeneration = tokenStore.getGeneration()) => {
  if (refreshPromise?.generation === expectedGeneration) return refreshPromise.promise;
  const promise = (async () => {
    const refreshToken = await tokenStore.getRefreshToken();
    if (!tokenStore.isCurrent(expectedGeneration) || !refreshToken) return null;

    let response: Response;
    try { response = await fetch(`${env.apiUrl}/v2/auth/refresh`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    }); } catch { throw new ApiError('Sem conexão com o servidor.', 0, 'NETWORK_ERROR'); }
    const data = (await parseResponse(response)) as Partial<AuthSession> | null;
    if (!tokenStore.isCurrent(expectedGeneration)) return null;
    if (response.status === 401) {
      if (sessionExpiredHandler) await sessionExpiredHandler();
      else await tokenStore.clear(expectedGeneration);
      return null;
    }
    if (!response.ok) throw new ApiError('Não foi possível renovar a sessão. Tente novamente.', response.status);
    if (!data?.access_token || !data.refresh_token || !data.usuario) {
      throw new ApiError('Resposta de sessão inválida.', 502, 'INVALID_SESSION_RESPONSE');
    }

    const saved = await tokenStore.saveSession(expectedGeneration, data as AuthSession);
    return saved ? data.access_token : null;
  })().finally(() => {
    if (refreshPromise?.promise === promise) refreshPromise = null;
  });
  refreshPromise = { generation: expectedGeneration, promise };
  return promise;
};

export async function apiFetch<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const {
    authenticated = true,
    retryAuth = true,
    idempotencyKey,
    headers: optionHeaders,
    ...requestOptions
  } = options;
  const headers = new Headers(optionHeaders);
  headers.set('Accept', 'application/json');
  if (requestOptions.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const requestGeneration = tokenStore.getGeneration();
  const accessToken = tokenStore.getAccessToken();
  if (authenticated && accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
  if (idempotencyKey) headers.set('Idempotency-Key', idempotencyKey);

  let response: Response;
  try {
    response = await fetch(`${env.apiUrl}${path}`, { ...requestOptions, headers });
  } catch {
    throw new ApiError('Sem conexão com o servidor.', 0, 'NETWORK_ERROR');
  }

  if (authenticated && !tokenStore.isCurrent(requestGeneration)) {
    throw new ApiError('A sessão mudou durante a requisição.', 0, 'SESSION_CHANGED');
  }

  if (response.status === 401 && authenticated && retryAuth) {
    const refreshedToken = await refreshAccessToken(requestGeneration);
    if (!tokenStore.isCurrent(requestGeneration)) {
      throw new ApiError('A sessão mudou durante a renovação.', 0, 'SESSION_CHANGED');
    }
    if (refreshedToken) return apiFetch<T>(path, { ...options, retryAuth: false });
    await sessionExpiredHandler?.();
  }
  if (response.status === 401 && authenticated && !retryAuth && tokenStore.isCurrent(requestGeneration)) await sessionExpiredHandler?.();

  const data = (await parseResponse(response)) as Record<string, unknown> | null;
  if (!response.ok) {
    const message = String(data?.mensagem || data?.erro || `Erro na requisição (${response.status})`);
    throw new ApiError(
      message,
      response.status,
      String(data?.codigo || 'API_ERROR'),
      typeof data?.request_id === 'string' ? data.request_id : undefined,
      typeof data?.campos === 'object' && data.campos ? (data.campos as Record<string, string>) : undefined,
    );
  }
  return data as T;
}

export const authRequest = async (path: '/v2/auth/login' | '/v2/auth/cadastro', body: object) =>
  apiFetch<AuthSession>(path, {
    method: 'POST',
    authenticated: false,
    body: JSON.stringify(body),
  });
