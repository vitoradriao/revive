import type { QueuedMutation } from '../../domain/types';
import { decodePayload, validMutation } from './envelopes';

export const mapQueueRow = (row: Record<string, unknown>): QueuedMutation => {
  let payload: Record<string, unknown> = {};
  let needsRecovery = true;
  try {
    const decoded = decodePayload(String(row.payload), Number(row.payload_version));
    if (validMutation(String(row.type), decoded)) {
      payload = decoded as Record<string, unknown>;
      needsRecovery = false;
    }
  } catch { /* Preserve the row, and block automatic replay. */ }
  return {
    id: String(row.id), userId: String(row.user_id), type: String(row.type), payload,
    occurredAt: String(row.occurred_at), attempts: Number(row.attempts),
    nextRetryAt: String(row.next_retry_at), status: String(row.status) as QueuedMutation['status'],
    lastError: needsRecovery ? 'Alteração incompatível. Mantenha os dados e atualize o aplicativo para recuperar.' : row.last_error ? String(row.last_error) : null,
    needsRecovery,
  };
};
