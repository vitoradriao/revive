import type { BootstrapData, CreateGoalInput, DailyRecord, QueuedMutation } from './types';

/** Project durable queued events onto the server snapshot without mutating it. */
export function withPendingMutations(snapshot: BootstrapData, mutations: QueuedMutation[]): BootstrapData {
  const result = { ...snapshot, registros: [...snapshot.registros], recaidas: [...snapshot.recaidas], metas: [...snapshot.metas], vicios: [...snapshot.vicios] };
  for (const mutation of mutations) {
    if (mutation.userId !== snapshot.usuario.id || mutation.needsRecovery) continue;
    const payload = mutation.payload;
    if (mutation.type === 'record.create' && !result.registros.some((item) => item.id === mutation.id)) {
      result.registros.unshift({ ...payload, id: mutation.id, pending: true } as DailyRecord);
    }
    if (mutation.type === 'relapse.create' && !result.recaidas.some((item) => item.id === mutation.id)) {
      result.recaidas.unshift({ id: mutation.id, vicio_id: String(payload.addictionId), data_recaida: String(payload.occurred_at), motivo: payload.motivo ? String(payload.motivo) : null, pending: true });
      if (payload.resetarContador === true) result.vicios = result.vicios.map((item) => {
        if (item.id !== payload.addictionId) return item;
        const occurredAt = String(payload.occurred_at);
        if (new Date(occurredAt) < new Date(item.data_ultima_recaida || item.data_inicio)) return item;
        const days = Math.max(0, Math.floor((Date.now() - new Date(occurredAt).getTime()) / 86400000));
        return { ...item, data_ultima_recaida: occurredAt, dias_abstinencia: days, valor_economizado: days * Number(item.valor_economizado_por_dia || 0), tempo_formatado: `${days} dias` };
      });
    }
    if (mutation.type === 'goal.create' && !result.metas.some((item) => item.id === mutation.id)) {
      result.metas.unshift({ ...(payload as CreateGoalInput), id: mutation.id, usuario_id: mutation.userId, pending: true, concluida: false });
    }
    if (mutation.type === 'goal.complete') result.metas = result.metas.map((item) => item.id === payload.goalId ? { ...item, concluida: true, pending: true } : item);
  }
  return result;
}
