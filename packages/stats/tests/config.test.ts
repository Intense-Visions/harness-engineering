import type { BanditConfig } from '@harness-engineering/types';
import { describe, expect, it } from 'vitest';

import {
  DEFAULT_HALF_LIFE_DAYS,
  DEFAULT_MIN_EFFECTIVE_N,
  DEFAULT_PRIOR,
  DEFAULT_SCOUT_FRACTION,
  resolveBanditConfig,
} from '../src/bandit/config';
import { InvalidBanditConfigError, NoEligibleArmsError } from '../src/bandit/errors';

const base: BanditConfig = { policy: 'scoutFraction', halfLifeDays: 30, minEffectiveN: 2 };

describe('resolveBanditConfig', () => {
  it('fills the spec defaults: scoutFraction 0.1 and prior Beta(1,1)', () => {
    const resolved = resolveBanditConfig(base);
    expect(resolved.scoutFraction).toBe(DEFAULT_SCOUT_FRACTION);
    expect(resolved.scoutFraction).toBe(0.1);
    expect(resolved.prior).toEqual({ alpha: 1, beta: 1 });
    expect(resolved.prior).toEqual(DEFAULT_PRIOR);
    expect(resolved.prior).not.toBe(DEFAULT_PRIOR);
  });

  it('fills the spec defaults for omitted halfLifeDays (30) and minEffectiveN (2)', () => {
    const resolved = resolveBanditConfig({ policy: 'thompson' });
    expect(resolved.halfLifeDays).toBe(DEFAULT_HALF_LIFE_DAYS);
    expect(resolved.halfLifeDays).toBe(30);
    expect(resolved.minEffectiveN).toBe(DEFAULT_MIN_EFFECTIVE_N);
    expect(resolved.minEffectiveN).toBe(2);
  });

  it('keeps supplied halfLifeDays and minEffectiveN over the defaults', () => {
    const resolved = resolveBanditConfig({ policy: 'thompson', halfLifeDays: 7, minEffectiveN: 5 });
    expect(resolved.halfLifeDays).toBe(7);
    expect(resolved.minEffectiveN).toBe(5);
  });

  it('keeps explicit values', () => {
    const resolved = resolveBanditConfig({
      ...base,
      scoutFraction: 0.25,
      prior: { alpha: 2, beta: 3 },
    });
    expect(resolved.scoutFraction).toBe(0.25);
    expect(resolved.prior).toEqual({ alpha: 2, beta: 3 });
  });

  it.each([
    ['scoutFraction below 0', { ...base, scoutFraction: -0.01 }, /scoutFraction/],
    ['scoutFraction above 1', { ...base, scoutFraction: 1.01 }, /scoutFraction/],
    ['scoutFraction NaN', { ...base, scoutFraction: Number.NaN }, /scoutFraction/],
    ['halfLifeDays zero', { ...base, halfLifeDays: 0 }, /halfLifeDays/],
    ['halfLifeDays negative', { ...base, halfLifeDays: -1 }, /halfLifeDays/],
    ['halfLifeDays NaN', { ...base, halfLifeDays: Number.NaN }, /halfLifeDays/],
    ['minEffectiveN negative', { ...base, minEffectiveN: -1 }, /minEffectiveN/],
    ['minEffectiveN NaN', { ...base, minEffectiveN: Number.NaN }, /minEffectiveN/],
    ['prior alpha zero', { ...base, prior: { alpha: 0, beta: 1 } }, /prior/],
    ['prior beta negative', { ...base, prior: { alpha: 1, beta: -2 } }, /prior/],
    ['unknown policy', { ...base, policy: 'thomson' as never }, /policy must be/],
  ] as const)('rejects %s with InvalidBanditConfigError', (_name, config, message) => {
    expect(() => resolveBanditConfig(config)).toThrow(InvalidBanditConfigError);
    expect(() => resolveBanditConfig(config)).toThrow(message);
  });

  it('accepts the boundary values 0 and 1 for scoutFraction and 0 for minEffectiveN', () => {
    expect(resolveBanditConfig({ ...base, scoutFraction: 0 }).scoutFraction).toBe(0);
    expect(resolveBanditConfig({ ...base, scoutFraction: 1 }).scoutFraction).toBe(1);
    expect(resolveBanditConfig({ ...base, minEffectiveN: 0 }).minEffectiveN).toBe(0);
  });
});

describe('errors', () => {
  it('NoEligibleArmsError and InvalidBanditConfigError are distinguishable Error subclasses', () => {
    const noArms = new NoEligibleArmsError();
    const badConfig = new InvalidBanditConfigError('halfLifeDays must be > 0');
    expect(noArms).toBeInstanceOf(Error);
    expect(noArms.name).toBe('NoEligibleArmsError');
    expect(noArms.message).toMatch(/eligible/);
    expect(badConfig.name).toBe('InvalidBanditConfigError');
    expect(badConfig.message).toBe('invalid BanditConfig: halfLifeDays must be > 0');
  });
});
