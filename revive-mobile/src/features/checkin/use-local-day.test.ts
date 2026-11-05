import { AppState } from 'react-native';
import { act, renderHook } from '@testing-library/react-native';
import { afterEach, beforeEach, expect, it, jest } from '@jest/globals';
import { useLocalDay } from './use-local-day';

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  jest.setSystemTime(new Date(2026, 9, 5, 23, 59, 59));
  jest.spyOn(AppState, 'addEventListener').mockReturnValue({ remove: jest.fn() });
});
afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });

it('updates the local day across midnight while mounted and cleans up the listener', async () => {
  const remove = jest.fn();
  jest.mocked(AppState.addEventListener).mockReturnValue({ remove });
  const hook = await renderHook(() => useLocalDay());
  expect(hook.result.current).toBe('2026-10-05');
  await act(async () => { jest.advanceTimersByTime(30_000); });
  expect(hook.result.current).toBe('2026-10-06');
  await hook.unmount();
  expect(remove).toHaveBeenCalledTimes(1);
});

it('refreshes immediately after returning to the foreground on a different day', async () => {
  const hook = await renderHook(() => useLocalDay());
  const onChange = jest.mocked(AppState.addEventListener).mock.calls[0]![1];
  jest.setSystemTime(new Date(2026, 9, 6, 0, 0, 1));
  await act(async () => { onChange('active'); });
  expect(hook.result.current).toBe('2026-10-06');
});

it('uses the selected calendar zone immediately and across its midnight', async () => {
  jest.setSystemTime(new Date('2026-10-05T10:59:59Z'));
  const hook = await renderHook<string, { timezone: string }>(({ timezone }) => useLocalDay(timezone), { initialProps: { timezone: 'UTC' } });
  expect(hook.result.current).toBe('2026-10-05');
  await hook.rerender({ timezone: 'Pacific/Auckland' });
  expect(hook.result.current).toBe('2026-10-05');
  await act(async () => { jest.advanceTimersByTime(30_000); });
  expect(hook.result.current).toBe('2026-10-06');
});
