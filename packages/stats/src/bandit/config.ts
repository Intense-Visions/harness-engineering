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

/**
 * Validate a config once, at construction (spec "Error handling"). `choose`
 * and `fold` call this on every invocation; a consumer that wants the throw at
 * its own construction time calls it directly and keeps the result.
 */
export function resolveBanditConfig(config: BanditConfig): ResolvedBanditConfig {
  const scoutFraction = config.scoutFraction ?? DEFAULT_SCOUT_FRACTION;
  const prior = config.prior ?? DEFAULT_PRIOR;
  if (!(scoutFraction >= 0 && scoutFraction <= 1)) {
    throw new InvalidBanditConfigError(
      `scoutFraction must be in [0, 1], got ${String(scoutFraction)}`
    );
  }
  if (!(config.halfLifeDays > 0)) {
    throw new InvalidBanditConfigError(
      `halfLifeDays must be > 0, got ${String(config.halfLifeDays)}`
    );
  }
  if (!(config.minEffectiveN >= 0)) {
    throw new InvalidBanditConfigError(
      `minEffectiveN must be >= 0, got ${String(config.minEffectiveN)}`
    );
  }
  if (!(prior.alpha > 0 && prior.beta > 0)) {
    throw new InvalidBanditConfigError(
      `prior alpha and beta must be > 0, got ${String(prior.alpha)}/${String(prior.beta)}`
    );
  }
  return { ...config, scoutFraction, prior: { alpha: prior.alpha, beta: prior.beta } };
}
