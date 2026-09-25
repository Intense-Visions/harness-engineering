import type { SprtConfig } from '@harness-engineering/types';
import { describe, expect, it } from 'vitest';

import { validateSprtConfig } from '../src/sprt/config';
import { InvalidSprtConfigError } from '../src/sprt/errors';

/** SC8 parameters; also the textbook fixture: ln(p1 / p0) = ln 1.4, ln((1 − p1) / (1 − p0)) = ln 0.6. */
const base: SprtConfig = { alpha: 0.05, beta: 0.05, p0: 0.5, p1: 0.7 };

describe('InvalidSprtConfigError', () => {
  it('is a distinguishable Error subclass carrying the one failed rule', () => {
    const error = new InvalidSprtConfigError('alpha must be in (0, 1), got 1');
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('InvalidSprtConfigError');
    expect(error.message).toBe('invalid SprtConfig: alpha must be in (0, 1), got 1');
  });
});

describe('validateSprtConfig', () => {
  it('returns a copy of a valid config, with and without maxN', () => {
    const withMax: SprtConfig = { ...base, maxN: 200 };
    const resolved = validateSprtConfig(withMax);
    expect(resolved).toEqual(withMax);
    expect(resolved).not.toBe(withMax);
    expect(validateSprtConfig(base)).toEqual(base);
  });

  it.each([
    ['alpha zero', { ...base, alpha: 0 }, /alpha must be in \(0, 1\)/],
    ['alpha one', { ...base, alpha: 1 }, /alpha must be in \(0, 1\)/],
    ['alpha NaN', { ...base, alpha: Number.NaN }, /alpha must be in/],
    ['beta negative', { ...base, beta: -0.05 }, /beta must be in \(0, 1\)/],
    ['alpha + beta not below 1', { ...base, alpha: 0.5, beta: 0.5 }, /alpha \+ beta must be < 1/],
    ['p0 zero', { ...base, p0: 0 }, /p0 must be in \(0, 1\)/],
    ['p1 one', { ...base, p1: 1 }, /p1 must be in \(0, 1\)/],
    ['p0 equal to p1', { ...base, p1: 0.5 }, /p0 and p1 must differ/],
    ['maxN zero', { ...base, maxN: 0 }, /maxN must be a positive integer/],
    ['maxN fractional', { ...base, maxN: 2.5 }, /maxN must be a positive integer/],
    ['maxN NaN', { ...base, maxN: Number.NaN }, /maxN must be a positive integer/],
  ] as const)('rejects %s with InvalidSprtConfigError', (_name, config, message) => {
    expect(() => validateSprtConfig(config)).toThrow(InvalidSprtConfigError);
    expect(() => validateSprtConfig(config)).toThrow(message);
  });

  it('reports the first failed rule only, in declaration order', () => {
    expect(() => validateSprtConfig({ ...base, alpha: 2, p0: 0.7 })).toThrow(
      /^invalid SprtConfig: alpha/
    );
  });
});
