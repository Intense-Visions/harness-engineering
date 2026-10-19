/**
 * Bernoulli sequential probability ratio test (spec "SPRT", D10). Pure
 * functions over a caller-fed observation stream: no ledger, no clock, no rng.
 * `createSprt(config)` validates once; each `observe(x)` adds one Bernoulli
 * log-likelihood-ratio term and compares the running total with Wald's bounds.
 */
import type { SprtConfig, SprtVerdict } from '@harness-engineering/types';

import { validateErrorRates, validateSprtConfig, type SprtErrorRates } from './config.js';
import { InvalidSprtObservationError } from './errors.js';

/**
 * One Bernoulli outcome. Exactly `1` or `true` is a success under both
 * hypotheses' `p`; exactly `0` or `false` is a failure. Nothing else is an
 * observation: `observe` throws `InvalidSprtObservationError` for any other
 * value instead of coercing it.
 */
export type SprtObservation = 0 | 1 | boolean;

function isObservation(x: unknown): x is SprtObservation {
  return x === 0 || x === 1 || x === true || x === false;
}

/** Wald's stopping bounds: `upper` = A = ln((1 − β) / α), `lower` = B = ln(β / (1 − α)). */
export interface WaldBounds {
  upper: number;
  lower: number;
}

/** Snapshot of a running test: cumulative LLR, observations consumed, successes among them, current verdict. */
export interface SprtState {
  llr: number;
  n: number;
  successes: number;
  verdict: SprtVerdict;
}

export interface Sprt {
  /** Feed one observation; returns the verdict after it. A terminal verdict is sticky. */
  observe(x: SprtObservation): SprtVerdict;
  /** A fresh snapshot on every read; mutating it does not touch the test. */
  readonly state: SprtState;
}

/**
 * Wald's bounds for the declared error rates; `p0`, `p1`, `maxN` play no part.
 * Runs the same `alpha` / `beta` guards as `createSprt` and throws
 * `InvalidSprtConfigError` on a bad pair, so a report never prints `Infinity` or `NaN`.
 */
export function waldBounds(rates: SprtErrorRates): WaldBounds {
  const { alpha, beta } = validateErrorRates(rates);
  return { upper: Math.log((1 - beta) / alpha), lower: Math.log(beta / (1 - alpha)) };
}

/** Per-observation LLR terms: a success adds ln(p1 / p0), a failure adds ln((1 − p1) / (1 − p0)). */
interface LlrTerms {
  success: number;
  failure: number;
}

function llrTerms({ p0, p1 }: SprtConfig): LlrTerms {
  return { success: Math.log(p1 / p0), failure: Math.log((1 - p1) / (1 - p0)) };
}

/**
 * Count-based LLR: two multiplies and one add, so the rounding error is a few
 * ulps whatever `n` is, where repeated `llr += term` would grow it linearly.
 * For n = 1 this is `1 · term + 0 · other = term` exactly, so the exact-bound
 * and tie fixtures behave as under repeated addition.
 */
function llrOf(terms: LlrTerms, n: number, successes: number): number {
  return successes * terms.success + (n - successes) * terms.failure;
}

/** Wald's rule with inclusive bounds: reaching A rejects h0 (favor h1), reaching B accepts it. */
function verdictAt(llr: number, bounds: WaldBounds): SprtVerdict {
  if (llr >= bounds.upper) return 'reject';
  if (llr <= bounds.lower) return 'accept';
  return 'continue';
}

/**
 * `maxN` resolution: whichever hypothesis the LLR currently favors. An LLR of
 * exactly 0 favors neither, so h0 keeps the benefit of the doubt (`accept`):
 * rejecting the null takes evidence, and 0 is none.
 */
function forcedVerdict(llr: number): SprtVerdict {
  return llr > 0 ? 'reject' : 'accept';
}

/**
 * Build one test. Throws `InvalidSprtConfigError` at construction; on the
 * `observe` path only an out-of-domain value throws (`InvalidSprtObservationError`,
 * checked before anything else so the state never moves). Once the verdict
 * leaves `continue` it is sticky: later observations are ignored (not
 * accumulated) and the same terminal verdict is returned, so `state.n` stays
 * the stopping time and a caller can feed a whole stream without guarding every
 * call. With `maxN`, the `maxN`-th observation that would still `continue` is
 * resolved by `forcedVerdict`.
 */
export function createSprt(config: SprtConfig): Sprt {
  const resolved = validateSprtConfig(config);
  const bounds = waldBounds(resolved);
  const terms = llrTerms(resolved);
  let llr = 0;
  let n = 0;
  let successes = 0;
  let verdict: SprtVerdict = 'continue';
  return {
    observe(x) {
      if (!isObservation(x)) throw new InvalidSprtObservationError(x);
      if (verdict !== 'continue') return verdict;
      n += 1;
      if (x === 1 || x === true) successes += 1;
      llr = llrOf(terms, n, successes);
      verdict = verdictAt(llr, bounds);
      if (verdict === 'continue' && resolved.maxN !== undefined && n >= resolved.maxN) {
        verdict = forcedVerdict(llr);
      }
      return verdict;
    },
    get state(): SprtState {
      return { llr, n, successes, verdict };
    },
  };
}
