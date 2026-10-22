import { requestSnapshot } from './request-snapshot';
import { getSessionManager } from '../services/session-manager';
import { apiCall } from '../services/api';
import { openAccountDatabase } from './account-database';
import { createSyncCoordinator } from './sync-coordinator';

const POINTER = 'revive_offline_account';
const changed = () => Object.assign(new Error('A conta mudou. Reabra a operação.'), { code: 'SESSAO_ALTERADA' });
let singleton;
export function getOfflineClient() { return singleton ||= createOfflineClient(); }

export function createOfflineClient({ session = getSessionManager(), storage = localStorage, open = openAccountDatabase, request = apiCall } = {}) {
  let state = { loading: true, user: null, snapshot: null, queue: [], receipts: [], error: null, localOnly: false };
  const listeners = new Set(), enqueuing = new Map();
  let store, coordinator, generation = 0, currentKey, started = false, closing = false, refreshPromise, refreshKey;
  const publish = patch => { state = { ...state, ...patch }; listeners.forEach(fn => fn()); };
  const readPointer = () => { try { return JSON.parse(storage.getItem(POINTER)); } catch { return null; } };
  const update = async () => {
    const db = store, key = currentKey;
    if (!db) return;
    const [snapshot, queue, receipts] = await Promise.all([db.getSnapshot(), db.getQueue(), db.getReceipts()]);
    if (db !== store || key !== currentKey) return;
    publish({ snapshot, queue, receipts, user: snapshot?.data.usuario || state.user });
  };
  const sync = async () => {
    const db = store, key = currentKey;
    if (!coordinator) return { paused: true };
    try {
      const result = await coordinator.run();
      if (db !== store || key !== currentKey) return { paused: true, error: changed() };
      await update();
      if (result.error || result.refreshError) publish({ error: result.error || result.refreshError });
      return result;
    } catch (error) { if (db === store && key === currentKey) publish({ error }); return { error, paused: true }; }
  };
  const refresh = () => {
    if (refreshPromise && refreshKey === currentKey) return refreshPromise;
    refreshKey = currentKey;
    const db = store, key = currentKey, auth = session.getSnapshot();
    if (!db || !auth.token || auth.user?.id !== db.userId || navigator.onLine === false) return Promise.resolve();
    const task = (async () => {
      try {
        await coordinator.withAccountLock(async () => {
          if (db !== store || key !== currentKey || session.getSnapshot().epoch !== auth.epoch) throw changed();
          const snapshot = await requestSnapshot((path, options) => request(path, options, auth.token));
          if (db !== store || key !== currentKey || session.getSnapshot().epoch !== auth.epoch) throw changed();
          await db.saveSnapshot(snapshot);
        });
        if (db !== store || key !== currentKey) return;
        storage.setItem(POINTER, JSON.stringify({ userId: db.userId, epoch: auth.epoch }));
        await update(); if (db === store && key === currentKey) publish({ error: null });
      } catch (error) { if (db === store && key === currentKey) publish({ error }); }
    })().finally(() => { if (refreshPromise === task) refreshPromise = null; });
    refreshPromise = task;
    return task;
  };
  const connect = async () => {
    if (closing) return;
    const auth = session.getSnapshot(), pointer = readPointer();
    // Only a network restoration failure can reopen a previously authenticated local account.
    // A confirmed 401, logout or a different generation never unlocks the old cache.
    const local = !auth.user && !auth.authLoading && auth.authError && !auth.authError.status &&
      pointer?.epoch === auth.epoch ? pointer.userId : null;
    const userId = auth.user?.id || local;
    const key = userId ? userId + ':' + auth.epoch : null;
    if (key === currentKey) {
      const resumed = auth.token && state.localOnly;
      publish({ localOnly: !!local || navigator.onLine === false, loading: auth.authLoading && !state.snapshot });
      if (resumed) { void sync(); void refresh(); }
      return;
    }
    currentKey = key; const ticket = ++generation;
    coordinator?.dispose(); coordinator = null; store?.close(); store = null;
    publish({ accountKey: key, epoch: auth.epoch, loading: !!key || auth.authLoading, user: auth.user || null, snapshot: null, queue: [], receipts: [], error: null, localOnly: !!local });
    if (!key) {
      if (!auth.authLoading && !auth.authError) storage.removeItem(POINTER);
      return;
    }
    try {
      const db = await open(userId, { onVersionChange: () => {
        if (ticket === generation) publish({ error: Object.assign(new Error('O armazenamento foi atualizado em outra aba. Reabra a página; suas pendências foram preservadas.'), { code: 'STORAGE_VERSION_CHANGED' }) });
      } });
      if (ticket !== generation) { db.close(); return; }
      store = db;
      coordinator = createSyncCoordinator({ store: db, session,
        isAccountActive: () => currentKey === key && !closing,
        onChange: () => { if (ticket === generation) void update().catch(error => { if (ticket === generation) publish({ error }); }); }
      });
      await update();
      if (ticket !== generation) return;
      publish({ loading: false });
      if (auth.token) { await sync(); await refresh(); }
    } catch (error) { if (ticket === generation) publish({ loading: false, error }); }
  };
  const wake = async () => {
    await connect();
    if (session.getSnapshot().authError && navigator.onLine !== false) await session.restore();
    await sync(); await refresh();
  };
  const requireCoordinator = () => {
    if (!coordinator || closing) throw Object.assign(new Error('O armazenamento local não está disponível. Nada foi salvo.'), { code: 'STORAGE_UNAVAILABLE' });
    return coordinator;
  };
  return {
    getSnapshot: () => state,
    subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn); },
    start: () => {
      if (started) return;
      started = true; session.subscribe(() => { void connect(); });
      window.addEventListener('online', () => { void wake(); });
      window.addEventListener('offline', () => publish({ localOnly: true }));
      window.addEventListener('focus', () => { void wake(); });
      setInterval(() => { if (document.visibilityState === 'visible') void sync(); }, 15000);
      void connect();
    },
    refresh, sync,
    getHabitDraft: async (draftId, accountKey) => {
      const db = store;
      if (!accountKey || accountKey !== currentKey) throw changed();
      const draft = await db.getHabitDraft(draftId);
      if (db !== store || accountKey !== currentKey) throw changed();
      return draft;
    },
    saveHabitDraft: (draftId, draft, accountKey) => {
      const db = store;
      if (!accountKey || accountKey !== currentKey) throw changed();
      return requireCoordinator().withAccountLock(async () => {
        if (db !== store || accountKey !== currentKey) throw changed();
        await db.saveHabitDraft(draftId, draft);
        if (db !== store || accountKey !== currentKey) throw changed();
        return draft;
      });
    },
    manageHabit: async (habitId, draftId, input, accountKey) => {
      if (!accountKey || accountKey !== currentKey) throw changed();
      const result = await requireCoordinator().manageHabit(habitId, draftId, input);
      if (accountKey !== currentKey) throw changed();
      await update();
      if (accountKey !== currentKey) throw changed();
      return result;
    },
    enqueue: (type, payload, options) => {
      const key = currentKey + ':' + type + ':' + JSON.stringify(payload) + ':' + JSON.stringify(options);
      if (enqueuing.has(key)) return enqueuing.get(key);
      const account = currentKey;
      const task = (async () => {
        const intent = await requireCoordinator().enqueue(type, payload, options);
        if (account !== currentKey) throw changed();
        // A UI/cache read failure after the commit must never invite a second creation.
        try { await update(); } catch (error) { publish({ error }); }
        void sync(); return intent;
      })().finally(() => enqueuing.delete(key));
      enqueuing.set(key, task); return task;
    },
    retry: async id => { await requireCoordinator().retry(id); await update(); },
    discard: async id => { await requireCoordinator().discard(id); await update(); },
    savePage: async (kind, filters, data, accountKey) => {
      const db = store;
      if (!accountKey || accountKey !== currentKey) throw changed();
      await requireCoordinator().withAccountLock(() => {
        if (accountKey !== currentKey) throw changed();
        return db.savePage(kind, filters, data);
      });
      if (accountKey === currentKey) await update();
    },
    getPage: async (kind, filters) => {
      const db = store, key = currentKey, result = await db?.getPage(kind, filters);
      if (db !== store || key !== currentKey) throw changed();
      return result;
    },
    logout: async (choice = 'check') => {
      const db = store, syncer = coordinator;
      if (!db || !syncer) { await session.logout(); return true; }
      if (choice === 'sync') {
        const result = await sync();
        if (result.error || result.refreshError || (await db.getQueue()).length) throw new Error('Ainda há pendências. Revise a tela de Sincronização antes de sair.');
      }
      return syncer.withAccountLock(async () => {
        if (db !== store) throw changed();
        const pending = await db.getQueue();
        if (pending.length && choice !== 'discard') return false;
        closing = true;
        try {
          // Keep the handle alive until revocation is confirmed and local cleanup commits.
          await session.logout();
          await db.clearAccount({ discardPending: choice === 'discard' });
          storage.removeItem(POINTER);
          return true;
        } finally { closing = false; void connect(); }
      });
    }
  };
}
