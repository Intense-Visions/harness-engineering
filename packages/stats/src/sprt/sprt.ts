/**
 * Bernoulli sequential probability ratio test (spec "SPRT", D10). Pure
 * functions over a caller-fed observation stream: no ledger, no clock, no rng.
 * `createSprt(config)` validates once; each `observe(x)` adds one Bernoulli
 * log-likelihood-ratio term and compares the running total with Wald's bounds.
 */
import type { SprtConfig, SprtVerdict } from '@harness-engineering/types';

import { validateSprtConfig } from './config.js';

/** One Bernoulli outcome: `1` / `true` is a success under both hypotheses' `p`. */
export type SprtObservation = 0 | 1 | boolean;

/** Wald's stopping bounds: `upper` = A = ln((1 − β) / α), `lower` = B = ln(β / (1 − α)). */
export interface WaldBounds {
  upper: number;
  lower: number;
}

/** Snapshot of a running test: cumulative LLR, observations consumed, current verdict. */
export interface SprtState {
  llr: number;
  n: number;
  verdict: SprtVerdict;
}

export interface Sprt {
  /** Feed one observation; returns the verdict after it. A terminal verdict is sticky. */
  observe(x: SprtObservation): SprtVerdict;
  /** A fresh snapshot on every read; mutating it does not touch the test. */
  readonly state: SprtState;
}

/** Wald's bounds for the declared error rates; `p0`, `p1`, `maxN` play no part. */
export function waldBounds({ alpha, beta }: Pick<SprtConfig, 'alpha' | 'beta'>): WaldBounds {
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

/** Wald's rule with inclusive bounds: reaching A rejects h0 (favor h1), reaching B accepts it. */
function verdictAt(llr: number, bounds: WaldBounds): SprtVerdict {
  if (llr >= bounds.upper) return 'reject';
  if (llr <= bounds.lower) return 'accept';
  return 'continue';
}

/**
 * Build one test. Throws `InvalidSprtConfigError` at construction; nothing on
 * the `observe` path throws.
 */
export function createSprt(config: SprtConfig): Sprt {
  const resolved = validateSprtConfig(config);
  const bounds = waldBounds(resolved);
  const terms = llrTerms(resolved);
  let llr = 0;
  let n = 0;
  let verdict: SprtVerdict = 'continue';
  return {
    observe(x) {
      llr += x === 1 || x === true ? terms.success : terms.failure;
      n += 1;
      verdict = verdictAt(llr, bounds);
      return verdict;
    },
    get state(): SprtState {
      return { llr, n, verdict };
    },
  };
}
