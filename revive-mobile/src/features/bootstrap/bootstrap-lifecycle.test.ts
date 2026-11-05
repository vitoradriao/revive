import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { queryClient } from '@/core/query/client';
import { retainBootstrapLifecycle } from './use-bootstrap';

type NetListener = (state: { isConnected: boolean | null }) => void;
type AppListener = (state: string) => void;

const netListeners: NetListener[] = [];
const appListeners: AppListener[] = [];
const removeApp = jest.fn();
const unsubscribeNet = jest.fn();

jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: { addEventListener: jest.fn() },
}));
jest.mock('@/core/api/repositories', () => ({ reviveApi: {} }));
jest.mock('@/core/storage/database', () => ({}));
jest.mock('@/core/sync/sync-engine', () => ({}));
jest.mock('@/features/auth/session-context', () => ({ useSession: () => ({ user: null }) }));

beforeEach(() => {
  netListeners.length = 0;
  appListeners.length = 0;
  jest.clearAllMocks();
  jest.mocked(NetInfo.addEventListener).mockImplementation(((listener: NetListener) => {
    netListeners.push(listener);
    return unsubscribeNet;
  }) as never);
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((_type: string, listener: AppListener) => {
    appListeners.push(listener);
    return { remove: removeApp };
  }) as never);
  jest.spyOn(queryClient, 'refetchQueries').mockResolvedValue(undefined);
});

describe('bootstrap lifecycle', () => {
  test('shares one pair of listeners across every screen using the bootstrap', () => {
    const [first, second, third] = [retainBootstrapLifecycle(), retainBootstrapLifecycle(), retainBootstrapLifecycle()];

    expect(NetInfo.addEventListener).toHaveBeenCalledTimes(1);
    expect(AppState.addEventListener).toHaveBeenCalledTimes(1);

    const [onNetwork] = netListeners;
    const [onAppState] = appListeners;
    onNetwork!({ isConnected: true });
    onAppState!('active');
    onAppState!('background');
    onNetwork!({ isConnected: false });

    expect(queryClient.refetchQueries).toHaveBeenCalledTimes(2);
    expect(queryClient.refetchQueries).toHaveBeenCalledWith({ queryKey: ['bootstrap'], type: 'active' }, { cancelRefetch: false });

    first();
    first();
    second();
    expect(unsubscribeNet).not.toHaveBeenCalled();
    third();
    expect(unsubscribeNet).toHaveBeenCalledTimes(1);
    expect(removeApp).toHaveBeenCalledTimes(1);
  });

  test('subscribes again after every screen released it', () => {
    retainBootstrapLifecycle()();
    retainBootstrapLifecycle()();
    expect(NetInfo.addEventListener).toHaveBeenCalledTimes(2);
  });
});
