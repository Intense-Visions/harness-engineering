import type { ArmState, BanditConfig, Pull } from '@harness-engineering/types';
import { describe, expect, it, vi } from 'vitest';

import { foldArms } from '../src/bandit/arm-model';
import { resolveBanditConfig } from '../src/bandit/config';
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

  it('sends every cold-start exploit pull to the caller default and reaches the rest by scouting', () => {
    // three all-novel, unscored arms: no arm has cleared minEffectiveN, so nothing can be ranked
    const cold = ['a', 'b', 'c'].map((id) => arm(id, 1, 1, { meanUtility: 0 }));
    const rng = mulberry32(4);
    const picks = new Map<string, number>();
    let explore = 0;
    for (let i = 0; i < 1000; i += 1) {
      const choice = choose(cold, scout, rng);
      picks.set(choice.arm, (picks.get(choice.arm) ?? 0) + 1);
      if (choice.mode === 'explore') explore += 1;
      // the exploit branch has no evidence to rank on, so it never leaves the caller's first arm
      else expect(choice.arm).toBe('a');
    }
    expect([...picks.keys()].sort()).toEqual(['a', 'b', 'c']); // scouting still reaches every arm
    expect(explore / 1000).toBeGreaterThan(0.08); // and it is the f=0.1 share doing it, not exploit
    for (const id of ['b', 'c']) expect(picks.get(id) ?? 0).toBeGreaterThan(10);
  });

  it('does not consult rng when the best meanUtility is unique', () => {
    const rng = vi.fn(() => 0.99); // 0.99 >= 0.1: the scout gate draws once and never scouts
    const choice = choose(eligible, scout, rng);
    expect(choice.arm).toBe('good');
    expect(rng).toHaveBeenCalledTimes(1);
  });

  it('scoutFraction 0 never explores; non-integer 1/f is printed with one decimal', () => {
    expect(tally(eligible, { ...scout, scoutFraction: 0 }, 3, 500).explore).toBe(0);
    expect(choose(eligible, { ...scout, scoutFraction: 0.3 }, () => 0).reason).toMatch(
      /^scout 1-in-3\.3, /
    );
  });
});

describe('scoutFraction exploit: minimum evidence', () => {
  /** The arm a fold reports for `pulls` scored wins at age 0: effectiveN === pulls, utility 1. */
  function scoredWins(id: string, pulls: number, minEffectiveN = 2): ArmState {
    return arm(id, 1 + pulls, 1, {
      effectiveN: pulls,
      novel: pulls < minEffectiveN,
      meanUtility: 1,
    });
  }
  /** An arm dispatched but never scored: the fold reports meanUtility 0, which is not "bad". */
  const unscored = (id: string): ArmState => arm(id, 1, 1, { meanUtility: 0 });
  const neverScouts = () => 0.99; // 0.99 >= scoutFraction 0.1: every pull takes the exploit branch

  it('one scored pull does not displace the caller default while that arm is still novel', () => {
    const choice = choose([unscored('a'), scoredWins('b', 1)], scout, neverScouts);
    expect(choice.arm).toBe('a'); // not 'b', whose 1.00 utility rests on a single observation
    expect(choice.mode).toBe('exploit');
    expect(choice.reason).toBe('no arm has minimum evidence (n<2); kept caller order');
  });

  it('displaces the caller default once the challenger clears minEffectiveN with a higher utility', () => {
    const held = arm('a', 3, 3, { effectiveN: 4, novel: false, meanUtility: 0.5 });
    expect(choose([held, scoredWins('b', 2)], scout, neverScouts)).toEqual({
      arm: 'b',
      mode: 'exploit',
      reason: 'exploit: best mean utility 1.00 (n=2.0)',
    });
  });

  it('keeps caller order, not id order, when every arm is novel, and draws no tie-break rng', () => {
    const rng = vi.fn(neverScouts);
    expect(choose(['c', 'b', 'a'].map(unscored), scout, rng)).toEqual({
      arm: 'c',
      mode: 'exploit',
      reason: 'no arm has minimum evidence (n<2); kept caller order',
    });
    expect(rng).toHaveBeenCalledTimes(1); // the scout gate only: there is nothing to rank or tie-break
  });

  it('still breaks exploit ties with rng among arms that have cleared the bar', () => {
    const tied = ['x', 'y', 'z'].map((id) =>
      arm(id, 3, 3, { effectiveN: 4, novel: false, meanUtility: 0.5 })
    );
    const { picks, explore } = tally(tied, { ...scout, scoutFraction: 0 }, 7, 900);
    expect(explore).toBe(0); // scoutFraction 0 isolates the exploit branch
    expect([...picks.keys()].sort()).toEqual(['x', 'y', 'z']);
    for (const count of picks.values()) expect(count).toBeGreaterThan(200);
  });

  it('honours a minEffectiveN above the default over the same folded pulls (end to end)', () => {
    const now = new Date('2026-09-24T00:00:00.000Z');
    const base = { ts: now.toISOString(), consumer: 'routing', context: 'quick-fix' } as const;
    const pulls: Pull[] = [
      { ...base, arm: 'a', mode: 'exploit' }, // dispatched, never scored
      ...Array.from(
        { length: 3 },
        (): Pull => ({ ...base, arm: 'b', mode: 'exploit', reward: { outcome: 1 } })
      ),
    ];
    const fold = (minEffectiveN: number) =>
      foldArms(pulls, resolveBanditConfig({ ...scout, minEffectiveN }), now);

    // effectiveN 3 clears the default bar of 2, so 'b' earns the exploit pull
    expect(fold(2).map((a) => `${a.arm}:${String(a.novel)}`)).toEqual(['a:true', 'b:false']);
    expect(choose(fold(2), { ...scout, minEffectiveN: 2 }, neverScouts).arm).toBe('b');

    // the same three pulls fall short of a bar of 5: the fold's id order makes 'a' the default
    expect(fold(5).map((a) => `${a.arm}:${String(a.novel)}`)).toEqual(['a:true', 'b:true']);
    expect(choose(fold(5), { ...scout, minEffectiveN: 5 }, neverScouts)).toEqual({
      arm: 'a',
      mode: 'exploit',
      reason: 'no arm has minimum evidence (n<5); kept caller order',
    });
  });
});

describe('thompson policy', () => {
  it('picks Beta(9,1) over Beta(1,9) in more than 90% of 1,000 seeded draws (SC7)', () => {
    const { picks } = tally([arm('strong', 9, 1), arm('weak', 1, 9)], thompson, 11, 1000);
    expect(picks.get('strong') ?? 0).toBeGreaterThan(900);
    // explore === weak-picks is asserted where weak wins a real share ('observes both modes on
    // overlapping posteriors' below); under this seed weak is never drawn, so it is not repeated here
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
      expect(choice.reason).toMatch(
        /^thompson: sampled \d\.\d\d vs best-mean 0\.90( \(holds best mean\))?$/
      );
      expect(choice.reason).not.toContain('\n');
      // the arm -> mode rule is asserted for both arms in the overlapping-posteriors test below;
      // under this seed only 'strong' is drawn, so only its branch is observable here
      if (choice.arm === 'strong') expect(choice.mode).toBe('exploit');
    }
    expect(seen.has('exploit')).toBe(true);
  });

  it('observes both modes on overlapping posteriors: lower-mean picks are explore, best-mean picks exploit', () => {
    // Beta(3,2) vs Beta(2,3): means 0.60 and 0.40 overlap enough that the weak arm wins a real share
    const eligible = [arm('strong', 3, 2), arm('weak', 2, 3)];
    const rng = mulberry32(13);
    const seen = new Set<string>();
    let weak = 0;
    let explore = 0;
    for (let i = 0; i < 200; i += 1) {
      const choice = choose(eligible, thompson, rng);
      seen.add(choice.mode);
      if (choice.arm === 'weak') weak += 1;
      if (choice.mode === 'explore') explore += 1;
      // the arm decides the mode, and the reason's suffix appears exactly on exploit
      expect(choice.mode).toBe(choice.arm === 'weak' ? 'explore' : 'exploit');
      expect(choice.reason).toMatch(
        choice.mode === 'explore'
          ? /^thompson: sampled \d\.\d\d vs best-mean 0\.60$/
          : /^thompson: sampled \d\.\d\d vs best-mean 0\.60 \(holds best mean\)$/
      );
    }
    expect(seen).toEqual(new Set(['explore', 'exploit']));
    expect(weak).toBeGreaterThan(20); // a positive share, so explore === weak is not 0 === 0
    expect(weak).toBeLessThan(120); // and not a coin flip: the sampler must respect the means
    expect(explore).toBe(weak);
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
