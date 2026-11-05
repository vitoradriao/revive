import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createOfflineClient } from '../offline/client';

let clients;
beforeEach(() => {
  localStorage.clear(); clients = [];
  vi.spyOn(window, 'addEventListener').mockImplementation(() => {});
  vi.spyOn(globalThis, 'setInterval').mockImplementation(() => 0);
  vi.stubGlobal('navigator', { onLine: true, locks: { request: (_name, task) => Promise.resolve().then(task) } });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
async function fixture({ openFails = false, confirmedCleanup = false } = {}) {
  let state = { user: { id: 'account-a' }, token: '', epoch: 'generation-a', authLoading: false };
  let changed, durableEpoch = state.epoch;
  const session = {
    isCurrentEpoch: epoch => epoch === durableEpoch, getSnapshot: () => state, subscribe: listener => { changed = listener; },
    logout: vi.fn(async cleanup => { try { await cleanup?.(); } finally { state = { user: null, token: '', epoch: 'out', authLoading: false }; durableEpoch = state.epoch; changed?.(); } }),
    deleteAccount: vi.fn(async cleanup => { try { await cleanup?.(); } finally { state = { user: null, token: '', epoch: 'deleted', authLoading: false }; durableEpoch = state.epoch; changed?.(); } })
  };
  let queue = [{ id: 'intent-a' }];
  const store = { userId: 'account-a', close: vi.fn(),
    recoverInterrupted: async () => {}, getQueue: vi.fn(async () => queue), getReceipts: async () => [], getSnapshot: async () => null,
    clearAccount: vi.fn(async () => { queue = []; }) };
  localStorage.setItem('revive_theme', 'dark');
  localStorage.setItem('revive_offline_account', JSON.stringify({ userId: 'account-a', epoch: 'generation-a' }));
  if (confirmedCleanup) localStorage.setItem('revive_confirmed_cleanup:account-a', 'confirmed');
  const client = createOfflineClient({ session, storage: localStorage, open: async () => {
    if (openFails) throw new Error('storage unavailable'); return store;
  } });
  client.start(); clients.push(client);
  await vi.waitFor(() => expect(client.getSnapshot().loading).toBe(false));
  return { client, session, store, queue: () => queue, revokeWithoutNotice: () => { durableEpoch = 'out'; }, changeAccount: () => { state = { user: { id: 'account-b' }, token: '', epoch: 'generation-b', authLoading: false }; durableEpoch = state.epoch; changed(); } };
}
describe('saída e exclusão com fila local', () => {
  it('a saída com pendência exige escolha e conserva preferências', async () => {
    const h = await fixture();
    expect(await h.client.logout()).toBe(false);
    expect(h.session.logout).not.toHaveBeenCalled(); expect(h.store.clearAccount).not.toHaveBeenCalled();
    expect(localStorage.getItem('revive_theme')).toBe('dark'); expect(h.queue()).toHaveLength(1);
  });
  it('descarta somente depois da confirmação remota de saída', async () => {
    const h = await fixture();
    h.session.logout.mockRejectedValueOnce(Object.assign(new Error('timeout'), { outcomeUnknown: true }));
    await expect(h.client.logout('discard')).rejects.toThrow('timeout');
    expect(h.store.clearAccount).not.toHaveBeenCalled(); expect(h.queue()).toHaveLength(1);
    expect(localStorage.getItem('revive_theme')).toBe('dark');
    expect(await h.client.logout('discard')).toBe(true);
    expect(h.store.clearAccount).toHaveBeenCalledWith({ discardPending: true });
    expect(localStorage.getItem('revive_theme')).toBeNull(); expect(localStorage.getItem('revive_offline_account')).toBeNull();
  });
  it('exclusão falha preserva fila e sucesso limpa todos os dados locais', async () => {
    const h = await fixture();
    h.session.deleteAccount.mockRejectedValueOnce(new Error('failed'));
    await expect(h.client.deleteAccount('account-a:generation-a')).rejects.toThrow('failed');
    expect(h.store.clearAccount).not.toHaveBeenCalled(); expect(h.queue()).toHaveLength(1);
    expect(localStorage.getItem('revive_confirmed_cleanup:account-a')).toBeNull();
    expect(localStorage.getItem('revive_theme')).toBe('dark');
    expect(await h.client.deleteAccount('account-a:generation-a')).toBe(true);
    expect(h.store.clearAccount).toHaveBeenCalledWith({ discardPending: true }); expect(h.queue()).toHaveLength(0);
    expect(localStorage.getItem('revive_theme')).toBeNull();
  });
  it('não exclui a nova conta usando a chave antiga', async () => {
    const h = await fixture(); h.changeAccount();
    await expect(h.client.deleteAccount('account-a:generation-a')).rejects.toMatchObject({ code: 'SESSAO_ALTERADA' });
    expect(h.session.deleteAccount).not.toHaveBeenCalled(); expect(h.store.clearAccount).not.toHaveBeenCalled();
  });
  it('retoma limpeza confirmada após reabertura, sem reenviar exclusão ou saída', async () => {
    const h = await fixture({ confirmedCleanup: true });
    expect(h.store.clearAccount).toHaveBeenCalledWith({ discardPending: true });
    expect(h.queue()).toHaveLength(0);
    expect(h.session.deleteAccount).not.toHaveBeenCalled(); expect(h.session.logout).not.toHaveBeenCalled();
    expect(localStorage.getItem('revive_confirmed_cleanup:account-a')).toBeNull();
  });
  it('limpeza interrompida não expõe fila antiga nem remove preferências da conta B', async () => {
    const h = await fixture(); h.store.clearAccount.mockRejectedValue(new Error('storage unavailable'));
    await expect(h.client.deleteAccount('account-a:generation-a')).rejects.toThrow('storage unavailable');
    h.changeAccount(); localStorage.setItem('revive_theme', 'dark');
    await vi.waitFor(() => expect(h.client.getSnapshot().accountKey).toBe('account-b:generation-b'));
    expect(h.client.getSnapshot().queue).toEqual([]); expect(h.client.getSnapshot().snapshot).toBeNull();
    expect(h.queue()).toHaveLength(1); expect(localStorage.getItem('revive_theme')).toBe('dark');
    expect(localStorage.getItem('revive_confirmed_cleanup:account-a')).toBe('confirmed');
  });
  it('recusa trabalho antigo mesmo antes da notificação de saída chegar à aba', async () => {
    const h = await fixture(); h.revokeWithoutNotice();
    await expect(h.client.deleteAccount('account-a:generation-a')).rejects.toMatchObject({ code: 'SESSAO_ALTERADA' });
    await expect(h.client.enqueue('record.create', { vicio_id: 'synthetic' })).rejects.toMatchObject({ code: 'SESSAO_ALTERADA' });
    expect(h.session.deleteAccount).not.toHaveBeenCalled(); expect(h.store.clearAccount).not.toHaveBeenCalled();
    expect(h.queue()).toHaveLength(1);
  });
  it('não encerra silenciosamente quando não consegue verificar as pendências', async () => {
    const h = await fixture({ openFails: true });
    await expect(h.client.logout()).rejects.toThrow('Não foi possível verificar');
    expect(h.session.logout).not.toHaveBeenCalled(); expect(localStorage.getItem('revive_theme')).toBe('dark');
  });
});
