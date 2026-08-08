import { describe, it, expect } from 'vitest';
import { generateUlid, isValidUlid, ulidTime } from '../../src/identity/ulid';

describe('generateUlid', () => {
  it('returns a 26-char Crockford-base32 string', () => {
    const ulid = generateUlid();
    expect(ulid).toHaveLength(26);
    expect(isValidUlid(ulid)).toBe(true);
  });

  it('is monotonic within a millisecond (same seedTime sorts in creation order)', () => {
    const t = 1_700_000_000_000;
    const a = generateUlid(t);
    const b = generateUlid(t);
    expect(a).not.toBe(b);
    expect(a < b).toBe(true);
  });

  it('encodes the timestamp so later times sort after earlier times', () => {
    const early = generateUlid(1_000);
    const late = generateUlid(2_000);
    expect(early < late).toBe(true);
  });
});

describe('isValidUlid', () => {
  it('accepts a well-formed ULID', () => {
    expect(isValidUlid(generateUlid())).toBe(true);
  });
  it('rejects malformed input', () => {
    expect(isValidUlid('')).toBe(false);
    expect(isValidUlid('too-short')).toBe(false);
    expect(isValidUlid('I'.repeat(26))).toBe(false); // I excluded from Crockford base32
    expect(isValidUlid('l'.repeat(26))).toBe(false); // lowercase / L excluded
    expect(isValidUlid('!'.repeat(26))).toBe(false);
  });
});

describe('ulidTime', () => {
  it('round-trips the timestamp', () => {
    const t = 1_700_000_000_000;
    expect(ulidTime(generateUlid(t))).toBe(t);
  });
});
