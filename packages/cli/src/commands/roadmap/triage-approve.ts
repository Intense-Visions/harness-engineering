// packages/cli/src/commands/roadmap/triage-approve.ts
//
// Roadmap Auto-Triage — Phase 3, Task 4: the batched human go/no-go (`triage approve`).
//
// This is the ratchet stage-1 surface: a human reviews the READY candidates (Phase-2
// spec-bearing items whose re-score is dispatchable) and explicitly approves a subset. The
// approved subset flows through the PURE gate (`resolveGoNoGo`) and then the MARKER
// (`markApprovedForDispatch`) — which makes them eligible for the EXISTING orchestrator
// pickup. There is NO new dispatch path here: `triage approve` only marks; the orchestrator
// loop dispatches on its next tick through unchanged gating.
//
// This module holds the PURE core (ready-candidate derivation + approval partition) so it is
// unit-testable offline; the command action (in triage.ts) wires the roadmap store + the
// prediction writer and calls the marker.

import type { ScopeTier } from '@harness-engineering/types';
import {
  detectScopeTier,
  artifactPresenceFromIssue,
  type TriageMarkItem,
} from '@harness-engineering/orchestrator';
import {
  resolveGoNoGoStaged,
  resolveStage,
  dispatchableShapeKey,
  V1_MAX_STAGE,
  type StagedGoNoGoCandidate,
  type RatchetStage,
  type RatchetOutcome,
} from '@harness-engineering/intelligence';
import type { BrainstormReportRow } from './triage-feature.js';
import { featureToIssue, isActionable } from './triage-feature.js';
import type { Roadmap } from '@harness-engineering/types';

/**
 * A candidate ready for the human go/no-go: a Phase-2 brainstorm that COMPLETED with a
 * written spec AND whose re-score came back dispatchable. Everything the marker needs is
 * carried here so the approval step is a pure partition over this list.
 */
export interface ReadyCandidate {
  externalId: string;
  featureName: string;
  specPath: string;
  /** The item's escalation category (derived via the shipped `detectScopeTier`). */
  category: ScopeTier;
  /** The re-score verdict (the prediction to record on approval). */
  level: 'trivial' | 'simple' | 'moderate' | 'complex';
  confidence: 'high' | 'medium' | 'low';
  signals: Record<string, number | boolean | string>;
  source: 'static' | 'llm-tiebreak' | 'escalated';
  scopeEstimate: number;
  labels: readonly string[];
}

/**
 * Derive the READY candidates from the brainstorm report rows + the roadmap (for labels +
 * scope-tier detection). A row qualifies iff it completed with a spec path AND its re-score
 * is dispatchable — the pre-conditions for even being ELIGIBLE for a human go. Non-actionable
 * or halted rows are dropped. The scope-tier is derived with the SAME `detectScopeTier` the
 * orchestrator uses (SC3 category source), reading the item's labels + (now-attached) spec.
 */
export function deriveReadyCandidates(
  rows: readonly BrainstormReportRow[],
  roadmap: Roadmap
): ReadyCandidate[] {
  const featureByExternalId = new Map(
    roadmap.milestones
      .flatMap((m) => m.features)
      .filter((f) => f.externalId != null)
      .map((f) => [f.externalId as string, f])
  );

  const ready: ReadyCandidate[] = [];
  for (const row of rows) {
    if (row.result.outcome.kind !== 'completed') continue;
    if (!row.result.specPath) continue;
    const rescore = row.result.rescore;
    if (!rescore || !rescore.dispatchable) continue;

    const feature = featureByExternalId.get(row.externalId);
    if (!feature || !isActionable(feature)) continue;

    // Derive the scope tier from the item as it will look to the orchestrator: with the spec
    // now present (guided-change) unless a `scope:` label overrides it (e.g. scope:quick-fix).
    const issue = featureToIssue({ ...feature, spec: row.result.specPath });
    const category = detectScopeTier(issue, artifactPresenceFromIssue(issue));

    const v = rescore.verdict;
    ready.push({
      externalId: row.externalId,
      featureName: feature.name,
      specPath: row.result.specPath,
      category,
      level: v.level,
      confidence: v.confidence,
      signals: v.signals,
      source: v.source,
      // scopeEstimate: the resolved-entity blast radius from the scope lever, when present.
      scopeEstimate: scopeEstimateOf(rescore),
      // Roadmap features carry no labels today, so this is always `[]`. The shapeKey
      // buckets on empty labels for now (Phase-4 calibration note): if/when labels land,
      // this is the single place to feed them into the precedent/ratchet bucket.
      labels: [],
    });
  }
  return ready;
}

/** Extract the predicted blast radius from the re-score's scope lever (0 when unresolved). */
function scopeEstimateOf(rescore: BrainstormReportRow['result']['rescore']): number {
  const scope = rescore?.levers.scope.value;
  if (scope && scope !== 'unknown') return scope.blastRadius;
  return 0;
}

/** The result of partitioning ready candidates by an explicit human-approval set. */
export interface ApprovalPlan {
  /** Items the human approved AND the gate cleared — handed to the marker. */
  toMark: TriageMarkItem[];
  /**
   * Every candidate the gate did NOT clear, each with the gate's legible reason. Covers
   * both the not-yet-approved auto-executable items (`awaiting-human-go`) and the approved
   * items whose category is not auto-executable (`not-auto-executable`), plus any item whose
   * evidence-derived stage is deferred post-v1 (`ratchet-stage-unsupported`, unreachable given
   * the ≤ 2 clamp but kept as a fail-safe).
   */
  held: Array<{ externalId: string; reason: string }>;
}

/**
 * The precedent bucket for a ready candidate — the SAME shapeKey the marker records the
 * prediction under, via the shared `dispatchableShapeKey` helper so this gate's bucket and the
 * marker's recorded bucket can never drift (FOLLOW-UP 2). `r.level` is the probe's verdict.level
 * (threaded through the ReadyCandidate), the identical level source the marker/probe use.
 */
function shapeKeyForCandidate(r: ReadyCandidate): string {
  return dispatchableShapeKey(r.labels, r.level);
}

/**
 * Resolve the EVIDENCE-DERIVED effective stage for a shape (SC6):
 *   `effectiveStage = min(resolveStage(historyForShape), configuredCeiling, 2)`.
 *
 * `resolveStage` returns the stage the shape's recorded history has EARNED (cold-start /
 * no-history ⇒ 1). The configured `ratchetStage` is a CEILING — an operator can hold the
 * ratchet lower than the evidence would allow, never higher. `V1_MAX_STAGE` (2) is the hard
 * cap regardless. Exported for the pinning tests.
 */
export function resolveEffectiveStage(
  history: readonly RatchetOutcome[],
  ceiling: RatchetStage
): 1 | 2 {
  const earned = resolveStage(history); // 1 | 2 (already v1-clamped inside)
  return Math.min(earned, ceiling, V1_MAX_STAGE) as 1 | 2;
}

/**
 * Pure approval partition with a PER-SHAPE evidence-derived stage (SC6). Given the ready
 * candidates, the set of externalIds a human explicitly approved, the configured stage CEILING,
 * and a `historyForShape` seam (this shape's recorded outcomes from the store), run the gate.
 *
 * The AUTHORIZATION is UNCHANGED and stage-independent (the invariant FIX 2 must not weaken): an
 * approved-but-not-auto-executable item is still HELD (SC3), an unapproved auto-executable item
 * is HELD as `awaiting-human-go` (SC4/SC5). The stage does NOT relax the human-go requirement —
 * it rides along on the approved item (`effectiveStage`, stamped onto the prediction) to govern
 * downstream match-handling/advancement only. Each shape advances INDEPENDENTLY: the stage is
 * resolved per-candidate from its OWN shape's history, never as one batch stage. Cold-start (no
 * history for a shape) ⇒ stage 1 ⇒ identical to the Phase-3 static default.
 *
 * `historyForShape` defaults to "no history" (⇒ every shape resolves stage 1) so offline callers
 * and tests get the cold-start default without wiring a store.
 */
export function buildApprovalPlan(
  ready: readonly ReadyCandidate[],
  opts: {
    approvedIds: ReadonlySet<string>;
    approveAll?: boolean;
    /** The configured ratchet stage — used ONLY as a ceiling on the evidence-derived stage. */
    stage: RatchetStage;
    /** This shape's recorded graded outcomes (from the store). Absent ⇒ cold-start (stage 1). */
    historyForShape?: (shapeKey: string) => readonly RatchetOutcome[];
  }
): ApprovalPlan {
  const historyForShape = opts.historyForShape ?? (() => []);

  const candidates: StagedGoNoGoCandidate[] = ready.map((r) => ({
    externalId: r.externalId,
    category: r.category,
    humanApproved: opts.approveAll === true || opts.approvedIds.has(r.externalId),
    // Per-shape evidence-derived stage, ceilinged by config + hard-capped at 2 (SC6).
    effectiveStage: resolveEffectiveStage(historyForShape(shapeKeyForCandidate(r)), opts.stage),
  }));

  const decision = resolveGoNoGoStaged(candidates);
  const byId = new Map(ready.map((r) => [r.externalId, r]));

  const toMark: TriageMarkItem[] = decision.approved.map((c) => {
    const r = byId.get(c.externalId)!;
    return {
      candidate: c,
      featureName: r.featureName,
      specPath: r.specPath,
      labels: r.labels,
      verdict: { level: r.level, confidence: r.confidence, signals: r.signals, source: r.source },
      scopeEstimate: r.scopeEstimate,
      // The per-shape earned stage the marker stamps onto the prediction (SC6).
      effectiveStage: c.effectiveStage,
    };
  });

  const held = decision.held.map((h) => ({ externalId: h.externalId, reason: h.reason }));

  return { toMark, held };
}
