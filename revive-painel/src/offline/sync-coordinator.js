import { apiCall } from '../services/api.js';
import { getSessionManager } from '../services/session-manager.js';

const changed = () => Object.assign(new Error('A conta mudou antes da sincronização. A intenção continua preservada.'), { code: 'SESSAO_ALTERADA' });
export function mutationRequest(intent) {
  const payload = { ...intent.payload };
  switch (intent.type) {
    case 'record.create': return ['/v2/registros', 'POST', payload];
    case 'record.update': {
      const { recordId, ...fields } = payload;
      return ['/v2/registros/' + encodeURIComponent(recordId), 'PATCH', fields];
    }
    case 'urge.create': return ['/v2/vontades', 'POST', payload];
    case 'relapse.create': {
      const { addictionId, ...fields } = payload;
      return ['/v2/vicios/' + encodeURIComponent(addictionId) + '/recaida', 'POST', fields];
    }
    case 'goal.create': return ['/v2/metas', 'POST', payload];
    case 'goal.complete': return ['/v2/metas/' + encodeURIComponent(payload.goalId), 'PATCH', { concluida: true }];
    default: throw Object.assign(new Error('Tipo de intenção desconhecido. O conteúdo foi preservado.'), { code: 'INTENT_INVALID' });
  }
}

export function createSyncCoordinator({
  store, session = getSessionManager(), locks = navigator.locks, request = apiCall,
  isAccountActive = () => session.getSnapshot().user?.id === store.userId,
  onChange = () => {}, isOnline = () => navigator.onLine !== false
}) {
  let running, disposed = false;
  const lock = task => {
    if (!locks?.request) throw Object.assign(new Error('O navegador não oferece coordenação segura entre abas.'), { code: 'COORDENACAO_INDISPONIVEL' });
    return locks.request('revive-sync-' + store.userId, task);
  };
  const active = () => !disposed && isAccountActive();
  const notify = () => { if (active()) onChange(); };
  const run = () => {
    if (running) return running;
    const initial = session.getSnapshot();
    const current = () => active() && session.getSnapshot().user?.id === store.userId &&
      session.getSnapshot().epoch === initial.epoch && !!session.getSnapshot().token;
    running = (async () => {
      if (!current() || !isOnline()) return { synced: 0, paused: true };
      return lock(async () => {
        if (!current()) return { synced: 0, paused: true };
        // Only the holder of the account lock may recover an interrupted sender.
        await store.recoverInterrupted();
        await session.ensureToken();
        if (!current()) throw changed();
        let synced = 0;
        for (;;) {
          if (!current() || !isOnline()) break;
          const [intent] = await store.getQueue();
          if (!intent || intent.status === 'recovery' || intent.dependsOn || intent.nextRetryAt > Date.now()) break;
          const sending = await store.markSending(intent.id);
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 20000);
          try {
            if (!current()) throw changed();
            const [path, method, body] = mutationRequest(sending);
            const response = await request(path, {
              method, body: JSON.stringify(body), signal: controller.signal,
              headers: { 'Idempotency-Key': sending.id }
            }, session.getSnapshot().token);
            if (!current()) throw changed();
            // Receipt, ID binding, cached pages and queue removal share one native transaction.
            await store.acknowledge(sending.id, response);
            synced++; notify();
          } catch (error) {
            // Leave a sender interrupted if another account owns the UI; A will reconcile with the same key.
            if (!current()) break;
            await store.markFailed(sending.id, error);
            notify();
            return { synced, error, paused: true };
          } finally { clearTimeout(timeout); }
        }
        if (!current()) return { synced, paused: true, error: changed() };
        if (synced && current()) {
          try {
            const snapshot = await request('/v2/bootstrap', {}, session.getSnapshot().token);
            if (!current()) throw changed();
            await store.saveSnapshot(snapshot);
          } catch (error) {
            notify();
            return { synced, refreshError: error, paused: true };
          }
        }
        const pending = (await store.getQueue()).length;
        notify();
        return { synced, pending, paused: pending > 0 };
      });
    })().finally(() => { running = null; });
    return running;
  };
  const localAction = task => lock(async () => {
    if (!active()) throw changed();
    await store.recoverInterrupted();
    if (!active()) throw changed();
    const result = await task();
    notify(); return result;
  });
  return {
    run,
    enqueue: (type, payload, options) => localAction(() => store.enqueue(type, payload, options)),
    retry: async id => { await localAction(() => store.retry(id)); return run(); },
    discard: id => localAction(() => store.discard(id)),
    discardAll: () => localAction(() => store.discardAll()),
    withAccountLock: localAction,
    dispose: () => { disposed = true; }
  };
}
