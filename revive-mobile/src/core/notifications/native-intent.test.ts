import { describe, expect, it } from '@jest/globals';
import { sanitizeNativeIntentPath } from './native-intent';

describe('sanitizeNativeIntentPath', () => {
  it('keeps known app routes and removes query and fragment data', () => {
    expect(sanitizeNativeIntentPath('revive:///habits?filter=%E0%A4%A#today')).toBe('/habits');
    expect(sanitizeNativeIntentPath('/goals/new?next=unknown')).toBe('/goals/new');
  });

  it('rejects unknown routes, other schemes, hosts, and malformed path escapes', () => {
    expect(sanitizeNativeIntentPath('/admin')).toBe('/');
    expect(sanitizeNativeIntentPath('https://example.invalid/habits')).toBe('/');
    expect(sanitizeNativeIntentPath('revive://attacker/habits')).toBe('/');
    expect(sanitizeNativeIntentPath('/habits/%E0%A4%A')).toBe('/');
  });

  it('rejects an overlong hostile link before it reaches route parsing', () => {
    const hostileUrl = `revive:///habits?value=${'%E0%A4%A'.repeat(300)}`;
    expect(sanitizeNativeIntentPath(hostileUrl)).toBe('/');
  });
});
