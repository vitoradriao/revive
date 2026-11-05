import { apiCall } from './api';

// Leituras e exclusões conservam os contratos legados com sessão v2 validada.
export const listarMetas = token => apiCall('/metas', {}, token);
export const createGoalIntent = (client, accountKey, payload, id) => client.goals('create', [payload, id], accountKey);
export const completeGoalIntent = (client, accountKey, goalId) => client.goals('complete', [goalId], accountKey);
export const deleteConfirmedGoal = (client, accountKey, goalId) => client.goals('delete', [goalId], accountKey);
