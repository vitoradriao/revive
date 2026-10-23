import { httpRequest } from './http';

const META_KEY = 'revive_auth_metadata';
const LOCK_NAME = 'revive-web-auth';
const CHANNEL_NAME = 'revive-web-auth';
const changedError = () => Object.assign(new Error('A sessão mudou. Tente novamente na conta atual.'), { code: 'SESSAO_ALTERADA' });

export function createSessionManager(environment = {}) {
  const storage = environment.storage || {
    getItem: key => window.localStorage.getItem(key),
    setItem: (key, value) => window.localStorage.setItem(key, value),
    removeItem: key => window.localStorage.removeItem(key)
  };
  const locks = environment.locks || navigator.locks;
  const makeChannel = environment.makeChannel || (name => new BroadcastChannel(name));
  const request = environment.request || httpRequest;
  const listenStorage = environment.listenStorage || (handler => {
    const listener = event => { if (event.key === META_KEY) handler(); };
    window.addEventListener('storage', listener);
    return () => window.removeEventListener('storage', listener);
  });
  // IDs only coordinate generations; they are never authentication credentials.
  const newId = () => crypto.randomUUID?.() || `tab-${Date.now()}-${Math.random()}`;
  const id = newId();
  const activeRequests = new Set();
  const listeners = new Set(), tokenEpochs = new Map(), peerWaiters = new Set();
  let channel, unlisten, started = false, disposed = false, restoring;
  let snapshot = { token: '', user: null, expiresAt: 0, authLoading: true, authError: null, epoch: '', revision: -1 };

  const readMeta = () => {
    const raw = storage.getItem(META_KEY);
    if (!raw) return { epoch: 'initial', revision: 0 };
    try {
      const meta = JSON.parse(raw);
      if (typeof meta.epoch === 'string' && Number.isSafeInteger(meta.revision) && meta.revision >= 0) return meta;
    } catch { /* Invalid coordination metadata never becomes a credential. */ }
    throw Object.assign(new Error('Não foi possível coordenar a sessão entre abas.'), { code: 'COORDENACAO_INDISPONIVEL' });
  };
  const publish = patch => {
    if (disposed) return;
    snapshot = { ...snapshot, ...patch };
    for (const listener of listeners) listener();
  };
  const clear = (meta, error = null) => {
    for (const controller of activeRequests) controller.abort();
    activeRequests.clear();
    tokenEpochs.clear();
    publish({ token: '', user: null, expiresAt: 0, epoch: meta.epoch, revision: meta.revision, authLoading: false, authError: error });
  };
  const syncMeta = () => {
    const meta = readMeta();
    if (snapshot.epoch !== meta.epoch) clear(meta);
    return meta;
  };
  const setMeta = meta => { storage.setItem(META_KEY, JSON.stringify(meta)); return meta; };
  const transition = () => {
    const meta = setMeta({ epoch: newId(), revision: 0 });
    clear(meta);
    channel?.postMessage({ kind: 'invalidate', sender: id, meta });
    return meta;
  };
  const stillCurrent = meta => {
    const current = readMeta();
    return !disposed && current.epoch === meta.epoch;
  };
  const accept = (data, meta, broadcast = false) => {
    const current = readMeta();
    if (disposed || current.epoch !== meta.epoch || current.revision !== meta.revision) return false;
    if (typeof data.access_token !== 'string' || !data.usuario?.id || !Number.isFinite(data.expiresAt)) return false;
    tokenEpochs.set(data.access_token, meta.epoch);
    // Only the current and immediately preceding tokens are needed for in-flight requests.
    if (tokenEpochs.size > 3) tokenEpochs.delete(tokenEpochs.keys().next().value);
    publish({ token: data.access_token, user: data.usuario, expiresAt: data.expiresAt, ...meta, authLoading: false, authError: null });
    if (broadcast) channel?.postMessage({ kind: 'session', sender: id, meta, data });
    for (const done of peerWaiters) done();
    return true;
  };
  const fresh = meta => snapshot.token && snapshot.epoch === meta.epoch &&
    snapshot.revision === meta.revision && snapshot.expiresAt > Date.now() + 15000;
  const peerSession = () => new Promise(resolve => {
    const timer = setTimeout(done, 80);
    function done() { clearTimeout(timer); peerWaiters.delete(done); resolve(); }
    peerWaiters.add(done);
    channel?.postMessage({ kind: 'request-session', sender: id });
  });
  const locked = task => {
    if (!locks?.request) throw Object.assign(new Error('Abra o Revive por HTTPS ou localhost em um navegador com suporte à coordenação de abas.'), { code: 'COORDENACAO_INDISPONIVEL' });
    return locks.request(LOCK_NAME, task);
  };
  const authRequest = async (operation, body = {}) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      return await request('/v2/web-auth/' + operation, { method: 'POST', body: JSON.stringify(body), signal: controller.signal, ...(operation === 'logout' ? { expectedStatus: 204 } : {}) });
    } finally { clearTimeout(timeout); }
  };
  const applyResponse = (response, meta) => {
    if (!stillCurrent(meta)) throw changedError();
    if (typeof response.access_token !== 'string' || !response.usuario?.id ||
      !Number.isFinite(response.expires_in) || response.expires_in <= 0 || response.refresh_token !== undefined) {
      throw Object.assign(new Error('Resposta de sessão inválida.'), { code: 'RESPOSTA_INVALIDA', outcomeUnknown: true });
    }
    const next = setMeta({ epoch: meta.epoch, revision: readMeta().revision + 1 });
    const data = { access_token: response.access_token, usuario: response.usuario, expiresAt: Date.now() + response.expires_in * 1000 };
    if (!accept(data, next, true)) throw changedError();
    return response;
  };
  const ensureToken = async (failedToken = null) => {
    const initial = syncMeta();
    return locked(async () => {
      let meta = syncMeta();
      if (meta.epoch !== initial.epoch) throw changedError();
      if (fresh(meta) && (!failedToken || snapshot.token !== failedToken)) return snapshot.token;
      // A peer may own the latest access token; it is shared only in memory.
      await peerSession();
      meta = syncMeta();
      if (meta.epoch !== initial.epoch) throw changedError();
      if (fresh(meta) && (!failedToken || snapshot.token !== failedToken)) return snapshot.token;
      try {
        applyResponse(await authRequest('refresh'), meta);
        return snapshot.token;
      } catch (error) {
        if (stillCurrent(meta)) {
          if (error.status === 401) transition();
          else publish({ authLoading: false, authError: error });
        }
        throw error;
      }
    });
  };
  const start = () => {
    if (started) return restoring || Promise.resolve();
    started = true;
    try {
      storage.removeItem('revive_token');
      const meta = readMeta();
      publish({ epoch: meta.epoch, revision: meta.revision });
      channel = makeChannel(CHANNEL_NAME);
      channel.onmessage = event => {
        const message = event.data;
        if (!message || message.sender === id) return;
        try {
          const current = syncMeta();
          if (message.kind === 'request-session' && fresh(current)) {
            channel.postMessage({ kind: 'session', sender: id, meta: current, data: {
              access_token: snapshot.token, usuario: snapshot.user, expiresAt: snapshot.expiresAt
            } });
          } else if (message.kind === 'session' && message.meta) {
            accept(message.data || {}, message.meta);
          }
        } catch (error) { publish({ authError: error, authLoading: false }); }
      };
      unlisten = listenStorage(() => {
        try {
          const meta = syncMeta();
          // Broadcast and storage notifications can arrive in either order. Ask the
          // current owner again once coordination metadata is visible in this tab.
          if (!fresh(meta)) void peerSession();
        } catch (error) { publish({ authError: error, authLoading: false }); }
      });
    } catch (error) {
      publish({ authLoading: false, authError: error });
      return Promise.resolve();
    }
    return restore();
  };
  const restore = () => {
    if (restoring) return restoring;
    publish({ authLoading: true, authError: null });
    restoring = ensureToken().catch(error => {
      if (error.status !== 401 && error.code !== 'SESSAO_ALTERADA') publish({ authError: error });
    }).finally(() => { restoring = null; publish({ authLoading: false }); });
    return restoring;
  };
  const signIn = (operation, body) => locked(async () => {
    // End an old cookie session before switching accounts, even if the next login fails.
    await authRequest('logout');
    const meta = transition();
    const response = await authRequest(operation, body);
    applyResponse(response, meta);
    return { ...response, token: response.access_token };
  });
  const logout = (cleanup = async () => {}) => {
    const initial = { epoch: snapshot.epoch };
    return locked(async () => {
      if (syncMeta().epoch !== initial.epoch) throw changedError();
      await authRequest('logout');
      if (!stillCurrent(initial)) throw changedError();
      try { await cleanup(); } finally { transition(); }
    });
  };
  const deleteAccount = async (cleanup = async () => {}) => {
    const initial = syncMeta();
    await ensureToken();
    return locked(async () => {
      if (!stillCurrent(initial) || !snapshot.user || snapshot.epoch !== initial.epoch) throw changedError();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12000);
      try {
        // The account lock is held by the caller; this auth lock also excludes login/rotation.
        await request('/v2/account', { method: 'DELETE', signal: controller.signal, expectedStatus: 204 }, snapshot.token);
        if (!stillCurrent(initial)) throw changedError();
        try { await cleanup(); } finally { transition(); }
      } finally { clearTimeout(timeout); }
    });
  };
  const confirmRecovery = body => {
    const initial = syncMeta();
    return locked(async () => {
      if (!stillCurrent(initial)) throw changedError();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12000);
      try {
        const result = await request('/v2/auth/password-recovery/confirm', {
          method: 'POST', body: JSON.stringify(body), signal: controller.signal, expectedStatus: 200
        });
        if (!stillCurrent(initial)) throw changedError();
        // Password reset revokes credentials on the server; never accept a new session here.
        transition();
        return result;
      } finally { clearTimeout(timeout); }
    });
  };
  const authenticatedRequest = async (endpoint, options, providedToken) => {
    const meta = syncMeta();
    if (tokenEpochs.get(providedToken) !== meta.epoch) throw changedError();
    const token = await ensureToken();
    if (!stillCurrent(meta)) throw changedError();
    const controller = new AbortController();
    activeRequests.add(controller);
    const signal = options?.signal ? AbortSignal.any([controller.signal, options.signal]) : controller.signal;
    const guardedOptions = { ...options, signal };
    try {
      let result;
      try { result = await request(endpoint, guardedOptions, token); }
      catch (error) {
        if (!stillCurrent(meta)) throw changedError();
        if (error.status !== 401) throw error;
        const replacement = await ensureToken(token);
        if (!stillCurrent(meta)) throw changedError();
        result = await request(endpoint, guardedOptions, replacement);
      }
      if (!stillCurrent(meta)) throw changedError();
      return result;
    } finally { activeRequests.delete(controller); }
  };
  return {
    start, restore, ensureToken, logout, deleteAccount, confirmRecovery, authenticatedRequest,
    login: (email, senha) => signIn('login', { email, senha }),
    cadastro: (nome, email, senha) => signIn('cadastro', { nome, email, senha }),
    getSnapshot: () => snapshot,
    isCurrentEpoch: epoch => stillCurrent({ epoch }),
    isStarted: () => started,
    subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); },
    dispose: () => { disposed = true; for (const controller of activeRequests) controller.abort(); activeRequests.clear(); channel?.close(); unlisten?.(); for (const done of peerWaiters) done(); listeners.clear(); }
  };
}

let manager;
export const getSessionManager = () => manager ||= createSessionManager();
