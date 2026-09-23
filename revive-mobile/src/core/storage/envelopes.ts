import type { BootstrapData, QueueOperationType } from '../../domain/types';

export const PAYLOAD_VERSION = 1;

const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const encodePayload = (data: unknown) => JSON.stringify({ version: PAYLOAD_VERSION, data });

export const decodePayload = (raw: string, version: number): unknown => {
  const parsed: unknown = JSON.parse(raw);
  if (version === 0) return parsed;
  if (version === PAYLOAD_VERSION && object(parsed) && parsed.version === PAYLOAD_VERSION) return parsed.data;
  throw new Error('Versão de payload incompatível.');
};

export const validBootstrap = (value: unknown, userId: string): value is BootstrapData =>
  object(value) && object(value.usuario) && value.usuario.id === userId &&
  typeof value.server_time === 'string' &&
  Array.isArray(value.vicios) && value.vicios.every(object) &&
  Array.isArray(value.registros) && value.registros.every(object) &&
  Array.isArray(value.recaidas) && value.recaidas.every(object) &&
  Array.isArray(value.metas) && value.metas.every(object) &&
  (value.mensagem === null || object(value.mensagem));

export const validMutation = (type: string, value: unknown): type is QueueOperationType => {
  if (!object(value)) return false;
  switch (type) {
    case 'record.create': return typeof value.vicio_id === 'string' && typeof value.humor === 'string';
    case 'relapse.create': return typeof value.addictionId === 'string' && typeof value.resetarContador === 'boolean';
    case 'goal.create': return typeof value.vicio_id === 'string' && typeof value.descricao_meta === 'string';
    case 'goal.complete': return typeof value.goalId === 'string';
    default: return false;
  }
};
