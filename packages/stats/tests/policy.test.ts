import type { ArmState, BanditConfig } from '@harness-engineering/types';
import { describe, expect, it, vi } from 'vitest';

import { InvalidBanditConfigError, NoEligibleArmsError } from '../src/bandit/errors';
import { choose } from '../src/bandit/policy';
import { mulberry32 } from './helpers/prng';

function arm(id: string, alpha: number, beta: number, overrides: Partial<ArmState> = {}): ArmState {
  const effectiveN = alpha + beta - 2;
  return {
    arm: id,
    alpha,
    beta,
    effectiveN,
    novel: effectiveN < 2,
    meanUtility: alpha / (alpha + beta),
    ...overrides,
  };
}

const scout: BanditConfig = {
  policy: 'scoutFraction',
  scoutFraction: 0.1,
  halfLifeDays: 30,
  minEffectiveN: 2,
};
const thompson: BanditConfig = { policy: 'thompson', halfLifeDays: 30, minEffectiveN: 2 };

function tally(eligible: ArmState[], config: BanditConfig, seed: number, n: number) {
  const rng = mulberry32(seed);
  const picks = new Map<string, number>();
  let explore = 0;
  for (let i = 0; i < n; i += 1) {
    const choice = choose(eligible, config, rng);
    picks.set(choice.arm, (picks.get(choice.arm) ?? 0) + 1);
    if (choice.mode === 'explore') explore += 1;
  }
  return { picks, explore };
}

describe('choose: shared contract', () => {
  it('throws NoEligibleArmsError on an empty eligible set and returns nothing (SC3)', () => {
    for (const config of [scout, thompson]) {
      expect(() => choose([], config, Math.random)).toThrow(NoEligibleArmsError);
    }
  });

  it('validates the config at the call boundary', () => {
    expect(() => choose([arm('a', 2, 2)], { ...scout, scoutFraction: 2 }, Math.random)).toThrow(
      InvalidBanditConfigError
    );
  });

  it.each([
    ['scoutFraction', scout],
    ['thompson', thompson],
  ])(
    'returns the only eligible arm as exploit without consulting rng under %s (SC2)',
    (_name, config) => {
      const rng = vi.fn(() => 0.0);
      const choice = choose([arm('solo', 1, 1)], config, rng);
      expect(choice).toEqual({
        arm: 'solo',
        mode: 'exploit',
        reason: 'only eligible arm (n=0.0)',
      });
      expect(rng).not.toHaveBeenCalled();
    }
  );
});

describe('scoutFraction policy', () => {
  const eligible = [arm('good', 9, 1), arm('meh', 5, 5), arm('bad', 1, 9)];

  it('explores with share within ±0.02 of f=0.1 over 10,000 seeded pulls (SC1)', () => {
    const { explore } = tally(eligible, scout, 1, 10_000);
    expect(explore / 10_000).toBeGreaterThan(0.08);
    expect(explore / 10_000).toBeLessThan(0.12);
  });

  it('exploits the highest meanUtility with mode exploit and a printable reason', () => {
    const choice = choose(eligible, scout, () => 0.99); // 0.99 >= 0.1: never scouts
    expect(choice.arm).toBe('good');
    expect(choice.mode).toBe('exploit');
    expect(choice.reason).toBe('exploit: best mean utility 0.90 (n=8.0)');
    expect(choice.reason).not.toContain('\n');
  });

  it('scouts the least-sampled arm with mode explore and the spec-shaped reason', () => {
    const sparse = [arm('good', 9, 1), arm('thin', 1.3, 1.1)];
    const choice = choose(sparse, scout, () => 0.05); // 0.05 < 0.1: scout
    expect(choice).toEqual({
      arm: 'thin',
      mode: 'explore',
      reason: 'scout 1-in-10, least sampled (n=0.4)',
    });
  });

  it('prefers novel arms as scout targets even when a non-novel arm has fewer pulls', () => {
    // 'seasoned-low' is forced non-novel with a tiny effectiveN; 'novel' has effectiveN 1 (< minEffectiveN 2)
    const mixed = [
      arm('seasoned-low', 2, 2, { novel: false, effectiveN: 0.5 }),
      arm('novel', 1.5, 1.5),
    ];
    expect(mixed[1]?.novel).toBe(true);
    expect(choose(mixed, scout, () => 0).arm).toBe('novel');
  });

  it('breaks least-sampled ties with rng', () => {
    const tied = [arm('x', 1, 1), arm('y', 1, 1), arm('z', 1, 1)];
    const { picks } = tally(tied, { ...scout, scoutFraction: 1 }, 2, 300);
    expect([...picks.keys()].sort()).toEqual(['x', 'y', 'z']);
    for (const count of picks.values()) expect(count).toBeGreaterThan(60);
  });

  it('scoutFraction 0 never explores; non-integer 1/f is printed with one decimal', () => {
    expect(tally(eligible, { ...scout, scoutFraction: 0 }, 3, 500).explore).toBe(0);
    expect(choose(eligible, { ...scout, scoutFraction: 0.3 }, () => 0).reason).toMatch(
      /^scout 1-in-3\.3, /
    );
  });
});

describe('thompson policy', () => {
  it('picks Beta(9,1) over Beta(1,9) in more than 90% of 1,000 seeded draws (SC7)', () => {
    const { picks, explore } = tally([arm('strong', 9, 1), arm('weak', 1, 9)], thompson, 11, 1000);
    expect(picks.get('strong') ?? 0).toBeGreaterThan(900);
    // every pick of the lower-mean arm is an explore, and only those
    expect(explore).toBe(picks.get('weak') ?? 0);
  });

  it('splits identical Beta(5,5) arms 40% to 60% each (SC7)', () => {
    const { picks, explore } = tally([arm('left', 5, 5), arm('right', 5, 5)], thompson, 12, 1000);
    for (const id of ['left', 'right']) {
      const share = (picks.get(id) ?? 0) / 1000;
      expect(share).toBeGreaterThanOrEqual(0.4);
      expect(share).toBeLessThanOrEqual(0.6);
    }
    expect(explore).toBe(0); // equal posterior means: neither pick is below the best mean
  });

  it('labels the mode from posterior means and prints a one-line reason', () => {
    const eligible = [arm('strong', 9, 1), arm('weak', 1, 9)];
    const rng = mulberry32(13);
    const seen = new Set<string>();
    for (let i = 0; i < 200; i += 1) {
      const choice = choose(eligible, thompson, rng);
      seen.add(choice.mode);
      expect(choice.reason).toMatch(/^thompson: sampled \d\.\d\d vs best-mean 0\.90/);
      expect(choice.reason).not.toContain('\n');
      if (choice.arm === 'weak') expect(choice.mode).toBe('explore');
      if (choice.arm === 'strong') expect(choice.mode).toBe('exploit');
    }
    expect(seen.has('exploit')).toBe(true);
  });

  it('is deterministic under a seed and varies across seeds', () => {
    const eligible = [arm('a', 3, 2), arm('b', 2, 3), arm('c', 1, 1)];
    const run = (seed: number) => {
      const rng = mulberry32(seed);
      return Array.from({ length: 30 }, () => choose(eligible, thompson, rng).arm);
    };
    expect(run(5)).toEqual(run(5));
    expect(new Set(run(5)).size).toBeGreaterThan(1);
    expect(run(5)).not.toEqual(run(6));
  });
});
