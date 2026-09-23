import * as SecureStore from 'expo-secure-store';
import type { User } from '@/domain/types';

const REFRESH_TOKEN_KEY = 'revive.refresh_token';
const USER_KEY = 'revive.session_user';

let accessToken: string | null = null;
let generation = 0;
let writes = Promise.resolve();

const serialize = <T,>(operation: () => Promise<T>) => {
  const next = writes.then(operation, operation);
  writes = next.then(() => undefined, () => undefined);
  return next;
};

export const tokenStore = {
  getUser: async (): Promise<User | null> => {
    const stored = await SecureStore.getItemAsync(USER_KEY);
    if (!stored) return null;
    try { return JSON.parse(stored) as User; } catch { return null; }
  },
  getAccessToken: () => accessToken,
  getGeneration: () => generation,
  isCurrent: (expected: number) => generation === expected,
  getRefreshToken: () => SecureStore.getItemAsync(REFRESH_TOKEN_KEY),
  beginSessionChange: () => {
    generation += 1;
    accessToken = null;
    return generation;
  },
  saveSession: (expected: number, session: { access_token: string; refresh_token: string; usuario: User }) =>
    serialize(async () => {
      if (generation !== expected) return false;
      await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, session.refresh_token, {
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      });
      if (generation !== expected) return false;
      await SecureStore.setItemAsync(USER_KEY, JSON.stringify(session.usuario), {
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      });
      if (generation !== expected) return false;
      accessToken = session.access_token;
      return true;
    }),
  clear: async (expected?: number) => {
    if (expected !== undefined && generation !== expected) return false;
    generation += 1;
    const clearedGeneration = generation;
    accessToken = null;
    await serialize(async () => {
      if (generation !== clearedGeneration) return;
      await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
      if (generation !== clearedGeneration) return;
      await SecureStore.deleteItemAsync(USER_KEY);
    });
    return generation === clearedGeneration;
  },
};
