import { describe, expect, it } from '@jest/globals';
import { decodePayload, encodePayload, validBootstrap } from './envelopes';
import { mapQueueRow } from './queue-row';

const baseRow = {
  id: 'original-key', user_id: 'user-a', type: 'record.create',
  payload: JSON.stringify({ vicio_id: 'habit', humor: 'Bem' }), payload_version: 0,
  occurred_at: '2026-01-01', attempts: 2, next_retry_at: '2026-01-02',
  status: 'failed', last_error: null,
};

describe('versioned local payloads', () => {
  it('keeps a legacy operation replayable with its owner, key and retry state', () => {
    expect(mapQueueRow(baseRow)).toMatchObject({
      id: 'original-key', userId: 'user-a', needsRecovery: false,
      attempts: 2, status: 'failed', payload: { vicio_id: 'habit', humor: 'Bem' },
    });
    expect(mapQueueRow({ ...baseRow, payload: encodePayload({ vicio_id: 'habit', humor: 'Bem' }), payload_version: 1 }).needsRecovery).toBe(false);
  });

  it('blocks unknown, malformed and future operations without dropping the rest of a list', () => {
    const rows = [baseRow,
      { ...baseRow, id: 'unknown', type: 'future.create' },
      { ...baseRow, id: 'broken', payload: '{broken' },
      { ...baseRow, id: 'future', payload_version: 2 },
      { ...baseRow, id: 'next' }];
    const decoded = rows.map(mapQueueRow);
    expect(decoded.map((item) => item.id)).toEqual(['original-key', 'unknown', 'broken', 'future', 'next']);
    expect(decoded.map((item) => item.needsRecovery)).toEqual([false, true, true, true, false]);
    expect(decoded[2]?.payload).toEqual({});
  });

  it('rejects snapshots belonging to another account or with incompatible collections', () => {
    const snapshot = { server_time: '', usuario: { id: 'user-a' }, vicios: [], registros: [], recaidas: [], metas: [], mensagem: null };
    expect(validBootstrap(decodePayload(encodePayload(snapshot), 1), 'user-a')).toBe(true);
    expect(validBootstrap(snapshot, 'user-b')).toBe(false);
    expect(validBootstrap({ ...snapshot, registros: null }, 'user-a')).toBe(false);
    expect(validBootstrap({ ...snapshot, registros: [null] }, 'user-a')).toBe(false);
  });
});
