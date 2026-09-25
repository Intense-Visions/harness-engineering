import type { SprtConfig } from '@harness-engineering/types';
import { describe, expect, it } from 'vitest';

import { validateSprtConfig } from '../src/sprt/config';
import { InvalidSprtConfigError } from '../src/sprt/errors';
import { createSprt, waldBounds } from '../src/sprt/sprt';

/** SC8 parameters; also the textbook fixture: ln(p1 / p0) = ln 1.4, ln((1 − p1) / (1 − p0)) = ln 0.6. */
const base: SprtConfig = { alpha: 0.05, beta: 0.05, p0: 0.5, p1: 0.7 };
const LN_19 = Math.log(19); // A = ln(0.95 / 0.05); B = −A when alpha = beta
const SUCCESS = Math.log(1.4); // 0.33647223662121284 per success
const FAILURE = Math.log(0.6); // −0.5108256237659905 per failure

function feed(config: SprtConfig, xs: readonly (0 | 1 | boolean)[]) {
  const test = createSprt(config);
  const verdicts = xs.map((x) => test.observe(x));
  return { test, verdicts };
}

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

describe('waldBounds', () => {
  it('computes upper A = ln((1 − beta) / alpha) and lower B = ln(beta / (1 − alpha))', () => {
    const bounds = waldBounds(base);
    expect(bounds.upper).toBeCloseTo(LN_19, 12); // 2.9444389791664403
    expect(bounds.lower).toBeCloseTo(-LN_19, 12);
    const skewed = waldBounds({ alpha: 0.01, beta: 0.2 });
    expect(skewed.upper).toBeCloseTo(Math.log(0.8 / 0.01), 12); // 4.382
    expect(skewed.lower).toBeCloseTo(Math.log(0.2 / 0.99), 12); // −1.599
  });
});

describe('createSprt: Bernoulli LLR and Wald verdicts', () => {
  it('rejects an invalid config at construction', () => {
    expect(() => createSprt({ ...base, p1: 0.5 })).toThrow(InvalidSprtConfigError);
  });

  it('starts at llr 0, n 0, continue', () => {
    expect(createSprt(base).state).toEqual({ llr: 0, n: 0, verdict: 'continue' });
  });

  it('adds ln(p1 / p0) per success and ln((1 − p1) / (1 − p0)) per failure (hand-computed)', () => {
    const { test, verdicts } = feed(base, [1, 1, 1, 1, 0]);
    expect(verdicts).toEqual(['continue', 'continue', 'continue', 'continue', 'continue']);
    expect(test.state.n).toBe(5);
    expect(test.state.llr).toBeCloseTo(0.8350633227188609, 12); // 4·ln 1.4 + ln 0.6
    expect(test.state.llr).toBeCloseTo(4 * SUCCESS + FAILURE, 12);
  });

  it('accepts true / false as 1 / 0', () => {
    const fromBooleans = feed(base, [true, false, true]).test.state;
    const fromNumbers = feed(base, [1, 0, 1]).test.state;
    expect(fromBooleans).toEqual(fromNumbers);
    expect(fromBooleans.llr).toBeCloseTo(2 * SUCCESS + FAILURE, 12); // 0.16211884947643518
  });

  it('crosses A on the 9th consecutive success (8·ln 1.4 = 2.69 < ln 19 = 2.94 ≤ 9·ln 1.4 = 3.03)', () => {
    const { test, verdicts } = feed(base, [1, 1, 1, 1, 1, 1, 1, 1, 1]);
    expect(verdicts.slice(0, 8).every((v) => v === 'continue')).toBe(true);
    expect(verdicts[8]).toBe('reject');
    expect(test.state.n).toBe(9);
    expect(test.state.verdict).toBe('reject');
    expect(test.state.llr).toBeCloseTo(9 * SUCCESS, 12);
  });

  it('crosses B on the 6th consecutive failure (5·ln 0.6 = −2.55 > −ln 19 ≥ 6·ln 0.6 = −3.06)', () => {
    const { test, verdicts } = feed(base, [0, 0, 0, 0, 0, 0]);
    expect(verdicts).toEqual([
      'continue',
      'continue',
      'continue',
      'continue',
      'continue',
      'accept',
    ]);
    expect(test.state.n).toBe(6);
    expect(test.state.llr).toBeCloseTo(6 * FAILURE, 12);
  });

  it('the bounds are inclusive: reaching A or B exactly terminates', () => {
    // alpha = beta = 0.2 gives A = ln(0.8 / 0.2) = ln 4 and B = ln(0.2 / 0.8) = ln 0.25; at
    // p0 = 0.2, p1 = 0.8 one success adds the same ln(0.8 / 0.2) and one failure the same ln(0.2 / 0.8).
    const exact: SprtConfig = { alpha: 0.2, beta: 0.2, p0: 0.2, p1: 0.8 };
    expect(createSprt(exact).observe(1)).toBe('reject');
    expect(createSprt(exact).observe(0)).toBe('accept');
  });

  it('state is a fresh snapshot: mutating it does not change the test', () => {
    const test = createSprt(base);
    const snapshot = test.state;
    snapshot.n = 99;
    expect(test.state.n).toBe(0);
  });

  it('without maxN the test keeps continuing while the LLR oscillates inside the bounds', () => {
    const { test, verdicts } = feed(base, [1, 0, 1, 0, 1, 0, 1, 0, 1, 0]);
    expect(verdicts.every((v) => v === 'continue')).toBe(true);
    expect(test.state.n).toBe(10);
    expect(test.state.llr).toBeCloseTo(5 * (SUCCESS + FAILURE), 12); // −0.872
  });
});
