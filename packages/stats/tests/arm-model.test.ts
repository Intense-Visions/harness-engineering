import type { Pull } from '@harness-engineering/types';
import { describe, expect, it } from 'vitest';

import { decayWeight, foldArms } from '../src/bandit/arm-model';
import { resolveBanditConfig } from '../src/bandit/config';
import { outcomePerDollar } from '../src/bandit/utility';
import { mulberry32 } from './helpers/prng';

const NOW = new Date('2026-09-24T00:00:00.000Z');
const DAY_MS = 86_400_000;
const config = resolveBanditConfig({ policy: 'thompson', halfLifeDays: 30, minEffectiveN: 2 });

function at(daysAgo: number): string {
  return new Date(NOW.getTime() - daysAgo * DAY_MS).toISOString();
}

function pull(arm: string, daysAgo: number, reward?: Pull['reward']): Pull {
  const base: Pull = {
    ts: at(daysAgo),
    consumer: 'routing',
    context: 'quick-fix',
    arm,
    mode: 'exploit',
  };
  return reward === undefined ? base : { ...base, reward };
}

describe('decayWeight (SC6)', () => {
  it('weighs an observation k half-lives old at 0.5^k within 1e-9, over 200 seeded (k, halfLife) pairs', () => {
    const rng = mulberry32(6);
    for (let i = 0; i < 200; i += 1) {
      const k = rng() * 10; // 0..10 half-lives
      const halfLife = 0.5 + rng() * 120; // 0.5..120.5 days
      expect(Math.abs(decayWeight(k * halfLife, halfLife) - Math.pow(0.5, k))).toBeLessThan(1e-9);
    }
  });

  it('is exactly 1 at age 0 and 0.5 at one half-life', () => {
    expect(decayWeight(0, 30)).toBe(1);
    expect(decayWeight(30, 30)).toBe(0.5);
  });
});

describe('foldArms', () => {
  it('returns [] for no pulls', () => {
    expect(foldArms([], config, NOW)).toEqual([]);
  });

  it('unscored pulls leave the posterior at the prior with effectiveN 0 but update lastPull (SC4, D9)', () => {
    const arms = foldArms([pull('local', 5), pull('local', 1)], config, NOW);
    expect(arms).toEqual([
      {
        arm: 'local',
        alpha: 1,
        beta: 1,
        effectiveN: 0,
        novel: true,
        meanUtility: 0,
        lastPull: at(1),
      },
    ]);
  });

  it('a scored pull k half-lives old adds 0.5^k to alpha (outcome 1) or beta (outcome 0)', () => {
    const arms = foldArms(
      [
        pull('a', 30, { outcome: 1 }),
        pull('a', 60, { outcome: 0 }),
        pull('a', 0, { outcome: 0.5 }),
      ],
      config,
      NOW
    );
    const a = arms[0];
    // weights 0.5 (30d), 0.25 (60d), 1 (0d); outcomes 1, 0, 0.5
    expect(a?.alpha).toBeCloseTo(1 + 0.5 * 1 + 0.25 * 0 + 1 * 0.5, 12);
    expect(a?.beta).toBeCloseTo(1 + 0.5 * 0 + 0.25 * 1 + 1 * 0.5, 12);
    expect(a?.effectiveN).toBeCloseTo(0.5 + 0.25 + 1, 12);
    expect(a?.novel).toBe(true); // 1.75 < minEffectiveN 2
  });

  it('flags novel exactly when effectiveN < minEffectiveN (SC6)', () => {
    const fresh = [pull('a', 0, { outcome: 1 }), pull('a', 0, { outcome: 1 })];
    expect(foldArms(fresh, config, NOW)[0]?.novel).toBe(false); // effectiveN 2, not < 2
    expect(foldArms(fresh.slice(0, 1), config, NOW)[0]?.novel).toBe(true);
    const stale = [pull('a', 90, { outcome: 1 }), pull('a', 90, { outcome: 1 })];
    expect(foldArms(stale, config, NOW)[0]?.novel).toBe(true); // 2 * 0.125 = 0.25
  });

  it('clamps a future timestamp to age 0 (weight exactly 1)', () => {
    const arms = foldArms([pull('a', -400, { outcome: 1 })], config, NOW);
    expect(arms[0]?.alpha).toBe(2);
    expect(arms[0]?.effectiveN).toBe(1);
  });

  it('meanUtility is the decay-weighted mean of the utility over scored pulls', () => {
    const arms = foldArms(
      [
        pull('a', 0, { outcome: 1, costUsd: 1 }),
        pull('a', 30, { outcome: 1, costUsd: 0.5 }),
        pull('a', 0),
      ],
      config,
      NOW,
      outcomePerDollar
    );
    // weights 1 and 0.5; utilities 1 and 2 -> (1*1 + 0.5*2) / 1.5
    expect(arms[0]?.meanUtility).toBeCloseTo(4 / 3, 12);
  });

  it('folds one ArmState per arm, sorted by arm id, with lastPull as the latest ts of any pull', () => {
    const arms = foldArms(
      [pull('zeta', 3, { outcome: 1 }), pull('alpha', 2), pull('zeta', 1)],
      config,
      NOW
    );
    expect(arms.map((a) => a.arm)).toEqual(['alpha', 'zeta']);
    expect(arms[1]?.lastPull).toBe(at(1));
    expect(arms[0]?.lastPull).toBe(at(2));
  });

  it('uses the injected prior', () => {
    const strong = resolveBanditConfig({
      policy: 'thompson',
      halfLifeDays: 30,
      minEffectiveN: 2,
      prior: { alpha: 3, beta: 7 },
    });
    expect(foldArms([pull('a', 0)], strong, NOW)[0]).toMatchObject({
      alpha: 3,
      beta: 7,
      effectiveN: 0,
    });
  });
});
