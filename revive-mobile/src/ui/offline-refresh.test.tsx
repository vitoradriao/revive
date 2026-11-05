import React from 'react';
import { expect, it, jest } from '@jest/globals';
import { act, render, renderHook, screen } from '@testing-library/react-native';
import { OfflineNotice, usePullToRefresh } from './components';

jest.mock('react-native-safe-area-context', () => { const { View } = jest.requireActual<typeof import('react-native')>('react-native'); return { SafeAreaView: View }; });
jest.mock('lucide-react-native', () => ({ Eye: () => null, EyeOff: () => null }));

it('tells the person when they are reading the device copy', async () => {
  await render(<OfflineNotice data={{ from_cache: true, server_time: '2026-11-05T15:30:00.000Z' }} />);
  expect(screen.getByRole('alert').props.children.join('')).toMatch(/Sem conexão com o servidor\. Você está vendo os dados salvos no aparelho em .+\./);
});

it('stays hidden for fresh server data', async () => {
  await render(<OfflineNotice data={{ server_time: '2026-11-05T15:30:00.000Z' }} />);
  expect(screen.queryByRole('alert')).toBeNull();
});

it('spins only while the pull gesture refetch runs', async () => {
  let finish: () => void = () => undefined;
  const refetch = jest.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
  const { result } = await renderHook(() => usePullToRefresh(refetch));
  expect(result.current.refreshing).toBe(false);
  await act(async () => { result.current.onRefresh(); });
  expect(result.current.refreshing).toBe(true);
  expect(refetch).toHaveBeenCalledTimes(1);
  await act(async () => { finish(); });
  expect(result.current.refreshing).toBe(false);
});
