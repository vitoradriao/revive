import type { BootstrapData, CreateGoalInput, CreateUrgeEventInput, DailyRecord, QueuedMutation } from './types';

const DAY_MS = 86_400_000;

function projectRelapse(addiction: BootstrapData['vicios'][number], occurredAt: string, resetCounter: boolean) {
  const occurredTime = new Date(occurredAt).getTime();
  const anchorTime = new Date(addiction.data_ultima_recaida || addiction.data_inicio).getTime();
  const appliesToCurrent = resetCounter && Number.isFinite(occurredTime) && occurredTime >= anchorTime;
  const currentDays = appliesToCurrent
    ? Math.max(0, Math.floor((Date.now() - occurredTime) / DAY_MS))
    : addiction.progresso ? addiction.progresso.sequencia_atual_dias : addiction.dias_abstinencia ?? null;
  const dailyValue = addiction.valor_economizado_por_dia == null ? null : Number(addiction.valor_economizado_por_dia);
  const currentSavings = appliesToCurrent
    ? currentDays != null && dailyValue != null && Number.isFinite(dailyValue) ? Math.round(currentDays * dailyValue * 100) / 100 : null
    : addiction.progresso ? addiction.progresso.economia_sequencia.valor_estimado : null;
  const previousProgress = addiction.progresso || {
    sequencia_atual_dias: null,
    sequencia_atual_cobertura: 'unknown' as const,
    recorde_dias: null,
    recorde_cobertura: 'unknown' as const,
    dias_checkin: 0,
    economia_sequencia: { valor_estimado: null, cobertura: 'unknown' as const },
    economia_acumulada: { valor_estimado: null, cobertura: 'unknown' as const },
    marcos: [],
  };
  return {
    ...addiction,
    ...(appliesToCurrent ? {
      data_ultima_recaida: occurredAt,
      dias_abstinencia: currentDays ?? 0,
      valor_economizado: currentSavings,
      tempo_formatado: `${currentDays ?? 0} dias`,
    } : {}),
    progresso: {
      ...previousProgress,
      sequencia_atual_dias: currentDays,
      sequencia_atual_cobertura: appliesToCurrent ? 'confirmed' as const : previousProgress.sequencia_atual_cobertura,
      economia_sequencia: {
        valor_estimado: currentSavings,
        cobertura: appliesToCurrent
          ? dailyValue != null ? 'inferred' as const : 'unknown' as const
          : previousProgress.economia_sequencia.cobertura,
      },
      pendente: true,
    },
  };
}

/** Project durable queued events onto the server snapshot without mutating it. */
export function withPendingMutations(snapshot: BootstrapData, mutations: QueuedMutation[]): BootstrapData {
  const result = {
    ...snapshot,
    registros: [...snapshot.registros],
    recaidas: [...snapshot.recaidas],
    vontades: [...(snapshot.vontades ?? [])],
    metas: [...snapshot.metas],
    vicios: [...snapshot.vicios],
  };
  for (const mutation of mutations) {
    if (mutation.userId !== snapshot.usuario.id || mutation.needsRecovery) continue;
    const payload = mutation.payload;
    const recordId = mutation.resolvedRecordId || mutation.id;
    if (mutation.type === 'record.create' && !result.registros.some((item) => item.id === recordId)) {
      result.registros.unshift({ ...payload, id: recordId, pending: true, sync_error: mutation.lastError } as DailyRecord);
    }
    if (mutation.type === 'record.update') {
      result.registros = result.registros.map(record => record.id === payload.recordId ? {
        ...record, ...Object.fromEntries(['humor', 'gatilhos', 'conquistas', 'observacoes'].filter(key => key in payload).map(key => [key, payload[key]])), pending: true, sync_error: mutation.lastError,
      } : record);
    }
    if (mutation.type === 'relapse.create'  && !result.recaidas.some((item) => item.id === mutation.id)) {
      result.recaidas.unshift({ id: mutation.id, vicio_id: String(payload.addictionId), data_recaida: String(payload.occurred_at), motivo: payload.motivo ? String(payload.motivo) : null, pending: true });
      result.vicios = result.vicios.map((item) => item.id === payload.addictionId
        ? projectRelapse(item, String(payload.occurred_at), payload.resetarContador === true)
        : item);
    }
    if (mutation.type === 'urge.create' && !result.vontades?.some((item) => item.id === mutation.id)) {
      const urge = payload as CreateUrgeEventInput;
      result.vontades?.unshift({
        ...urge,
        gatilhos: urge.gatilhos ?? [],
        nota: urge.nota ?? null,
        acao_realizada: urge.acao_realizada ?? null,
        resultado: urge.resultado ?? null,
        id: mutation.id,
        usuario_id: mutation.userId,
        created_at: mutation.occurredAt,
        updated_at: mutation.occurredAt,
        pending: true,
      });
    }
    if (mutation.type === 'goal.create' && !result.metas.some((item) => item.id === mutation.id)) {
      result.metas.unshift({ ...(payload as CreateGoalInput), id: mutation.id, usuario_id: mutation.userId, pending: true, concluida: false });
    }
    if (mutation.type === 'goal.complete') result.metas = result.metas.map((item) => item.id === payload.goalId ? { ...item, concluida: true, pending: true } : item);
  }
  return result;
}
