import type { SprtConfig, SprtVerdict } from '@harness-engineering/types';
import { describe, expect, it } from 'vitest';

import { validateSprtConfig } from '../src/sprt/config';
import { InvalidSprtConfigError, InvalidSprtObservationError } from '../src/sprt/errors';
import { createSprt, waldBounds, type SprtObservation } from '../src/sprt/sprt';
import { mulberry32 } from './helpers/prng';

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

describe('InvalidSprtObservationError', () => {
  it('is a distinguishable Error subclass naming the offending value and its type', () => {
    const error = new InvalidSprtObservationError('1');
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('InvalidSprtObservationError');
    expect(error.message).toBe(
      'invalid SprtObservation: expected 0, 1, true, or false, got 1 (string)'
    );
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

  it.each([
    ['alpha zero (would give ±Infinity)', { alpha: 0, beta: 0.5 }, /alpha must be in \(0, 1\)/],
    ['alpha above one (would give NaN)', { alpha: 1.5, beta: 0.2 }, /alpha must be in \(0, 1\)/],
    ['beta NaN', { alpha: 0.05, beta: Number.NaN }, /beta must be in \(0, 1\)/],
    ['alpha + beta not below 1 (A ≤ B)', { alpha: 0.6, beta: 0.5 }, /alpha \+ beta must be < 1/],
  ] as const)(
    'rejects %s with InvalidSprtConfigError instead of a silent number',
    (_name, rates, message) => {
      expect(() => waldBounds(rates)).toThrow(InvalidSprtConfigError);
      expect(() => waldBounds(rates)).toThrow(message);
    }
  );
});

describe('createSprt: Bernoulli LLR and Wald verdicts', () => {
  it('rejects an invalid config at construction', () => {
    expect(() => createSprt({ ...base, p1: 0.5 })).toThrow(InvalidSprtConfigError);
  });

  it('starts at llr 0, n 0, successes 0, continue', () => {
    expect(createSprt(base).state).toEqual({ llr: 0, n: 0, successes: 0, verdict: 'continue' });
  });

  it('counts successes separately from n and computes the LLR from the two counts', () => {
    const { test } = feed(base, [1, 0, 1, 1, 0]);
    expect(test.state.n).toBe(5);
    expect(test.state.successes).toBe(3);
    // Count-based: 3·ln 1.4 + 2·ln 0.6 in two multiplies and one add, not five additions.
    expect(test.state.llr).toBeCloseTo(3 * SUCCESS + 2 * FAILURE, 12); // −0.0122
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

describe('createSprt: observe rejects anything but 0, 1, true, false', () => {
  /** Values a JS consumer, an `as` cast, or JSON-sourced data can slip past the type. */
  const outOfDomain = [
    ['0.5', 0.5],
    ['2', 2],
    ['-1', -1],
    ["'1'", '1'],
    ['null', null],
    ['undefined', undefined],
    ['NaN', Number.NaN],
  ] as const;

  it.each(outOfDomain)(
    'throws InvalidSprtObservationError for %s and leaves the state unchanged',
    (_name, value) => {
      const { test } = feed(base, [1, 0]);
      const before = test.state;
      const bad = value as unknown as SprtObservation;
      expect(() => test.observe(bad)).toThrow(InvalidSprtObservationError);
      expect(() => test.observe(bad)).toThrow(
        /invalid SprtObservation: expected 0, 1, true, or false/
      );
      expect(test.state).toEqual(before);
    }
  );

  it('throws before the sticky-verdict check, so a terminated test still rejects bad input', () => {
    const { test } = feed(base, [0, 0, 0, 0, 0, 0]); // accept at n = 6
    const atStop = test.state;
    expect(() => test.observe(0.5 as unknown as SprtObservation)).toThrow(
      InvalidSprtObservationError
    );
    expect(test.state).toEqual(atStop);
  });

  it.each([0, 1, true, false] as const)('accepts %s', (value) => {
    const test = createSprt(base);
    expect(test.observe(value)).toBe('continue');
    expect(test.state.n).toBe(1);
  });
});

describe('createSprt: a terminal verdict is sticky', () => {
  it('returns the same reject on further observations and stops accumulating', () => {
    const { test } = feed(base, [1, 1, 1, 1, 1, 1, 1, 1, 1]); // reject at n = 9
    const atStop = test.state;
    expect(test.observe(0)).toBe('reject');
    expect(test.observe(false)).toBe('reject');
    expect(test.state).toEqual(atStop);
  });

  it('holds accept the same way', () => {
    const { test } = feed(base, [0, 0, 0, 0, 0, 0]); // accept at n = 6
    expect(test.observe(1)).toBe('accept');
    expect(test.state.n).toBe(6);
    expect(test.state.llr).toBeCloseTo(6 * FAILURE, 12);
  });
});

describe('createSprt: maxN resolution', () => {
  it('resolves to reject when the LLR is positive at n = maxN', () => {
    const { test, verdicts } = feed({ ...base, maxN: 3 }, [1, 0, 1]); // 2·ln 1.4 + ln 0.6 = 0.162 > 0
    expect(verdicts).toEqual(['continue', 'continue', 'reject']);
    expect(test.state.n).toBe(3);
  });

  it('resolves to accept when the LLR is negative at n = maxN', () => {
    const { verdicts } = feed({ ...base, maxN: 3 }, [0, 1, 0]); // ln 1.4 + 2·ln 0.6 = −0.685 < 0
    expect(verdicts).toEqual(['continue', 'continue', 'accept']);
  });

  it('tie rule: an LLR of exactly 0 at maxN favors h0 (accept)', () => {
    // At p0 = 0.1, p1 = 0.9 the two terms are exactly ln 9 and −ln 9 in IEEE-754 (1 − 0.1 and
    // 1 − 0.9 both round so that the ratios are exact reciprocals), so [1, 0] lands on 0 exactly;
    // ln 9 = 2.197 stays inside A = ln 19 = 2.944, so the first observation continues.
    // This relies on V8's Math.log giving ln(9) + ln(0.11111111111111108) === 0 exactly (an
    // engine-dependent IEEE-754 cancellation; the (0.2, 0.8) pair does not cancel), which is why
    // the llr is asserted with toBe(0) before the verdict: a port to another engine fails here first.
    const { test, verdicts } = feed({ alpha: 0.05, beta: 0.05, p0: 0.1, p1: 0.9, maxN: 2 }, [1, 0]);
    expect(test.state.llr).toBe(0);
    expect(verdicts).toEqual(['continue', 'accept']);
  });

  it('maxN = 1 resolves on the first observation', () => {
    expect(createSprt({ ...base, maxN: 1 }).observe(1)).toBe('reject');
    expect(createSprt({ ...base, maxN: 1 }).observe(0)).toBe('accept');
  });

  it('a forced verdict is sticky too', () => {
    const { test } = feed({ ...base, maxN: 3 }, [1, 0, 1]);
    expect(test.observe(0)).toBe('reject');
    expect(test.state.n).toBe(3);
  });

  it('a natural crossing before maxN is unaffected', () => {
    const { verdicts } = feed({ ...base, maxN: 200 }, [0, 0, 0, 0, 0, 0]);
    expect(verdicts[5]).toBe('accept');
  });
});

describe('SC8: 1,000 seeded Bernoulli streams, p0 = 0.5 vs p1 = 0.7, alpha = beta = 0.05, maxN = 200', () => {
  const SEED = 20260924;
  const STREAMS = 500; // per hypothesis: 500 under h0 + 500 under h1
  const sc8: SprtConfig = { ...base, maxN: 200 };

  /** One stream to termination; the seeded rng draws the Bernoulli(p) observations. */
  function runStream(p: number, rng: () => number) {
    const test = createSprt(sc8);
    let verdict: SprtVerdict;
    do {
      verdict = test.observe(rng() < p ? 1 : 0);
    } while (verdict === 'continue');
    return test.state;
  }

  /** Each hypothesis gets its own stream so either half is reproducible on its own. */
  function runAll(p: number, seed: number) {
    const rng = mulberry32(seed);
    return Array.from({ length: STREAMS }, () => runStream(p, rng));
  }

  const mean = (xs: readonly number[]) => xs.reduce((sum, x) => sum + x, 0) / xs.length;
  const underH0 = runAll(0.5, SEED);
  const underH1 = runAll(0.7, SEED + 1);

  it('realized type-I error (reject under h0) is at or below 0.07', () => {
    const typeI = underH0.filter((s) => s.verdict === 'reject').length / STREAMS;
    expect(typeI).toBeLessThanOrEqual(0.07); // 0.050 (25 / 500) at this seed
  });

  it('realized type-II error (accept under h1) is at or below 0.07', () => {
    const typeII = underH1.filter((s) => s.verdict === 'accept').length / STREAMS;
    expect(typeII).toBeLessThanOrEqual(0.07); // 0.024 (12 / 500) at this seed
  });

  it('every stream terminates within maxN = 200 with a terminal verdict', () => {
    for (const s of [...underH0, ...underH1]) {
      expect(s.verdict).not.toBe('continue');
      expect(s.n).toBeGreaterThanOrEqual(1);
      expect(s.n).toBeLessThanOrEqual(200);
    }
  });

  it('mean sample size is well below maxN under each hypothesis (Wald: ≈30 under h0, ≈32 under h1)', () => {
    for (const states of [underH0, underH1]) {
      const meanN = mean(states.map((s) => s.n));
      expect(meanN).toBeGreaterThan(20);
      expect(meanN).toBeLessThan(60); // 33.5 / 34.3 at this seed
    }
  });

  it('is reproducible: the same seed yields the same verdicts and stopping times', () => {
    expect(runAll(0.5, SEED)).toEqual(underH0);
  });
});
