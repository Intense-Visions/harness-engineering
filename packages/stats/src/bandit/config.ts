import type { BanditConfig } from '@harness-engineering/types';

import { InvalidBanditConfigError } from './errors.js';

/** Spec default: one pull in ten scouts under `scoutFraction`. */
export const DEFAULT_SCOUT_FRACTION = 0.1;
/** Spec default: the uniform Beta(1,1) prior. */
export const DEFAULT_PRIOR: Readonly<{ alpha: number; beta: number }> = { alpha: 1, beta: 1 };

/** A `BanditConfig` with every optional field filled and every bound checked. */
export interface ResolvedBanditConfig extends BanditConfig {
  scoutFraction: number;
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
const nonNegative = (x: number): boolean => x >= 0;
const positivePair = (pair: { alpha: number; beta: number }): boolean =>
  positive(pair.alpha) && positive(pair.beta);

function guards(
  config: BanditConfig,
  scoutFraction: number,
  prior: { alpha: number; beta: number }
): readonly Guard[] {
  return [
    {
      ok: isPolicy(config.policy),
      message: `policy must be 'scoutFraction' or 'thompson', got ${String(config.policy)}`,
    },
    {
      ok: inUnitInterval(scoutFraction),
      message: `scoutFraction must be in [0, 1], got ${String(scoutFraction)}`,
    },
    {
      ok: positive(config.halfLifeDays),
      message: `halfLifeDays must be > 0, got ${String(config.halfLifeDays)}`,
    },
    {
      ok: nonNegative(config.minEffectiveN),
      message: `minEffectiveN must be >= 0, got ${String(config.minEffectiveN)}`,
    },
    {
      ok: positivePair(prior),
      message: `prior alpha and beta must be > 0, got ${String(prior.alpha)}/${String(prior.beta)}`,
    },
  ];
}

/**
 * Validate a config once, at construction (spec "Error handling"). `choose`
 * and `fold` call this on every invocation; a consumer that wants the throw at
 * its own construction time calls it directly and keeps the result. The
 * `policy` check is additive to the spec's enumerated bounds: an unknown
 * policy string is rejected rather than silently running `scoutFraction`.
 */
export function resolveBanditConfig(config: BanditConfig): ResolvedBanditConfig {
  const scoutFraction = config.scoutFraction ?? DEFAULT_SCOUT_FRACTION;
  const prior = config.prior ?? DEFAULT_PRIOR;
  const failed = guards(config, scoutFraction, prior).find((g) => !g.ok);
  if (failed !== undefined) throw new InvalidBanditConfigError(failed.message);
  return { ...config, scoutFraction, prior: { alpha: prior.alpha, beta: prior.beta } };
}
