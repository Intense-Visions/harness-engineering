// packages/intelligence/src/triage/record.ts
//
// Roadmap Auto-Triage — Phase 0, Contract 1: the shared triage record data model.
//
// One record per roadmap item, keyed by its stable `externalId`
// (packages/core/src/roadmap/parse.ts:233). It accretes across the pipeline; each
// phase writes its own slice and never rewrites another's:
//   - Phase 3 writes `prediction` at dispatch.
//   - Phase 4 writes `outcome` at the post-diff retrospective.
// The `shapeKey` is the precedent/ratchet bucket both P1's PrecedentLookup and P4's
// ratchet aggregate by — defined here once so the two agree without coupling.
//
// Layer note: this module imports ONLY @harness-engineering/types (ComplexityVerdict,
// ComplexityLevel), which the intelligence layer is permitted to depend on. It does
// NOT import core/orchestrator.

import type { ComplexityVerdict, ComplexityLevel } from '@harness-engineering/types';

/**
 * Escalation category for a triaged item — the reason a non-dispatched item was
 * held (SC-F2's closed set) or the routing bucket a dispatched item fell into.
 * Part of the `shapeKey` so precedent base-rates aggregate like-for-like work.
 */
export type EscalationCategory =
  | 'not-in-band'
  | 'unresolved-scope'
  | 'open-decision'
  | 'halted-fork'
  | 'precedent-contradicts'
  | 'error'
  | 'dispatchable';

/** Autonomy-ratchet stage in effect at dispatch (D14). 1 = human before execution. */
export type RatchetStage = 1 | 2 | 3 | 4;

/**
 * The pre-diff prediction, written by Phase 3 at dispatch. It is the confidence-capped
 * (S3-001) claim the post-diff retrospective later grades against ground truth.
 */
export interface TriagePrediction {
  /** The pre-diff prediction being made (level + confidence-capped verdict). */
  verdict: ComplexityVerdict;
  /** Phase-1 probe lever results (scope / semantic-read / open-decisions / precedent). */
  levers: Record<string, unknown>;
  /** Predicted blast radius (estimated post-diff scope from the scope lever). */
  scopeEstimate: number;
  /** Ratchet stage in effect when this item was dispatched. */
  ratchetStage: RatchetStage;
}

/**
 * The post-diff outcome, written by Phase 4 at the retrospective. This is the only
 * gate that sees ground truth; its verdict is what feeds the precedent lever (D13).
 */
export interface TriageOutcome {
  /** Full-strength post-diff verdict on the ACTUAL diff (confidence may reach high). */
  actual: ComplexityVerdict;
  /** 0 = matched the prediction; >0 = mispredict magnitude (over-scope). */
  exceededBy: number;
  /** True when the actual diff stayed within the predicted band. */
  matched: boolean;
}

/**
 * The accreting triage record for one roadmap item. `prediction`/`outcome` are
 * absent until the owning phase writes its slice; a record with a populated
 * `outcome` is a graded, precedent-eligible record.
 */
export interface TriageRecord {
  /** Stable item key (roadmap `External-ID`). */
  externalId: string;
  /** Bucketing key for precedent/ratchet aggregation (see {@link shapeKey}). */
  shapeKey: string;
  /** Written by Phase 3 at dispatch. */
  prediction?: TriagePrediction;
  /** Written by Phase 4 at the retrospective. */
  outcome?: TriageOutcome;
  /** ISO timestamp stamped by the writer (not by shapeKey). */
  ts: string;
}

/**
 * The precedent lever (P1 injects this; P4 implements the real one). A pure read over
 * records sharing a `shapeKey` with a populated `outcome`: success rate = matched / total.
 * Absent history ⇒ `unknown` (the P1 degrade-empty path), which is simply "no records
 * for this shape yet" — never a block on emptiness.
 */
export interface PrecedentLookup {
  /**
   * Measured autonomous-success rate for the given shape, or `unknown` when no
   * outcome-bearing records exist for it (cold-start).
   */
  rateForShape(shapeKey: string): PrecedentRate;
}

/**
 * The precedent lever's result: a measured base-rate over recorded outcomes, or
 * `unknown` on cold-start (no outcome-bearing records for the shape yet).
 */
export type PrecedentRate =
  | { readonly kind: 'unknown' }
  | {
      readonly kind: 'rate';
      readonly matched: number;
      readonly total: number;
      readonly rate: number;
    };

/**
 * The bucketing key for precedent/ratchet aggregation:
 *   `sortedLabels + '|' + escalationCategory + '|' + predictedLevel`.
 *
 * Deterministic and label-order-independent: labels are de-duplicated, trimmed of
 * empties, and sorted before joining, so `['a','b']` and `['b','a']` (and
 * `['b','a','a']`) all bucket identically. This is the quiet linchpin — too coarse
 * lumps unlike work (unsafe base-rates), too fine leaves every item its own bucket
 * (precedent perpetually `unknown`). Phase 4 calibration revisits this granularity
 * first; the definition lives here so P1 and P4 never disagree.
 */
export function shapeKey(
  labels: readonly string[],
  category: EscalationCategory,
  level: ComplexityLevel
): string {
  const sortedLabels = Array.from(
    new Set(labels.map((l) => l.trim()).filter((l) => l.length > 0))
  ).sort();
  return `${sortedLabels.join(',')}|${category}|${level}`;
}
