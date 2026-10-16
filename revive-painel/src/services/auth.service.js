import { apiCall } from './api';
import { getSessionManager } from './session-manager';

export const login = (email, senha) => getSessionManager().login(email, senha);
export const cadastro = (nome, email, senha) => getSessionManager().cadastro(nome, email, senha);
export const getMe = token => apiCall('/me', {}, token);
export const updateMe = (nome, token) => apiCall('/me', {
  method: 'PATCH', body: JSON.stringify({ nome })
}, token);
