import { afterEach, describe, expect, it } from 'vitest';
import { createSessionManager } from './session-manager';

const managers = [];
afterEach(() => { for (const manager of managers.splice(0)) manager.dispose(); });

function harness() {
  const data = new Map([['revive_token', 'old-legacy-token']]), channels = new Set(), storageListeners = new Set();
  let dropSession = false;
  let tail = Promise.resolve(), refreshes = 0, cookie = true, offline = false, currentToken, user = 'account-a', generation = 0;
  const locks = { request: (_name, task) => { const next = tail.then(task); tail = next.catch(() => {}); return next; } };
  const storage = { getItem: key => data.get(key) ?? null, removeItem: key => data.delete(key), setItem: (key, value) => {
    data.set(key, value); for (const listener of storageListeners) queueMicrotask(listener);
  } };
  const request = async (path, options, token) => {
    if (offline) throw Object.assign(new Error('offline'), { code: 'REDE_INDISPONIVEL' });
    if (path.endsWith('/logout')) { cookie = false; currentToken = null; return {}; }
    if (path.endsWith('/login') || path.endsWith('/cadastro')) { user = JSON.parse(options.body).email; cookie = true; }
    if (path.endsWith('/refresh')) {
      refreshes++;
      if (!cookie) throw Object.assign(new Error('revoked'), { status: 401 });
    }
    if (path.includes('/web-auth/')) {
      currentToken = 'access-' + ++generation;
      return { access_token: currentToken, expires_in: 900, usuario: { id: user, email: user + '@example.invalid' } };
    }
    if (token !== currentToken) throw Object.assign(new Error('old access'), { status: 401 });
    return { user };
  };
  const tab = (overrides = {}) => {
    const manager = createSessionManager({
      locks, storage, request, ...overrides,
      listenStorage: callback => { storageListeners.add(callback); return () => storageListeners.delete(callback); },
      makeChannel: () => {
        const channel = { onmessage: null, postMessage: message => {
          if (dropSession && message.kind === 'session') { dropSession = false; return; }
          for (const peer of channels) if (peer !== channel) queueMicrotask(() => peer.onmessage?.({ data: structuredClone(message) }));
        }, close: () => channels.delete(channel) };
        channels.add(channel); return channel;
      }
    });
    managers.push(manager); return manager;
  };
  return { tab, data, request, dropNextSession: () => { dropSession = true; }, refreshes: () => refreshes, offline: value => { offline = value; }, revoke: () => { cookie = false; currentToken = null; } };
}

describe('web session generations and tab coordination', () => {
  it('restores two tabs with one rotation, keeps tokens in memory and removes legacy storage', async () => {
    const h = harness(), a = h.tab(), b = h.tab();
    await Promise.all([a.start(), b.start()]);
    expect(h.refreshes()).toBe(1);
    expect(a.getSnapshot().token).toBe(b.getSnapshot().token);
    expect(a.getSnapshot().user.id).toBe('account-a');
    expect(h.data.has('revive_token')).toBe(false);
    expect([...h.data.keys()]).toEqual(['revive_auth_metadata']);
    expect([...h.data.values()].join('')).not.toContain('access-');
    expect([...h.data.values()].join('')).not.toContain('account-a');
  });
  it('recovers a missed login announcement after storage metadata becomes visible', async () => {
    const h = harness(), a = h.tab(), b = h.tab();
    await Promise.all([a.start(), b.start()]);
    const before = h.refreshes();
    h.dropNextSession();
    await a.login('account-b', 'Synthetic!1');
    await expect.poll(() => b.getSnapshot().user?.id).toBe('account-b');
    expect(h.refreshes()).toBe(before);
    expect(b.getSnapshot().token).toBe(a.getSnapshot().token);
  });
  it('coalesces concurrent request refreshes rather than replaying a rotated cookie', async () => {
    const h = harness(), a = h.tab(), b = h.tab();
    await Promise.all([a.start(), b.start()]);
    const failed = a.getSnapshot().token;
    await Promise.all([a.ensureToken(failed), a.ensureToken(failed), b.ensureToken(failed)]);
    expect(h.refreshes()).toBe(2);
    expect(a.getSnapshot().token).toBe(b.getSnapshot().token);
    expect(a.getSnapshot().user).not.toBeNull();
  });
  it('broadcasts logout and rejects an old tab token', async () => {
    const h = harness(), a = h.tab(), b = h.tab();
    await Promise.all([a.start(), b.start()]);
    const old = b.getSnapshot().token;
    await a.logout();
    await Promise.resolve();
    expect(a.getSnapshot().token).toBe('');
    expect(b.getSnapshot().token).toBe('');
    await expect(b.authenticatedRequest('/me', {}, old)).rejects.toMatchObject({ code: 'SESSAO_ALTERADA' });
  });
  it('does not let an A logout queued behind a B login revoke B', async () => {
    const h = harness();
    let release, entered, block = false;
    const gate = new Promise(done => { release = done; });
    const arrived = new Promise(done => { entered = done; });
    const a = h.tab(), b = h.tab({ request: async (path, options, token) => {
      if (block && path.endsWith('/logout')) { block = false; entered(); await gate; }
      return h.request(path, options, token);
    } });
    await Promise.all([a.start(), b.start()]);
    block = true;
    const login = b.login('account-b', 'Synthetic!1');
    await arrived;
    const oldLogout = a.logout().catch(error => error);
    release(); await login;
    expect(await oldLogout).toMatchObject({ code: 'SESSAO_ALTERADA' });
    expect(b.getSnapshot().user.id).toBe('account-b');
    await expect(b.authenticatedRequest('/me', {}, b.getSnapshot().token)).resolves.toEqual({ user: 'account-b' });
  });

  it('does not apply a delayed account-A result after login as B', async () => {
    const h = harness();
    let resolve;
    const a = h.tab({ request: (path, options, token) => path === '/slow'
      ? new Promise(done => { resolve = done; }) : h.request(path, options, token) });
    const b = h.tab();
    await Promise.all([a.start(), b.start()]);
    const pending = a.authenticatedRequest('/slow', {}, a.getSnapshot().token).catch(error => error);
    while (!resolve) await new Promise(done => setTimeout(done, 1));
    await b.login('account-b', 'Synthetic!1');
    resolve({ private: 'account-a' });
    expect(await pending).toMatchObject({ code: 'SESSAO_ALTERADA' });
    expect(a.getSnapshot().user.id).toBe('account-b');
  });
  it('keeps a transient refresh/network failure distinct from invalid credentials', async () => {
    const h = harness(), a = h.tab();
    await a.start();
    const before = a.getSnapshot();
    h.offline(true);
    await expect(a.ensureToken(before.token)).rejects.toMatchObject({ code: 'REDE_INDISPONIVEL' });
    expect(a.getSnapshot().token).toBe(before.token);
    expect(a.getSnapshot().authError.code).toBe('REDE_INDISPONIVEL');
    h.offline(false); await a.ensureToken(before.token);
    expect(a.getSnapshot().authError).toBeNull();
  });
  it('keeps the session when logout was not confirmed', async () => {
    const h = harness(), a = h.tab();
    await a.start(); const token = a.getSnapshot().token;
    h.offline(true);
    await expect(a.logout()).rejects.toThrow('offline');
    expect(a.getSnapshot().token).toBe(token);
  });
  it('invalidates all tabs after server revocation or password reset', async () => {
    const h = harness(), a = h.tab(), b = h.tab();
    await Promise.all([a.start(), b.start()]);
    h.revoke();
    await expect(a.authenticatedRequest('/me', {}, a.getSnapshot().token)).rejects.toMatchObject({ status: 401 });
    await Promise.resolve();
    expect(a.getSnapshot().user).toBeNull();
    expect(b.getSnapshot().user).toBeNull();
  });
  it('restores after an offline startup without calling it a bad login', async () => {
    const h = harness(), a = h.tab(); h.offline(true);
    await a.start();
    expect(a.getSnapshot()).toMatchObject({ authLoading: false, user: null, authError: { code: 'REDE_INDISPONIVEL' } });
    h.offline(false); await a.restore();
    expect(a.getSnapshot().user.id).toBe('account-a');
  });
  it('fails closed if safe browser tab locking is unavailable', async () => {
    const h = harness(), a = h.tab({ locks: {} });
    await a.start();
    expect(a.getSnapshot()).toMatchObject({ token: '', authLoading: false, authError: { code: 'COORDENACAO_INDISPONIVEL' } });
    expect(h.refreshes()).toBe(0);
  });
});
