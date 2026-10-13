import type { BootstrapData, QueueOperationType, UrgeEventPage } from '../../domain/types';

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
  (!('vontades' in value) || (Array.isArray(value.vontades) && value.vontades.every(event =>
    object(event) && event.usuario_id === userId))) &&
  (value.mensagem === null || object(value.mensagem));

export const validUrgeEventPage = (value: unknown, userId: string): value is UrgeEventPage =>
  object(value) && Array.isArray(value.vontades) && value.vontades.every(event => object(event)
    && event.usuario_id === userId && typeof event.id === 'string' && typeof event.vicio_id === 'string'
    && typeof event.occurred_at === 'string' && Number.isFinite(Date.parse(event.occurred_at)) && typeof event.timezone === 'string'
    && Number.isInteger(event.intensidade) && Number(event.intensidade) >= 0 && Number(event.intensidade) <= 10
    && Array.isArray(event.gatilhos) && event.gatilhos.every(code => typeof code === 'string'))
  && (value.next_cursor === null || typeof value.next_cursor === 'string')
  && object(value.cobertura) && Number.isInteger(value.cobertura.total) && Number(value.cobertura.total) >= 0
  && Number.isInteger(value.cobertura.retornados) && Number(value.cobertura.retornados) === value.vontades.length
  && Number(value.cobertura.total) >= value.vontades.length
  && typeof value.cobertura.tem_mais === 'boolean'
  && typeof value.atualizado_em === 'string';

export const validMutation = (type: string, value: unknown): type is QueueOperationType => {
  if (!object(value)) return false;
  switch (type) {
    case 'record.update': return typeof value.recordId === 'string' && Number.isInteger(value.expected_version) && Number(value.expected_version) > 0;
    case 'record.create': return typeof value.vicio_id === 'string' && typeof value.humor === 'string';
    case 'relapse.create': return typeof value.addictionId === 'string' && typeof value.resetarContador === 'boolean';
    case 'urge.create': return typeof value.vicio_id === 'string' && typeof value.occurred_at === 'string'
      && typeof value.timezone === 'string' && Number.isInteger(value.intensidade)
      && Array.isArray(value.gatilhos) && value.gatilhos.every(code => typeof code === 'string');
    case 'goal.create': return typeof value.vicio_id === 'string' && typeof value.descricao_meta === 'string';
    case 'goal.complete': return typeof value.goalId === 'string';
    default: return false;
  }
};
