import { apiFetch } from './client';
import type {
  Addiction,
  BootstrapData,
  CreateAddictionInput,
  CreateGoalInput,
  CreateRecordInput,
  CreateRelapseInput,
  Goal,
} from '@/domain/types';

export const reviveApi = {
  getMe: () => apiFetch<{ usuario: BootstrapData['usuario'] }>('/me'),
  bootstrap: () => apiFetch<BootstrapData>('/v2/bootstrap'),
  createAddiction: (input: CreateAddictionInput) =>
    apiFetch<{ vicio: Addiction }>('/vicios', { method: 'POST', body: JSON.stringify(input) }),
  getAddiction: (id: string) => apiFetch<{ vicio: Addiction }>(`/vicios/${id}`),
  deleteAddiction: (id: string) => apiFetch<{ mensagem: string }>(`/vicios/${id}`, { method: 'DELETE' }),
  createRecord: (input: CreateRecordInput, idempotencyKey?: string) =>
    apiFetch('/v2/registros', { method: 'POST', body: JSON.stringify(input), idempotencyKey }),
  createRelapse: (addictionId: string, input: CreateRelapseInput, idempotencyKey?: string) =>
    apiFetch(`/v2/vicios/${addictionId}/recaida`, {
      method: 'POST',
      body: JSON.stringify(input),
      idempotencyKey,
    }),
  createGoal: (input: CreateGoalInput, idempotencyKey?: string) =>
    apiFetch<{ meta: Goal }>('/v2/metas', {
      method: 'POST',
      body: JSON.stringify(input),
      idempotencyKey,
    }),
  completeGoal: (goalId: string, idempotencyKey?: string) =>
    apiFetch<{ meta: Goal }>(`/v2/metas/${goalId}`, {
      method: 'PATCH',
      body: JSON.stringify({ concluida: true }),
      idempotencyKey,
    }),
  deleteGoal: (goalId: string) => apiFetch(`/metas/${goalId}`, { method: 'DELETE' }),
  logout: () =>
    apiFetch<void>('/v2/auth/logout', {
      method: 'POST',
      retryAuth: false,
    }),
  deleteAccount: () => apiFetch<void>('/v2/account', { method: 'DELETE' }),
};
