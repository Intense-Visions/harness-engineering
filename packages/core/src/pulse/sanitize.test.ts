import { describe, it, expect } from 'vitest';
import {
  PII_FIELD_DENYLIST,
  PII_LINE_RE,
  PII_TOKENS,
  ALLOWED_FIELD_KEYS,
  isSanitizedResult,
  assertSanitized,
} from './sanitize';

describe('PII boundary', () => {
  it('denylist matches all forbidden field names', () => {
    for (const f of [
      'email',
      'user_id',
      'session_id',
      'ip',
      'name',
      'phone',
      'address',
      'message',
      'content',
      'payload',
    ]) {
      expect(PII_FIELD_DENYLIST.test(f)).toBe(true);
    }
    PII_FIELD_DENYLIST.lastIndex = 0;
  });

  it('denylist does not match allowlist fields', () => {
    for (const f of ALLOWED_FIELD_KEYS) {
      expect(PII_FIELD_DENYLIST.test(f)).toBe(false);
    }
  });

  it('isSanitizedResult accepts a clean result', () => {
    expect(isSanitizedResult({ fields: { count: 5 }, distributions: {} })).toBe(true);
  });

  it('isSanitizedResult rejects non-allowlisted fields', () => {
    expect(isSanitizedResult({ fields: { email: 'a@b.com' } as never, distributions: {} })).toBe(
      false
    );
  });

  it('assertSanitized throws on PII fields', () => {
    expect(() =>
      assertSanitized({ fields: { user_id: 'x' } as never, distributions: {} })
    ).toThrow();
  });

  it('PII_FIELD_DENYLIST and PII_LINE_RE both match every shared PII_TOKENS entry', () => {
    PII_TOKENS.forEach((token) => {
      // Reset lastIndex defensively — these regexes are not /g but be explicit.
      expect(token).toMatch(PII_FIELD_DENYLIST);
      expect(`prefix ${token} suffix`).toMatch(PII_LINE_RE);
    });
  });
});
