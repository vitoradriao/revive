import type { BootstrapData } from '@/domain/types';

/**
 * Exportação JSON do REVIVE (#27): envelope versionado e sem identificadores de conta.
 *
 * O JSON anterior compartilhava o bootstrap inteiro, incluindo id e e-mail da conta.
 * Aqui removemos, em qualquer profundidade, chaves de identificação da conta e de sessão.
 */
export const EXPORT_SCHEMA_VERSION = 1;

const EXCLUDED_KEYS = new Set([
  'usuario',
  'usuario_id',
  'email',
  'access_token',
  'refresh_token',
  'idempotency_key',
  'client_operation_id',
]);

const omitExcluded = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(omitExcluded);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => !EXCLUDED_KEYS.has(key))
        .map(([key, item]) => [key, omitExcluded(item)]),
    );
  }
  return value;
};

export const createExportJson = (data: BootstrapData, generatedAt = new Date()) => JSON.stringify({
  schemaVersion: EXPORT_SCHEMA_VERSION,
  generated_at: generatedAt.toISOString(),
  escopo: 'snapshot_local',
  ...(omitExcluded(data) as Record<string, unknown>),
}, null, 2);
