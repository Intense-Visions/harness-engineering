// packages/orchestrator/src/agent/triage-mark.ts
//
// Roadmap Auto-Triage — Phase 3, Task 3: the dispatch marker (the ONE orchestrator write).
//
// CRITICAL: this module does NOT dispatch. There is NO new dispatch path in Phase 3 (the
// known duplicate-dispatch hazard — see memory `orchestrator-duplicate-dispatch`). It only
// makes a human-approved item ELIGIBLE for the EXISTING orchestrator pickup loop, which then
// dispatches it through its normal gating (activeStates, claim-safety, escalation categories).
//
// "Making eligible" = two writes per approved item:
//   1. Attach the Phase-2 generated spec to the roadmap feature (+ keep an active status).
//      The PRESENCE of a spec is what clears the spec-less→human pickup gate on the item's
//      own merit (memory `orchestrator-pickup-gating`) — NOT a special bypass flag.
//   2. Record the pre-dispatch prediction to the Phase-0 TriageRecord store, keyed by
//      externalId, so Phase 4's post-diff retrospective can compare actual-vs-predicted.
//
// Safety invariants enforced here:
//   - Default-off: `!config.enabled` ⇒ complete no-op (SC7).
//   - Only approved items act; a non-approved candidate is skipped (SC5).
//   - The assignee gate is honored: an item assigned to a non-self assignee is skipped —
//     the marker NEVER steals a claim (SC6). It never sets an assignee either; the existing
//     claim loop owns that.
//
// Layer note: orchestrator wiring. Imports core (roadmap store IO + triage record writer via
// `eventSourcing`) and intelligence (the pure `shapeKey` + `GoNoGoCandidate` type). This is a
// legal orchestrator→core/intelligence direction; the pure gate stays intelligence-only.

import type { RoadmapStore, FeatureMutation } from '@harness-engineering/core';
import { slugifyFeatureName, eventSourcing } from '@harness-engineering/core';
import { dispatchableShapeKey, type GoNoGoCandidate } from '@harness-engineering/intelligence';
import type { ComplexityVerdict, RoadmapFeature, FeatureStatus } from '@harness-engineering/types';

/** The active status the marker sets/keeps so `candidate-selection` will pick the item up. */
const ELIGIBLE_STATUS: FeatureStatus = 'planned';

/**
 * One approved item to mark, bundling everything the two writes need: the go/no-go verdict
 * (must be `humanApproved`), the roadmap feature name (→ shard slug), the Phase-2 spec path
 * to attach, and the probe outputs for the prediction slice.
 */
export interface TriageMarkItem {
  /** The go/no-go candidate. Only acted on when `candidate.humanApproved` is true (SC5). */
  candidate: GoNoGoCandidate;
  /** The roadmap feature's display name — slugified to resolve its shard. */
  featureName: string;
  /** Repo-relative path to the generated spec (Phase 2 output) to attach to the feature. */
  specPath: string;
  /** Item labels (for the prediction's shapeKey bucket). */
  labels: readonly string[];
  /** The pre-diff complexity verdict from the probe (the prediction being made). */
  verdict: ComplexityVerdict;
  /** Predicted blast radius (from the scope lever) — recorded for the retrospective. */
  scopeEstimate: number;
  /**
   * The EVIDENCE-DERIVED autonomy stage this item's SHAPE earned (SC6), resolved
   * per-shape by the caller (`min(resolveStage(history), configuredCeiling, 2)`).
   * When present it is stamped onto the prediction INSTEAD of the uniform
   * `config.ratchetStage`, so the ratchet advances per-shape. Absent ⇒ the marker
   * falls back to `config.ratchetStage` (the Phase-3 uniform behavior).
   */
  effectiveStage?: 1 | 2;
}

/** The feature-flag + ratchet surface the marker reads (default-off master switch). */
export interface TriageMarkConfig {
  /** Master switch. `false` ⇒ complete no-op (SC7). */
  enabled: boolean;
  /** Ratchet stage stamped onto the prediction (Phase 3 pins 1). */
  ratchetStage: 1 | 2 | 3 | 4;
}

/** Injected prediction writer — the Phase-0 TriageRecord store's append. Fakeable in tests. */
export type RecordPrediction = (
  payload: eventSourcing.TriagePredictedInput
) => Promise<{ ok: boolean; error?: Error }>;

export interface TriageMarkDeps {
  /** The roadmap store to patch (real via `resolveRoadmapStoreForFile`, fake in tests). */
  store: RoadmapStore;
  /** Feature-flag + ratchet config. */
  config: TriageMarkConfig;
  /** Prediction writer (Phase-0 store). */
  recordPrediction: RecordPrediction;
  /**
   * The orchestrator's self-identity for the assignee gate. When provided, an item assigned
   * to anyone else is skipped (SC6). When omitted, the gate is inactive (call-sites without
   * identity — mirrors `candidate-selection.ts`'s `selfAssignee` optionality).
   */
  selfAssignee?: string | null;
}

/** Why an item was skipped rather than marked (legible, closed set). */
export type MarkSkipReason =
  /** The candidate was not human-approved (SC5) — should not reach the marker, guarded anyway. */
  | 'not-approved'
  /** The item is assigned to a non-self assignee (SC6) — never stolen. */
  | 'assigned-elsewhere'
  /** The feature was not found in the roadmap (stale externalId / renamed). */
  | 'feature-not-found';

export interface MarkSkip {
  externalId: string;
  reason: MarkSkipReason;
}

/** The marker's outcome: which items were made eligible, and which were skipped + why. */
export interface TriageMarkResult {
  /** externalIds of items successfully marked eligible (spec attached + prediction recorded). */
  marked: string[];
  /** Items intentionally not marked, each with the legible reason. */
  skipped: MarkSkip[];
}

/**
 * Mark human-approved items eligible for the existing orchestrator pickup, and record their
 * pre-dispatch predictions. Returns `Ok` with the mark/skip partition, or `Err` on the first
 * store write that fails (so a partial roadmap write surfaces rather than silently dropping).
 *
 * NOTE ON DISPATCH: nothing here dispatches. The orchestrator's own pickup loop selects the
 * now-spec-bearing, active-status item on its next tick and runs it through unchanged gating.
 */
export async function markApprovedForDispatch(
  items: readonly TriageMarkItem[],
  deps: TriageMarkDeps
): Promise<{ ok: true; value: TriageMarkResult } | { ok: false; error: Error }> {
  const { store, config, recordPrediction, selfAssignee } = deps;

  // Default-off: byte-identical behavior when the feature is not enabled (SC7).
  if (!config.enabled) {
    return { ok: true, value: { marked: [], skipped: [] } };
  }

  // Load once to resolve features by slug for the assignee gate + spec attach.
  const loaded = await store.load();
  if (!loaded.ok) return { ok: false, error: loaded.error };
  const bySlug = new Map<string, RoadmapFeature>();
  for (const m of loaded.value.milestones) {
    for (const f of m.features) bySlug.set(slugifyFeatureName(f.name), f);
  }

  const marked: string[] = [];
  const skipped: MarkSkip[] = [];

  for (const it of items) {
    const externalId = it.candidate.externalId;

    // SC5: never act on a non-approved candidate (defensive — the gate already partitions).
    if (!it.candidate.humanApproved) {
      skipped.push({ externalId, reason: 'not-approved' });
      continue;
    }

    const slug = slugifyFeatureName(it.featureName);
    const target = bySlug.get(slug);
    if (!target) {
      skipped.push({ externalId, reason: 'feature-not-found' });
      continue;
    }

    // SC6: assignee gate — skip an item held by a non-self assignee; never steal it. Mirrors
    // candidate-selection.ts:77 (self undefined ⇒ gate inactive; self set ⇒ others skipped).
    if (selfAssignee !== undefined && target.assignee != null && target.assignee !== selfAssignee) {
      skipped.push({ externalId, reason: 'assigned-elsewhere' });
      continue;
    }

    // Write 1: attach the spec + keep an active status so the EXISTING pickup selects it.
    // The marker does NOT set an assignee — the orchestrator's claim loop owns that write.
    const mutate: FeatureMutation = (f) => ({
      ...f,
      spec: it.specPath,
      status: isActiveStatus(f.status) ? f.status : ELIGIBLE_STATUS,
    });
    const patched = await store.patchFeature(slug, mutate);
    if (!patched.ok) return { ok: false, error: patched.error };

    // Write 2: record the pre-dispatch prediction to the Phase-0 TriageRecord store, keyed by
    // externalId, so Phase 4's retrospective can grade actual-vs-predicted. An approved item is
    // (by definition) dispatchable — bucket via the shared `dispatchableShapeKey` helper so the
    // recorded prediction shape and the probe's precedent-lookup shape can never drift
    // (FOLLOW-UP 2). Level is the probe's verdict.level, the SAME source the probe/approve use.
    const key = dispatchableShapeKey(it.labels, it.verdict.level);
    const prediction: eventSourcing.TriagePredictedInput = {
      externalId,
      shapeKey: key,
      verdict: it.verdict,
      // `levers` is an OPAQUE DIAGNOSTIC SNAPSHOT (the verdict's static signals), NOT the
      // typed ProbeLevers. The Phase-4 comparator grades on `verdict.level` +
      // `scopeEstimate` ONLY (see retrospective.ts) and never reads `levers`, so this
      // human-legible signal dump cannot mislead the grade. The full typed ProbeLevers
      // are not threaded here on purpose (it would balloon ReadyCandidate→marker for a
      // field nothing downstream consumes); `record.ts` re-documents the field to match.
      levers: it.verdict.signals,
      scopeEstimate: it.scopeEstimate,
      // Prefer the per-shape evidence-derived stage (SC6) when the caller resolved one;
      // fall back to the uniform config stage (Phase-3 behavior). Cold-start ⇒ the caller
      // resolves stage 1, so this is byte-identical to `config.ratchetStage` at cold-start.
      ratchetStage: it.effectiveStage ?? config.ratchetStage,
    };
    const recorded = await recordPrediction(prediction);
    if (!recorded.ok) {
      return { ok: false, error: recorded.error ?? new Error('recordPrediction failed') };
    }

    marked.push(externalId);
  }

  return { ok: true, value: { marked, skipped } };
}

/** Active statuses the orchestrator pickup treats as dispatch-eligible (mirrors activeStates). */
function isActiveStatus(status: FeatureStatus): boolean {
  return status === 'planned' || status === 'in-progress';
}
