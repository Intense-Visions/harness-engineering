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
  resolveGoNoGo,
  type GoNoGoCandidate,
  type RatchetStage,
} from '@harness-engineering/intelligence';
import type { BrainstormReportRow } from './triage.js';
import { featureToIssue, isActionable } from './triage.js';
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
   * items whose category is not auto-executable (`not-auto-executable`), plus the whole
   * batch when the ratchet is not at stage 1 (`ratchet-stage-unsupported`).
   */
  held: Array<{ externalId: string; reason: string }>;
}

/**
 * Pure approval partition. Given the ready candidates and the set of externalIds a human
 * explicitly approved (plus `approveAll`), run the stage-1 gate and produce the marker inputs.
 *
 * The gate is the authority: an approved-but-not-auto-executable item is still HELD (SC3), an
 * unapproved auto-executable item is HELD as `awaiting-human-go` (SC4/SC5), and any stage but
 * 1 refuses the whole batch. `approveAll` sets `humanApproved` on every ready candidate — still
 * subject to the category gate.
 */
export function buildApprovalPlan(
  ready: readonly ReadyCandidate[],
  opts: { approvedIds: ReadonlySet<string>; approveAll?: boolean; stage: RatchetStage }
): ApprovalPlan {
  const candidates: GoNoGoCandidate[] = ready.map((r) => ({
    externalId: r.externalId,
    category: r.category,
    humanApproved: opts.approveAll === true || opts.approvedIds.has(r.externalId),
  }));

  const decision = resolveGoNoGo(candidates, opts.stage);
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
    };
  });

  const held = decision.held.map((h) => ({ externalId: h.externalId, reason: h.reason }));

  return { toMark, held };
}
