import { describe, it, expect } from 'vitest';
import { round1, fmtScore } from '../../../../src/client/components/local-models/format';

describe('round1', () => {
  it('rounds to one decimal place', () => {
    expect(round1(44.159)).toBe('44.2');
  });

  it('drops a trailing .0 when the rounded value is whole', () => {
    expect(round1(20)).toBe('20');
  });

  it('drops the trailing .0 for values that round to a whole number', () => {
    expect(round1(75.02)).toBe('75');
  });

  it('collapses long float noise to a single decimal', () => {
    // 75.65831765532494 → 75.7 (the DOM-leak case the module guards against)
    expect(round1(75.65831765532494)).toBe('75.7');
  });

  it('rounds half up at the tenths place', () => {
    expect(round1(18.15)).toBe('18.2');
  });

  it('preserves a genuine one-decimal value', () => {
    expect(round1(44.2)).toBe('44.2');
  });

  it('formats zero as "0"', () => {
    expect(round1(0)).toBe('0');
  });

  it('handles negative values (e.g. score deltas)', () => {
    expect(round1(-3.14)).toBe('-3.1');
  });
});

describe('fmtScore', () => {
  it('rounds a fractional score to a whole number', () => {
    expect(fmtScore(57.629999999999995)).toBe('58');
  });

  it('rounds down below the .5 boundary', () => {
    expect(fmtScore(71.4)).toBe('71');
  });

  it('rounds up at the .5 boundary', () => {
    expect(fmtScore(54.5)).toBe('55');
  });

  it('leaves an already-whole score unchanged', () => {
    expect(fmtScore(100)).toBe('100');
  });

  it('formats zero as "0"', () => {
    expect(fmtScore(0)).toBe('0');
  });
});
