// packages/intelligence/src/triage/retrospective.ts
//
// Roadmap Auto-Triage — Phase 4, Task 1: the pure prediction-vs-actual comparator.
//
// The system's honesty check (plan §Concerns): given the pre-diff prediction Phase 3
// stored and the full-strength post-diff verdict on the ACTUAL diff, decide whether
// the diff STAYED WITHIN what was predicted (`matched` ⇒ `verify`) or EXCEEDED it
// (`!matched` ⇒ `block-escalate`). "Exceeded" is defined numerically (SC2):
//   - the actual complexity level landed ≥ 1 band OVER the predicted level, OR
//   - the actual blast radius blew past the predicted-scope threshold.
// Coming in SIMPLER/SMALLER than predicted is NOT a mispredict (the item was easier
// than feared) — only over-scope trips the block.
//
// Fail-safe (SC7, plan §Concerns): a missing, garbled, or invalid prediction/actual
// is treated as a MISMATCH (`block-escalate`), never a silent pass. Biasing toward
// flagging is deliberate — a false mismatch costs a human review; a false match ships
// an under-scrutinized change and advances the ratchet on false evidence.
//
// Layer note: pure, intelligence-only. Imports @harness-engineering/types
// (ComplexityVerdict / ComplexityLevel) + the local Phase-0 sibling (TriagePrediction).
// No IO, no core/orchestrator import — exhaustively unit-testable without a review run.

import type { ComplexityLevel, ComplexityVerdict } from '@harness-engineering/types';
import type { TriagePrediction } from './record.js';

/** Ordinal rank of each complexity band; a positive delta = the diff came in harder. */
export const LEVEL_RANK: Record<ComplexityLevel, number> = {
  trivial: 0,
  simple: 1,
  moderate: 2,
  complex: 3,
};

/**
 * Blast-radius overrun tolerance. The actual blast radius may exceed the predicted
 * scope estimate by up to `BLAST_TOLERANCE_FACTOR×` PLUS `BLAST_TOLERANCE_ABS` before
 * it counts as over-scope. The additive floor keeps a tiny predicted scope (e.g. 1–2)
 * from tripping on ordinary noise; the factor bounds the overrun on larger estimates.
 * Conservative on purpose (plan §Concerns: bias `exceededBy` toward flagging).
 */
export const BLAST_TOLERANCE_FACTOR = 1.5;
export const BLAST_TOLERANCE_ABS = 2;

/** The comparator's verdict for one graded item. */
export interface RetrospectiveComparison {
  /** True iff the actual diff stayed WITHIN the predicted band + scope (SC2). */
  matched: boolean;
  /**
   * Mispredict magnitude. `0` when matched. When over-scope it is the level-band
   * delta (≥ 1) when the level exceeded, else `1` for a blast-only overrun — always
   * a positive integer so a graded outcome carries a legible severity.
   */
  exceededBy: number;
  /** `verify` on a match (surface for human verify per stage); `block-escalate` on a mismatch/error. */
  action: 'verify' | 'block-escalate';
}

/** A block-escalate verdict of the given severity (default 1 = the minimum over-scope). */
function blockEscalate(exceededBy = 1): RetrospectiveComparison {
  return { matched: false, exceededBy: Math.max(1, exceededBy), action: 'block-escalate' };
}

/** Guard: a value that is a known ComplexityLevel (never trust a stray/LLM-set string). */
function isLevel(value: unknown): value is ComplexityLevel {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(LEVEL_RANK, value);
}

/** Read a numeric blast-radius signal from a verdict, or `undefined` when absent/non-numeric. */
function blastRadiusOf(verdict: ComplexityVerdict): number | undefined {
  const raw = verdict.signals?.blastRadius;
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : undefined;
}

/**
 * Compare the stored pre-diff prediction to the full-strength post-diff verdict.
 *
 * Returns `{ matched, exceededBy, action }`. Match ⇒ `verify`; mismatch ⇒
 * `block-escalate`. A missing/garbled/invalid prediction OR actual fails safe to
 * `block-escalate` (SC7) — absence is never a pass.
 */
export function compareToPrediction(
  prediction: TriagePrediction | undefined | null,
  postDiffVerdict: ComplexityVerdict | undefined | null
): RetrospectiveComparison {
  // SC7 fail-safe: any missing/garbled input is a mismatch, never a silent pass.
  if (prediction == null || postDiffVerdict == null) return blockEscalate();
  const predictedLevel = prediction.verdict?.level;
  const actualLevel = postDiffVerdict.level;
  if (!isLevel(predictedLevel) || !isLevel(actualLevel)) return blockEscalate();

  // SC2a: level-band overrun. Coming in at or below the predicted band is fine
  // (the diff was as easy as, or easier than, predicted). A positive delta trips it.
  const levelDelta = LEVEL_RANK[actualLevel] - LEVEL_RANK[predictedLevel];
  if (levelDelta >= 1) return blockEscalate(levelDelta);

  // SC2b: blast-radius overrun at the same-or-lower band. The predicted scope is the
  // scopeEstimate the scope lever produced pre-diff; the actual is the post-diff
  // blast-radius signal. When the actual signal is absent we cannot judge scope, so
  // fall through to a level-only match (do NOT fabricate a block from missing data).
  const predictedScope =
    typeof prediction.scopeEstimate === 'number' && Number.isFinite(prediction.scopeEstimate)
      ? prediction.scopeEstimate
      : 0;
  const actualBlast = blastRadiusOf(postDiffVerdict);
  if (actualBlast !== undefined) {
    const threshold = predictedScope * BLAST_TOLERANCE_FACTOR + BLAST_TOLERANCE_ABS;
    if (actualBlast > threshold) return blockEscalate();
  }

  return { matched: true, exceededBy: 0, action: 'verify' };
}
