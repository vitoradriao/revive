import { describe, expect, it } from '@jest/globals';
import { parse } from 'query-string';

describe('query-string decoder override', () => {
  it('parses malformed percent-encoded input within the accepted link limit', () => {
    const malformedValue = '%E0%A4%A'.repeat(160);
    expect(parse(`value=${malformedValue}`).value).toBe(malformedValue);
  });
});
