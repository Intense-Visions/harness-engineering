import type { SprtConfig } from '@harness-engineering/types';

import { InvalidSprtConfigError } from './errors.js';

/** One validation rule: `ok` false means the config is rejected with `message`. */
interface Guard {
  ok: boolean;
  message: string;
}

/** NaN fails every comparison, so each predicate rejects NaN as well as the out-of-range values. */
const inOpenUnitInterval = (x: number): boolean => x > 0 && x < 1;
const positiveInteger = (x: number): boolean => Number.isInteger(x) && x > 0;

/** The declared error rates alone: everything `waldBounds` depends on. */
export type SprtErrorRates = Pick<SprtConfig, 'alpha' | 'beta'>;

function errorRateGuards({ alpha, beta }: SprtErrorRates): readonly Guard[] {
  return [
    { ok: inOpenUnitInterval(alpha), message: `alpha must be in (0, 1), got ${String(alpha)}` },
    { ok: inOpenUnitInterval(beta), message: `beta must be in (0, 1), got ${String(beta)}` },
    {
      ok: alpha + beta < 1,
      message: `alpha + beta must be < 1 so that the Wald bounds satisfy A > B, got ${String(alpha)} + ${String(beta)}`,
    },
  ];
}

function guards(config: SprtConfig): readonly Guard[] {
  const { p0, p1, maxN } = config;
  return [
    ...errorRateGuards(config),
    { ok: inOpenUnitInterval(p0), message: `p0 must be in (0, 1), got ${String(p0)}` },
    { ok: inOpenUnitInterval(p1), message: `p1 must be in (0, 1), got ${String(p1)}` },
    { ok: p0 !== p1, message: `p0 and p1 must differ, got ${String(p0)} for both` },
    {
      ok: maxN === undefined || positiveInteger(maxN),
      message: `maxN must be a positive integer when present, got ${String(maxN)}`,
    },
  ];
}

/**
 * Validate an `SprtConfig` once, at construction (spec "Error handling").
 * `createSprt` calls this; a consumer that wants the throw at its own
 * construction time calls it directly. There are no defaults to fill, so the
 * result is a copy of the input. The `alpha + beta < 1` rule is additive to
 * the spec's enumerated bounds: it is exactly the condition for A > B, without
 * which one observation could satisfy both stopping rules at once.
 */
export function validateSprtConfig(config: SprtConfig): SprtConfig {
  throwFirstFailed(guards(config));
  return { ...config };
}

/**
 * The `alpha` / `beta` subset of the rules, for `waldBounds`: a report on a bad
 * pair throws the same `InvalidSprtConfigError` as `createSprt` would, instead
 * of returning `±Infinity` (alpha 0) or `NaN` (alpha above 1) silently.
 */
export function validateErrorRates(rates: SprtErrorRates): SprtErrorRates {
  throwFirstFailed(errorRateGuards(rates));
  return { alpha: rates.alpha, beta: rates.beta };
}

function throwFirstFailed(rules: readonly Guard[]): void {
  const failed = rules.find((g) => !g.ok);
  if (failed !== undefined) throw new InvalidSprtConfigError(failed.message);
}
