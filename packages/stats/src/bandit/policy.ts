import type { ArmState, BanditConfig, Choice } from '@harness-engineering/types';

import { resolveBanditConfig, type ResolvedBanditConfig } from './config.js';
import { NoEligibleArmsError } from './errors.js';
import type { Rng } from './sampling.js';

/**
 * Pick one arm from an already-eligible set (D7) under the configured policy
 * (spec "Policies"). `rng` is injected so a seeded test is deterministic.
 * Throws `NoEligibleArmsError` on an empty set and `InvalidBanditConfigError`
 * on a bad config; nothing else on this path throws.
 */
export function choose(eligible: readonly ArmState[], config: BanditConfig, rng: Rng): Choice {
  const resolved = resolveBanditConfig(config);
  const only = eligible.length === 1 ? eligible[0] : undefined;
  if (eligible.length === 0) throw new NoEligibleArmsError();
  if (only !== undefined) {
    return {
      arm: only.arm,
      mode: 'exploit',
      reason: `only eligible arm (n=${fmtN(only.effectiveN)})`,
    };
  }
  return resolved.policy === 'thompson'
    ? chooseThompson(eligible, rng)
    : chooseScoutFraction(eligible, resolved, rng);
}

function fmtN(n: number): string {
  return n.toFixed(1);
}

/** "1-in-10" for 0.1; one decimal when 1/f is not an integer ("1-in-3.3" for 0.3). */
function oneIn(fraction: number): string {
  const n = 1 / fraction;
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function argmax<T>(items: readonly T[], key: (item: T) => number): T {
  let best: T | undefined;
  let bestKey = -Infinity;
  for (const item of items) {
    const k = key(item);
    if (best === undefined || k > bestKey) {
      best = item;
      bestKey = k;
    }
  }
  if (best === undefined) throw new NoEligibleArmsError();
  return best;
}

/** Least-sampled eligible arm; novel arms first (D5); ties broken by rng. */
function leastSampled(eligible: readonly ArmState[], rng: Rng): ArmState {
  const novel = eligible.filter((a) => a.novel);
  const pool = novel.length > 0 ? novel : eligible;
  const minN = Math.min(...pool.map((a) => a.effectiveN));
  const tied = pool.filter((a) => a.effectiveN === minN);
  const single = tied.length === 1 ? tied[0] : undefined;
  if (single !== undefined) return single; // no rng draw when there is nothing to break
  return argmax(
    tied.map((a) => ({ a, r: rng() })),
    (t) => t.r
  ).a;
}

function chooseScoutFraction(
  eligible: readonly ArmState[],
  config: ResolvedBanditConfig,
  rng: Rng
): Choice {
  if (rng() < config.scoutFraction) {
    const target = leastSampled(eligible, rng);
    return {
      arm: target.arm,
      mode: 'explore',
      reason: `scout 1-in-${oneIn(config.scoutFraction)}, least sampled (n=${fmtN(target.effectiveN)})`,
    };
  }
  const best = argmax(eligible, (a) => a.meanUtility);
  return {
    arm: best.arm,
    mode: 'exploit',
    reason: `exploit: best mean utility ${best.meanUtility.toFixed(2)} (n=${fmtN(best.effectiveN)})`,
  };
}

function chooseThompson(eligible: readonly ArmState[], _rng: Rng): Choice {
  throw new Error(`thompson policy lands in Task 7 (${String(eligible.length)} arms)`);
}
