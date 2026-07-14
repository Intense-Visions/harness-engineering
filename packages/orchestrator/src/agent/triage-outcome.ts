// packages/orchestrator/src/agent/triage-outcome.ts
//
// Roadmap Auto-Triage — Phase 4, Task 3: post-diff signal extraction + the closed loop.
//
// This is the orchestrator half of the retrospective (the pure comparator/ratchet live
// in intelligence). It does four things, all default-off-safe:
//   1. Derives post-diff ComplexitySignals (filesTouched / layersTouched / blastRadius)
//      from the introduced diff hunks (the SAME merge-base-relative, seed-excluded diff
//      the 4c quality feeder already consumes).
//   2. Runs `classify(..., phase:'post-diff')` at full strength (confidence may reach
//      `high` — the pre-diff S3-001 cap does not apply to the ground-truth diff).
//   3. Compares the actual verdict to the stored pre-dispatch prediction via the pure
//      `compareToPrediction` — match ⇒ verify, mismatch/absent ⇒ block-escalate (SC7).
//   4. Records the graded `{ actual, exceededBy, matched }` outcome to the Phase-0
//      TriageRecord store, closing the loop so the precedent lever returns real
//      base-rates (SC5).
//
// It also implements the REAL `PrecedentLookup` over recorded outcomes — the seam
// Phase 1 stubbed to degrade-empty. `precedentLookupFromStored` bridges core's
// StoredTriageRecord into intelligence's `aggregatePrecedent`, so cold-start returns
// `unknown` and accumulated outcomes return a measured rate.
//
// Layer note: orchestrator wiring — imports intelligence (pure classify/comparator/
// aggregatePrecedent) and consumes core's stored-record shape structurally. All IO
// (git diff, store append/load) is injected so the core logic is pure + unit-testable.

import {
  classify,
  compareToPrediction,
  aggregatePrecedent,
} from '@harness-engineering/intelligence';
import type {
  ComplexitySignals,
  RetrospectiveComparison,
  TriagePrediction,
  PrecedentLookup,
  PrecedentRate,
} from '@harness-engineering/intelligence';
import type { ComplexityVerdict } from '@harness-engineering/types';
import type { IntroducedHunk } from './quality-verdict.js';

/** The minimal stored-record shape the precedent aggregation reads (structural mirror). */
export interface StoredOutcomeRecord {
  shapeKey: string;
  outcome?: { matched: boolean };
}

/**
 * Derive post-diff `ComplexitySignals` from the introduced diff hunks. `filesTouched`
 * is the count of DISTINCT changed files; `layersTouched` is a conservative proxy — the
 * number of distinct top-level source segments the changed files span (e.g.
 * `packages/<pkg>/src/<layer>/…` → `<layer>`), clamped so it never fabricates breadth;
 * `blastRadius` is the total introduced (added) line count, a cheap, monotonic
 * ground-truth proxy for change size. The text-only fields carry through unchanged
 * (they were true pre-diff and remain true).
 */
export function signalsFromDiff(
  hunks: readonly IntroducedHunk[],
  textOnly: Pick<ComplexitySignals, 'descriptionLength' | 'specExists' | 'acceptanceMeasurable'>
): ComplexitySignals {
  const files = new Set<string>();
  const layers = new Set<string>();
  let addedLines = 0;
  for (const h of hunks) {
    files.add(h.file);
    layers.add(layerOfPath(h.file));
    // addedContent is the joined added lines; count them (empty string ⇒ 0 lines).
    addedLines += h.addedContent === '' ? 0 : h.addedContent.split('\n').length;
  }
  return {
    ...textOnly,
    filesTouched: files.size,
    layersTouched: layers.size,
    blastRadius: addedLines,
  };
}

/**
 * Map a repo-relative path to a coarse architectural-layer token. For the monorepo
 * convention `packages/<pkg>/src/<layer>/…` the `<layer>` segment is used; otherwise the
 * path's first meaningful directory is used. Deterministic + dependency-free — a proxy
 * for `layersTouched`, not a graph-grounded blast radius (which the pre-diff scope lever
 * owns). Files at the repo root bucket under `<root>`.
 */
export function layerOfPath(file: string): string {
  const parts = file.split('/').filter((p) => p.length > 0);
  if (parts.length === 0) return '<root>';
  if (parts[0] === 'packages' && parts.length >= 4 && parts[2] === 'src') {
    // packages/<pkg>/src/<layer>/... → the <layer> segment.
    return `${parts[1] ?? ''}/${parts[3] ?? ''}`;
  }
  return parts.length === 1 ? '<root>' : (parts[0] ?? '<root>');
}

/** Everything the retrospective needs, with all IO injected (pure core, testable). */
export interface RetrospectiveDeps {
  /** The introduced diff hunks (merge-base-relative, seed-excluded). */
  hunks: readonly IntroducedHunk[];
  /** Text-only signals known pre-diff (carried through into the post-diff classify). */
  textOnly: Pick<ComplexitySignals, 'descriptionLength' | 'specExists' | 'acceptanceMeasurable'>;
  /** The stored pre-dispatch prediction to grade against (absent ⇒ block-escalate, SC7). */
  prediction: TriagePrediction | undefined;
  /** Whether the unit's risk band is high (feeds the classifier's standard-tier tie-break). */
  riskHigh: boolean;
  /** Prompt for the optional LLM tie-break (title + description). */
  prompt: string;
}

/** The graded retrospective result: the post-diff verdict + the comparison. */
export interface RetrospectiveResult {
  /** Full-strength post-diff verdict on the ACTUAL diff (confidence may reach `high`). */
  actual: ComplexityVerdict;
  /** The comparator's verdict: matched/exceededBy/action. */
  comparison: RetrospectiveComparison;
}

/**
 * Run the post-diff retrospective for one unit: derive signals → classify(post-diff) →
 * compare to the stored prediction. Pure over the injected inputs (the classifier runs
 * static-only when no `provider` is supplied). Recording is a SEPARATE step
 * ({@link buildTriageOutcomeInput}) so this stays a pure decision function.
 */
export async function runRetrospective(
  deps: RetrospectiveDeps,
  provider?: Parameters<typeof classify>[1]
): Promise<RetrospectiveResult> {
  const signals = signalsFromDiff(deps.hunks, deps.textOnly);
  const actual = await classify(
    { signals, phase: 'post-diff', riskHigh: deps.riskHigh, prompt: deps.prompt },
    provider
  );
  const comparison = compareToPrediction(deps.prediction, actual);
  return { actual, comparison };
}

/** The record payload for the graded outcome — handed to `recordTriageOutcome`. */
export interface TriageOutcomeInputLike {
  externalId: string;
  shapeKey: string;
  actual: ComplexityVerdict;
  exceededBy: number;
  matched: boolean;
}

/**
 * Build the `triage_outcome` record payload from a graded result. The `shapeKey` is the
 * SAME one the prediction used (so the precedent lever aggregates prediction+outcome
 * like-for-like) — the caller passes it through from the loaded prediction record.
 */
export function buildTriageOutcomeInput(
  externalId: string,
  shapeKey: string,
  result: RetrospectiveResult
): TriageOutcomeInputLike {
  return {
    externalId,
    shapeKey,
    actual: result.actual,
    exceededBy: result.comparison.exceededBy,
    matched: result.comparison.matched,
  };
}

/**
 * The REAL `PrecedentLookup` (SC5) — closes the Phase-1 degrade-empty stub. Aggregates
 * the autonomous-success base-rate over recorded outcomes sharing a `shapeKey` via the
 * pure `aggregatePrecedent`. Bridges core's `StoredTriageRecord` (whose `outcome` slice
 * is structurally `{ matched }` for aggregation purposes) into the intelligence
 * aggregation. With no outcome-bearing records for a shape it returns `unknown` — the
 * exact Phase-1 cold-start behavior, now real once outcomes accrue.
 */
export function precedentLookupFromStored(
  records: readonly StoredOutcomeRecord[]
): PrecedentLookup {
  // aggregatePrecedent reads only `shapeKey` + `outcome.matched`; map to that minimal
  // shape so a core StoredTriageRecord never needs the full intelligence TriageRecord.
  const bridged = records.map((r) => ({
    externalId: '',
    shapeKey: r.shapeKey,
    ts: '',
    ...(r.outcome
      ? { outcome: { actual: undefined as never, exceededBy: 0, matched: r.outcome.matched } }
      : {}),
  }));
  return {
    rateForShape: (shapeKey: string): PrecedentRate => aggregatePrecedent(bridged, shapeKey),
  };
}
