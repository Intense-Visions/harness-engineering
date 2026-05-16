import { describe, expect, it } from 'vitest';
import { verify } from '../src/signer.js';
import { TEST_SECRET, signBody } from './fixtures.js';

describe('signer.verify', () => {
  const body = Buffer.from('{"id":"evt_1","type":"maintenance.completed"}');

  it('accepts a valid signature', () => {
    const sig = signBody(TEST_SECRET, body);
    expect(verify(TEST_SECRET, body, sig)).toBe(true);
  });

  it('rejects a signature computed with the wrong secret', () => {
    const sig = signBody('wrong-secret-32-bytes-of-entropy!', body);
    expect(verify(TEST_SECRET, body, sig)).toBe(false);
  });

  it('rejects when the header is undefined', () => {
    expect(verify(TEST_SECRET, body, undefined)).toBe(false);
  });

  it('rejects when the header is malformed (no sha256= prefix)', () => {
    expect(verify(TEST_SECRET, body, 'deadbeef')).toBe(false);
  });

  it('rejects on length mismatch without throwing', () => {
    // shorter than the expected 71 chars; timingSafeEqual would throw,
    // verify() must catch the length guard and return false.
    expect(verify(TEST_SECRET, body, 'sha256=abc')).toBe(false);
  });

  it('rejects when the rawBody is mutated by one byte', () => {
    const sig = signBody(TEST_SECRET, body);
    const tampered = Buffer.from(body);
    tampered[0] = tampered[0] ^ 0x01;
    expect(verify(TEST_SECRET, tampered, sig)).toBe(false);
  });
});
