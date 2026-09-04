import { describe, it, expect } from 'vitest';
import { createUlidFactory, isUlid, ULID_LENGTH } from './ulid';

describe('waypoint/ulid', () => {
  it('mints 26-char Crockford-base32 ULIDs', () => {
    const ulid = createUlidFactory()();
    expect(ulid).toHaveLength(ULID_LENGTH);
    expect(isUlid(ulid)).toBe(true);
  });

  it('rejects non-ULID values', () => {
    expect(isUlid(undefined)).toBe(false);
    expect(isUlid('')).toBe(false);
    expect(isUlid('not-a-ulid')).toBe(false);
    expect(isUlid('I'.repeat(26))).toBe(false); // I is not in the alphabet
  });

  it('is monotonic within one millisecond (same clock reading)', () => {
    const mint = createUlidFactory({ now: () => 1_700_000_000_000 });
    const a = mint();
    const b = mint();
    const c = mint();
    expect(a < b).toBe(true);
    expect(b < c).toBe(true);
  });

  it('orders lexicographically by creation time across milliseconds', () => {
    let t = 1_700_000_000_000;
    const mint = createUlidFactory({ now: () => t });
    const first = mint();
    t += 5;
    const second = mint();
    expect(first < second).toBe(true);
  });

  it('is deterministic under injected randomness', () => {
    const mint = createUlidFactory({
      now: () => 0,
      random: (bytes) => bytes.fill(0),
    });
    expect(mint()).toBe('0000000000' + '0'.repeat(16));
  });

  it('recovers from random-suffix overflow inside one millisecond', () => {
    const mint = createUlidFactory({
      now: () => 42,
      // All-0xff randomness maps to the top alphabet char, so the first id's
      // suffix is ZZZZ… and the same-ms increment overflows.
      random: (bytes) => bytes.fill(0xff),
    });
    const first = mint();
    const second = mint();
    expect(isUlid(first)).toBe(true);
    expect(isUlid(second)).toBe(true);
  });
});
