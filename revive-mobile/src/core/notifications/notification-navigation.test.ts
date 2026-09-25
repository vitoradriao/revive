import { describe, expect, it } from '@jest/globals';
import { isAllowedNotificationPath } from './notification-path';

describe('isAllowedNotificationPath', () => {
  it('keeps the existing notification destination allowlist', () => {
    expect(isAllowedNotificationPath('/(app)/(tabs)')).toBe(true);
    expect(isAllowedNotificationPath('/(app)/(tabs)/habits')).toBe(true);
    expect(isAllowedNotificationPath('/(app)/(tabs)/goals')).toBe(true);
    expect(isAllowedNotificationPath('/admin')).toBe(false);
  });

  it('rejects non-string and overlong notification paths', () => {
    expect(isAllowedNotificationPath(undefined)).toBe(false);
    expect(isAllowedNotificationPath('x'.repeat(129))).toBe(false);
  });
});
