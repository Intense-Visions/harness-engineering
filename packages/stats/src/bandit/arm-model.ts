import type { ArmState, Pull } from '@harness-engineering/types';

import type { ResolvedBanditConfig } from './config.js';
import { outcomeOnly, type Utility } from './utility.js';

const MS_PER_DAY = 86_400_000;

/**
 * Half-life decay (D5): an observation k half-lives old weighs 0.5^k. Pure in
 * its arguments; the reference instant is always passed in as `now` by the
 * caller, never read from the clock, so a fold is reproducible.
 */
export function decayWeight(ageDays: number, halfLifeDays: number): number {
  return Math.pow(0.5, ageDays / halfLifeDays);
}

/** Age of `ts` at `now` in days; a future `ts` is clamped to 0 (weight 1, never more). */
function ageDays(ts: string, now: Date): number {
  return Math.max(0, (now.getTime() - Date.parse(ts)) / MS_PER_DAY);
}

/**
 * The retention bound: true when `ts` is more than `retentionHalfLives`
 * half-lives before `now`. Such a pull weighs at most 2^-retentionHalfLives —
 * about 0.001 at the default 10 — so it cannot materially move a posterior, and
 * the fold skips it outright rather than accumulating a weight that rounds away.
 * This is what bounds the work a fold does, and `BanditLedger.compact` asks the
 * same question per line so the file and the fold agree by construction.
 *
 * Not on the package barrel: consumers get the behaviour through `foldArms` and
 * `compact`, not the predicate. An expired pull is well-formed, never malformed.
 * A `ts` that does not parse is never expired (`accumulate` skips it instead), so
 * compaction can never delete a line it was unable to judge.
 */
export function isExpired(ts: string, config: ResolvedBanditConfig, now: Date): boolean {
  const age = (now.getTime() - Date.parse(ts)) / MS_PER_DAY;
  return age > config.retentionHalfLives * config.halfLifeDays;
}

interface Accumulator {
  arm: string;
  alpha: number;
  beta: number;
  effectiveN: number;
  weightedUtility: number;
  lastPull?: string;
}

interface FoldContext {
  config: ResolvedBanditConfig;
  now: Date;
  utility: Utility;
}

function newAccumulator(arm: string, prior: ResolvedBanditConfig['prior']): Accumulator {
  return { arm, alpha: prior.alpha, beta: prior.beta, effectiveN: 0, weightedUtility: 0 };
}

function accumulate(acc: Accumulator, pull: Pull, ctx: FoldContext): void {
  const age = ageDays(pull.ts, ctx.now);
  if (Number.isNaN(age)) return; // unparseable ts: contributes nothing, mirroring the ledger's malformed skip
  if (acc.lastPull === undefined || Date.parse(pull.ts) > Date.parse(acc.lastPull))
    acc.lastPull = pull.ts;
  if (pull.reward === undefined) return; // D9: unscored contributes nothing to the posterior
  const w = decayWeight(age, ctx.config.halfLifeDays);
  acc.alpha += w * pull.reward.outcome;
  acc.beta += w * (1 - pull.reward.outcome);
  acc.effectiveN += w;
  acc.weightedUtility += w * ctx.utility(pull.reward);
}

function toArmState(acc: Accumulator, config: ResolvedBanditConfig): ArmState {
  const state: ArmState = {
    arm: acc.arm,
    alpha: acc.alpha,
    beta: acc.beta,
    effectiveN: acc.effectiveN,
    novel: acc.effectiveN < config.minEffectiveN,
    meanUtility: acc.effectiveN > 0 ? acc.weightedUtility / acc.effectiveN : 0,
  };
  if (acc.lastPull !== undefined) state.lastPull = acc.lastPull;
  return state;
}

/**
 * Fold already-resolved pulls of one (consumer, context) bucket into one
 * `ArmState` per arm (spec "Arm model"): alpha = prior.alpha + sum(w * outcome),
 * beta = prior.beta + sum(w * (1 - outcome)), effectiveN = sum(w),
 * novel = effectiveN < minEffectiveN, meanUtility = decay-weighted mean of
 * `utility` over scored pulls. Result is sorted by arm id in UTF-16 code-unit order (the `<`/`>` comparison JavaScript strings use)
 * (not `localeCompare`, whose order depends on the host locale). The ledger only
 * hands over pulls with a parseable ISO `ts`; a direct caller's pull whose `ts`
 * does not parse is skipped (it still names the arm, so the arm folds to the prior).
 * A pull older than `retentionHalfLives` half-lives is dropped before any of that
 * (`isExpired`): it names no arm and leaves no trace, because its weight could not
 * have moved the posterior anyway.
 */
export function foldArms(
  pulls: readonly Pull[],
  config: ResolvedBanditConfig,
  now: Date,
  utility: Utility = outcomeOnly
): ArmState[] {
  const ctx: FoldContext = { config, now, utility };
  const byArm = new Map<string, Accumulator>();
  for (const pull of pulls) {
    // outside retention: contributes nothing at all, not even an arm entry at the prior,
    // so a fold before compaction equals a fold after it
    if (isExpired(pull.ts, config, now)) continue;
    let acc = byArm.get(pull.arm);
    if (acc === undefined) {
      acc = newAccumulator(pull.arm, config.prior);
      byArm.set(pull.arm, acc);
    }
    accumulate(acc, pull, ctx);
  }
  return [...byArm.values()]
    .map((acc) => toArmState(acc, config))
    .sort((a, b) => (a.arm < b.arm ? -1 : a.arm > b.arm ? 1 : 0));
}
