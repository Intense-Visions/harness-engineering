import type { BanditConfig } from '@harness-engineering/types';

import { InvalidBanditConfigError } from './errors.js';

/** Spec default: one pull in ten scouts under `scoutFraction`. */
export const DEFAULT_SCOUT_FRACTION = 0.1;
/** Spec default: evidence loses half its weight every 30 days (D5). */
export const DEFAULT_HALF_LIFE_DAYS = 30;
/** Spec default: an arm with less than 2 effective samples is `novel` (D5). */
export const DEFAULT_MIN_EFFECTIVE_N = 2;
/**
 * Spec default: the fold ignores a pull older than ten half-lives. At ten
 * half-lives the decay weight is 2^-10 (about 0.001), so such a pull cannot
 * materially move a posterior; dropping it is what bounds the ledger read
 * (`BanditLedger.compact` deletes the same lines from the file).
 */
export const DEFAULT_RETENTION_HALF_LIVES = 10;
/** Spec default: the uniform Beta(1,1) prior. */
export const DEFAULT_PRIOR: Readonly<{ alpha: number; beta: number }> = { alpha: 1, beta: 1 };

/** A `BanditConfig` with every optional field filled and every bound checked. */
export interface ResolvedBanditConfig extends BanditConfig {
  scoutFraction: number;
  halfLifeDays: number;
  minEffectiveN: number;
  retentionHalfLives: number;
  prior: { alpha: number; beta: number };
}

/** One validation rule: `ok` false means the config is rejected with `message`. */
interface Guard {
  ok: boolean;
  message: string;
}

const isPolicy = (p: unknown): p is BanditConfig['policy'] =>
  p === 'scoutFraction' || p === 'thompson';
/** NaN fails every comparison, so each predicate rejects NaN as well as the out-of-range values. */
const inUnitInterval = (x: number): boolean => x >= 0 && x <= 1;
const positive = (x: number): boolean => x > 0;
/** Infinity would mean "never retire a pull", which is the unbounded read this bound exists to prevent. */
const positiveFinite = (x: number): boolean => Number.isFinite(x) && x > 0;
const nonNegative = (x: number): boolean => x >= 0;
const positivePair = (pair: { alpha: number; beta: number }): boolean =>
  positive(pair.alpha) && positive(pair.beta);

function guards(policy: unknown, filled: Omit<ResolvedBanditConfig, 'policy'>): readonly Guard[] {
  const { scoutFraction, halfLifeDays, minEffectiveN, retentionHalfLives, prior } = filled;
  return [
    {
      ok: isPolicy(policy),
      message: `policy must be 'scoutFraction' or 'thompson', got ${String(policy)}`,
    },
    {
      ok: inUnitInterval(scoutFraction),
      message: `scoutFraction must be in [0, 1], got ${String(scoutFraction)}`,
    },
    {
      ok: positive(halfLifeDays),
      message: `halfLifeDays must be > 0, got ${String(halfLifeDays)}`,
    },
    {
      ok: nonNegative(minEffectiveN),
      message: `minEffectiveN must be >= 0, got ${String(minEffectiveN)}`,
    },
    {
      ok: positiveFinite(retentionHalfLives),
      message: `retentionHalfLives must be a finite number > 0, got ${String(retentionHalfLives)}`,
    },
    {
      ok: positivePair(prior),
      message: `prior alpha and beta must be > 0, got ${String(prior.alpha)}/${String(prior.beta)}`,
    },
  ];
}

/**
 * Validate a config and fill its defaults (spec "Error handling", plus
 * `retentionHalfLives`). The bandit
 * has no constructor, so `choose` and `fold` call this on every invocation; a
 * consumer that wants the throw once, at its own construction time, calls it
 * directly and keeps the resolved result (ADR 0132). The
 * `policy` check is additive to the spec's enumerated bounds: an unknown
 * policy string is rejected rather than silently running `scoutFraction`.
 */
export function resolveBanditConfig(config: BanditConfig): ResolvedBanditConfig {
  const prior = config.prior ?? DEFAULT_PRIOR;
  const filled = {
    scoutFraction: config.scoutFraction ?? DEFAULT_SCOUT_FRACTION,
    halfLifeDays: config.halfLifeDays ?? DEFAULT_HALF_LIFE_DAYS,
    minEffectiveN: config.minEffectiveN ?? DEFAULT_MIN_EFFECTIVE_N,
    retentionHalfLives: config.retentionHalfLives ?? DEFAULT_RETENTION_HALF_LIVES,
    prior: { alpha: prior.alpha, beta: prior.beta },
  };
  const failed = guards(config.policy, filled).find((g) => !g.ok);
  if (failed !== undefined) throw new InvalidBanditConfigError(failed.message);
  return { ...config, ...filled };
}
