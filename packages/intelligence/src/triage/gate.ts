// packages/intelligence/src/triage/gate.ts
//
// Roadmap Auto-Triage — Phase 3, Task 2: the pure go/no-go gate (ratchet stage 1).
//
// This is the autonomy ratchet's first stage: a HUMAN go/no-go BEFORE execution
// (proposal §"The autonomy ratchet", stage 1 / D10 / D14). The gate authorizes
// nothing on its own — it is a pure partition of a ready candidate set into
// `approved` (an item a human explicitly cleared AND whose escalation category is
// auto-executable) and `held` (everything else, each with a legible reason). The
// caller (the orchestrator marker, Phase 3 T3) acts on `approved` only.
//
// Layer note: intelligence-only. Imports ONLY @harness-engineering/types (ScopeTier)
// + no siblings that reach outside the layer. No core/orchestrator import — the
// candidate set is built in the wiring/CLI layer and handed in.

import type { ScopeTier } from '@harness-engineering/types';
import type { RatchetStage } from './record.js';

/**
 * The escalation categories that may auto-execute (mirror of the orchestrator's
 * `EscalationConfig.autoExecute` default — proposal §"Dispatch path" reuses the
 * shipped escalation categories rather than inventing a parallel taxonomy). An
 * item whose category is NOT in this set stays human even after a human go (SC3):
 * `guided-change` is signal-gated and `full-exploration` is always-human.
 *
 * Defined as a frozen set here (not imported from orchestrator) to keep this gate
 * in the intelligence layer; the orchestrator's escalation default is the source of
 * truth for the VALUES, and the T3 wiring is where the two are reconciled against
 * the live `config.agent.escalation.autoExecute`.
 */
export const AUTO_EXECUTE_CATEGORIES: ReadonlySet<ScopeTier> = new Set<ScopeTier>([
  'quick-fix',
  'diagnostic',
]);

/**
 * One ready candidate presented to the go/no-go gate. Built in the wiring layer from
 * a Phase-2 spec-bearing, re-scored-dispatchable item; the gate reads only the three
 * fields that decide authorization.
 */
export interface GoNoGoCandidate {
  /** Stable item key (roadmap External-ID). */
  externalId: string;
  /** The item's escalation category (the routing bucket it fell into). */
  category: ScopeTier;
  /**
   * Whether a human has EXPLICITLY approved this item in the batched go/no-go. The
   * quiet linchpin of stage 1: absent this flag no item is ever approved — the gate
   * never manufactures a go. Set by the `triage approve` command (Phase 3 T4).
   */
  humanApproved: boolean;
}

/** Why a candidate was held rather than approved. A closed, legible set (SC-F2 style). */
export type HoldReason =
  /** The candidate's EFFECTIVE stage is deferred post-v1 (3-4); v1 caps at stage 2. */
  | 'ratchet-stage-unsupported'
  /** The item's category is not auto-executable (guided-change / full-exploration). */
  | 'not-auto-executable'
  /** Auto-executable, but no human has given the go yet (stage-1 default hold). */
  | 'awaiting-human-go';

/** A held candidate: the item plus the single legible reason it did not pass. */
export interface HeldCandidate {
  externalId: string;
  category: ScopeTier;
  reason: HoldReason;
}

/** An approved candidate carrying the EVIDENCE-DERIVED stage its shape earned (SC6). */
export interface ApprovedCandidate extends GoNoGoCandidate {
  /**
   * The effective autonomy stage this candidate's SHAPE earned from its recorded history
   * (`min(resolveStage(history), configuredCeiling, 2)`). 1 = human-before-execution (the
   * cold-start default); 2 = auto-execute + required human-verify (v1's ceiling). This governs
   * only DOWNSTREAM match-handling/advancement — NOT the authorization above (which is stage-
   * independent: humanApproved AND auto-executable). The marker stamps it onto the prediction.
   */
  effectiveStage: 1 | 2;
}

/** The gate's output: the partition of the ready set into approved vs held. */
export interface GoNoGoDecision {
  /** Items cleared for the marker: human-approved AND auto-executable, with the earned stage. */
  approved: ApprovedCandidate[];
  /** Everything else, each carrying the reason it was held to a human. */
  held: HeldCandidate[];
}

/**
 * One ready candidate presented to the PER-SHAPE go/no-go gate: the base candidate plus the
 * effective autonomy stage its shape earned from recorded evidence. The caller resolves the
 * stage per-shape (via the pure `resolveStage` over that shape's history) so the ratchet
 * advances INDEPENDENTLY per shape (SC6), never as one batch stage.
 */
export interface StagedGoNoGoCandidate extends GoNoGoCandidate {
  /** `min(resolveStage(historyForShape), configuredCeiling, 2)`. Cold-start ⇒ 1. */
  effectiveStage: RatchetStage;
}

/**
 * Pure go/no-go partition with a PER-CANDIDATE evidence-derived stage (SC6).
 *
 * The AUTHORIZATION rule is stage-INDEPENDENT and unchanged from Phase 3: an item is
 * `approved` iff its category is in {@link AUTO_EXECUTE_CATEGORIES} AND a human explicitly
 * approved it. The stage does NOT relax this — the human-go requirement holds at every stage.
 * The stage only rides ALONG on an approved item (`effectiveStage`) to govern downstream
 * match-handling/advancement; a candidate whose earned stage is deferred post-v1 (3-4) is
 * refused as `ratchet-stage-unsupported` (a fail-safe belt: the caller already clamps to ≤ 2,
 * so this should be unreachable, but a mis-set stage must never loosen the gate).
 *
 * Ordering of the hold reasons is deliberate and matches Phase 3: the stage guard is checked
 * first (a deferred stage refuses regardless), then the category gate (structural), then the
 * human-go gate — so an approved non-autoExecute item still reads `not-auto-executable`.
 */
export function resolveGoNoGoStaged(candidates: readonly StagedGoNoGoCandidate[]): GoNoGoDecision {
  const approved: ApprovedCandidate[] = [];
  const held: HeldCandidate[] = [];
  for (const c of candidates) {
    // 0. Stage guard (per-candidate): a deferred stage (3-4) refuses this item — never a
    //    silent auto-go. v1 only supports {1, 2}; both share the identical auth below.
    if (c.effectiveStage !== 1 && c.effectiveStage !== 2) {
      held.push({
        externalId: c.externalId,
        category: c.category,
        reason: 'ratchet-stage-unsupported',
      });
      continue;
    }
    // 1. Category gate (structural): non-autoExecute stays human regardless of go OR stage.
    if (!AUTO_EXECUTE_CATEGORIES.has(c.category)) {
      held.push({ externalId: c.externalId, category: c.category, reason: 'not-auto-executable' });
      continue;
    }
    // 2. Human-go gate: auto-executable but not yet approved holds (SC4) — at EVERY stage.
    if (!c.humanApproved) {
      held.push({ externalId: c.externalId, category: c.category, reason: 'awaiting-human-go' });
      continue;
    }
    approved.push({ ...c, effectiveStage: c.effectiveStage });
  }
  return { approved, held };
}

/**
 * Pure go/no-go partition for a UNIFORM ratchet stage (Phase 3 shape, retained for callers
 * that have not yet resolved per-shape evidence). Delegates to {@link resolveGoNoGoStaged} by
 * stamping the SAME `stage` on every candidate — so the authorization + hold-reason ordering
 * is defined in exactly one place. Passing a deferred stage (3-4) refuses the whole batch, and
 * stage 1 reproduces Phase-3 behavior byte-for-byte.
 */
export function resolveGoNoGo(
  candidates: readonly GoNoGoCandidate[],
  stage: RatchetStage
): GoNoGoDecision {
  return resolveGoNoGoStaged(candidates.map((c) => ({ ...c, effectiveStage: stage })));
}
