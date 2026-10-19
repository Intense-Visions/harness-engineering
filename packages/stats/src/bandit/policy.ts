import type { ArmState, BanditConfig, Choice } from '@harness-engineering/types';

import { resolveBanditConfig, type ResolvedBanditConfig } from './config.js';
import { NoEligibleArmsError } from './errors.js';
import { sampleBeta, type Rng } from './sampling.js';

/**
 * Pick one arm from an already-eligible set (D7) under the configured policy
 * (spec "Policies"). `rng` is injected so a seeded test is deterministic.
 * Throws `NoEligibleArmsError` on an empty set and `InvalidBanditConfigError`
 * on a bad config; nothing else on this path throws.
 *
 * Pass `eligible` in preference order: under `scoutFraction`, `eligible[0]` is
 * the caller's declared default and is returned by the exploit branch until at
 * least one arm has cleared `minEffectiveN`. A cold start therefore behaves
 * exactly as the caller's own ordering would, and no arm can take over the
 * exploit branch on evidence the config says is too thin to rank on.
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

/** One rng draw per tied arm, highest draw wins. A single candidate returns without a draw. */
function breakTie(tied: readonly ArmState[], rng: Rng): ArmState {
  const single = tied.length === 1 ? tied[0] : undefined;
  if (single !== undefined) return single; // no rng draw when there is nothing to break
  return argmax(
    tied.map((a) => ({ a, r: rng() })),
    (t) => t.r
  ).a;
}

/** Least-sampled eligible arm; novel arms first (D5); ties broken by rng. */
function leastSampled(eligible: readonly ArmState[], rng: Rng): ArmState {
  const novel = eligible.filter((a) => a.novel);
  const pool = novel.length > 0 ? novel : eligible;
  const minN = Math.min(...pool.map((a) => a.effectiveN));
  return breakTie(
    pool.filter((a) => a.effectiveN === minN),
    rng
  );
}

/** The exploit pick, plus whether it was ranked on evidence or fell back to the caller's default. */
interface ExploitPick {
  arm: ArmState;
  evidenced: boolean;
}

/**
 * Highest meanUtility among the arms that have cleared the evidence bar
 * (`novel === false`, i.e. effectiveN >= minEffectiveN); ties broken by rng,
 * mirroring `leastSampled`. A novel arm's meanUtility is not a ranking signal:
 * an unscored arm reads 0.0 (`arm-model.ts`), so ranking on the raw number
 * would let one lucky scout pull score 1.0 and take every subsequent exploit
 * pull from every arm that has not been tried yet. When no arm has cleared the
 * bar there is nothing to exploit, so the caller's first arm — its declared
 * default — is returned untouched. The rng tie-break stays because a field of
 * equally-evidenced arms arriving in id order would otherwise send every
 * exploit pull to the alphabetically first.
 */
function bestByUtility(eligible: readonly ArmState[], rng: Rng): ExploitPick {
  const evidenced = eligible.filter((a) => !a.novel);
  const fallback = eligible[0];
  if (evidenced.length === 0) {
    if (fallback === undefined) throw new NoEligibleArmsError(); // unreachable: `choose` rejects the empty set
    return { arm: fallback, evidenced: false };
  }
  const maxUtility = Math.max(...evidenced.map((a) => a.meanUtility));
  return {
    arm: breakTie(
      evidenced.filter((a) => a.meanUtility === maxUtility),
      rng
    ),
    evidenced: true,
  };
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
  const { arm: best, evidenced } = bestByUtility(eligible, rng);
  return {
    arm: best.arm,
    mode: 'exploit',
    reason: evidenced
      ? `exploit: best mean utility ${best.meanUtility.toFixed(2)} (n=${fmtN(best.effectiveN)})`
      : `no arm has minimum evidence (n<${String(config.minEffectiveN)}); kept caller order`,
  };
}

function posteriorMean(arm: ArmState): number {
  return arm.alpha / (arm.alpha + arm.beta);
}

/**
 * One Beta draw per arm, pick the max. `mode` is `explore` when the pick's
 * posterior mean is strictly below the best posterior mean; arms tied on the
 * best mean are all exploit (no override for novel arms — their wide posterior
 * is what gets them sampled). This policy needs no `minEffectiveN` guard: a
 * thin arm's posterior is still near the prior, so the draw is already weighted
 * by how much evidence there is.
 */
function chooseThompson(eligible: readonly ArmState[], rng: Rng): Choice {
  const samples = eligible.map((arm) => ({ arm, sample: sampleBeta(arm.alpha, arm.beta, rng) }));
  const pick = argmax(samples, (s) => s.sample);
  const bestMean = Math.max(...eligible.map(posteriorMean));
  const explore = posteriorMean(pick.arm) < bestMean;
  return {
    arm: pick.arm.arm,
    mode: explore ? 'explore' : 'exploit',
    reason: `thompson: sampled ${pick.sample.toFixed(2)} vs best-mean ${bestMean.toFixed(2)}${explore ? '' : ' (holds best mean)'}`,
  };
}
