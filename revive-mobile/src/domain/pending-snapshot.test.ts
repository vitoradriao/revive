import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { withPendingMutations } from './pending-snapshot';
import type { BootstrapData, ProgressSnapshot, QueuedMutation } from './types';

const snapshot: BootstrapData = { usuario: { id: 'u', nome: 'Teste', email: 'test@example.com' }, server_time: '', vicios: [], registros: [], recaidas: [], metas: [], mensagem: null };
const event: QueuedMutation = { id: 'event-1', userId: 'u', type: 'record.create', payload: { vicio_id: 'v', humor: 'Bem', data_registro: '2026-09-05' }, occurredAt: '', attempts: 0, nextRetryAt: '', status: 'pending' };
const pendingRelapse: QueuedMutation = {
  ...event,
  id: 'relapse-1',
  type: 'relapse.create',
  payload: { addictionId: 'habit', occurred_at: '2026-01-30T12:00:00.000Z', resetarContador: true },
};
const pendingUrge: QueuedMutation = {
  ...event,
  id: 'urge-1',
  type: 'urge.create',
  payload: {
    vicio_id: 'habit', occurred_at: '2026-01-30T12:00:00.000Z', timezone: 'America/Sao_Paulo',
    intensidade: 4, gatilhos: ['estresse'], nota: null, acao_realizada: null, resultado: null,
  },
};
const knownProgress: ProgressSnapshot = {
  sequencia_atual_dias: 30, sequencia_atual_cobertura: 'confirmed', recorde_dias: 30, recorde_cobertura: 'confirmed',
  dias_checkin: 4, economia_sequencia: { valor_estimado: 300, cobertura: 'confirmed' },
  economia_acumulada: { valor_estimado: 500, cobertura: 'confirmed' },
  marcos: [{ id: 'award-30', categoria: 'streak', valor_alvo: 30, awarded_at: '2026-01-31T12:00:00.000Z', origem: 'period_threshold', cobertura: 'confirmed' }],
};

afterEach(() => { jest.useRealTimers(); });

describe('pending snapshot', () => {
  it('keeps unsent records visible across a new server snapshot without modifying the source', () => {
    const projected = withPendingMutations(snapshot, [event]);
    expect(projected.registros[0]).toMatchObject({ id: event.id, pending: true, humor: 'Bem' });
    expect(snapshot.registros).toHaveLength(0);
    expect(withPendingMutations(projected, [event]).registros).toHaveLength(1);
  });
  it('never projects events from another account', () => {
    expect(withPendingMutations(snapshot, [{ ...event, userId: 'other' }]).registros).toHaveLength(0);
  });

  it('projects a queued urge as its own pending event without creating a relapse', () => {
    const projected = withPendingMutations(snapshot, [pendingUrge]);
    expect(projected.vontades).toEqual([expect.objectContaining({
      id: 'urge-1', usuario_id: 'u', vicio_id: 'habit', intensidade: 4,
      created_at: pendingUrge.occurredAt, updated_at: pendingUrge.occurredAt, pending: true,
    })]);
    expect(projected.recaidas).toHaveLength(0);
    expect(withPendingMutations(projected, [pendingUrge]).vontades).toHaveLength(1);
    expect(withPendingMutations(snapshot, [{ ...pendingUrge, userId: 'other' }]).vontades).toHaveLength(0);
  });

  it('fills optional fields when projecting older queued urge payloads', () => {
    const olderPayload = { ...pendingUrge, payload: {
      vicio_id: 'habit', occurred_at: '2026-01-30T12:00:00.000Z', timezone: 'America/Sao_Paulo', intensidade: 2,
    } };
    const event = withPendingMutations(snapshot, [olderPayload]).vontades?.[0];
    expect(event).toMatchObject({ gatilhos: [], nota: null, acao_realizada: null, resultado: null });
  });

  it('projects a queued reset locally while preserving the server record and permanent milestone', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-02-01T12:00:00.000Z'));
    const source = {
      ...snapshot,
      conquistas: [{ id: 'account-award', vicio_id: null, categoria: 'streak' as const, valor_alvo: 30, awarded_at: '2026-01-31T12:00:00.000Z', origem: 'period_threshold' as const, cobertura: 'confirmed' as const }],
      vicios: [{ id: 'habit', usuario_id: 'u', nome_vicio: 'Hábito', data_inicio: '2025-12-01', data_ultima_recaida: null, valor_economizado_por_dia: 10, dias_abstinencia: 30, progresso: knownProgress }],
    } as BootstrapData;
    const projected = withPendingMutations(source, [pendingRelapse]);
    const habit = projected.vicios[0];
    if (!habit) throw new Error('Test habit is missing');

    expect(habit.progresso).toMatchObject({
      sequencia_atual_dias: 2,
      recorde_dias: 30,
      pendente: true,
      economia_sequencia: { valor_estimado: 20 },
      economia_acumulada: { valor_estimado: 500 },
    });
    expect(habit.progresso?.marcos).toEqual(knownProgress.marcos);
    expect(projected.conquistas).toEqual(source.conquistas);
    expect(source.vicios[0]?.progresso).toEqual(knownProgress);
  });

  it('does not turn a queued reflection into a reset or invent a record from an older snapshot', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-02-01T12:00:00.000Z'));
    const legacy = {
      ...snapshot,
      vicios: [{ id: 'habit', usuario_id: 'u', nome_vicio: 'Hábito antigo', data_inicio: '2025-12-01', dias_abstinencia: 30 }],
    } as BootstrapData;
    const reflection = { ...pendingRelapse, id: 'reflection', payload: { ...pendingRelapse.payload, resetarContador: false } };
    const projected = withPendingMutations(legacy, [reflection]);
    const projectedHabit = projected.vicios[0];

    expect(projectedHabit?.dias_abstinencia).toBe(30);
    expect(projectedHabit?.progresso).toMatchObject({ sequencia_atual_dias: 30, recorde_dias: null, recorde_cobertura: 'unknown', pendente: true });
    expect(projected.conquistas).toBeUndefined();
  });
});

it('projects a failed correction over a pending creation without dropping fields or changing counters', () => {
  const creation = { ...event, payload: { ...event.payload, gatilhos: 'Original', observacoes: 'Old' } };
  const edit = { ...event, id: 'edit', type: 'record.update', status: 'failed' as const, lastError: 'REVISAO_CONFLITO', payload: { recordId: event.id, expected_version: 1, observacoes: 'Local' } };
  const data = withPendingMutations(snapshot, [creation, edit]);
  expect(data.registros).toHaveLength(1);
  expect(data.registros[0]).toMatchObject({ gatilhos: 'Original', observacoes: 'Local', pending: true, sync_error: 'REVISAO_CONFLITO' });
  expect(data.recaidas).toEqual(snapshot.recaidas);
  expect(data.vicios).toEqual(snapshot.vicios);
  expect(withPendingMutations(snapshot, [creation, { ...edit, userId: 'other' }]).registros[0]?.observacoes).toBe('Old');
});
