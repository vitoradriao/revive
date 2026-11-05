import { apiCall } from './api';

export const listarRecaidas = token => apiCall('/recaidas', {}, token);
export const createRelapseIntent = (client, accountKey, payload, id) => client.goals('relapse', [payload, id], accountKey);
