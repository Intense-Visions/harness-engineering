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
  /** The ratchet is not at stage 1; stages 2-4 land in Phase 4 (stage 1 is the only v1-P3 path). */
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

/** The gate's output: the partition of the ready set into approved vs held. */
export interface GoNoGoDecision {
  /** Items cleared for the marker: human-approved AND auto-executable (stage 1). */
  approved: GoNoGoCandidate[];
  /** Everything else, each carrying the reason it was held to a human. */
  held: HeldCandidate[];
}

/**
 * Pure go/no-go partition for autonomy-ratchet stage 1.
 *
 * Stage 1 rule (the only rule Phase 3 implements): an item is `approved` iff its
 * category is in {@link AUTO_EXECUTE_CATEGORIES} AND a human explicitly approved it.
 * Any other stage (2-4) refuses the ENTIRE batch (`ratchet-stage-unsupported`) —
 * the knob cannot advance past stage 1 until Phase 4 ships the retrospective that
 * earns it. This function performs no IO and dispatches nothing; it only decides.
 *
 * Ordering of the two hold reasons is deliberate: the category gate is checked
 * BEFORE the approval gate, so a human-approved non-autoExecute item reads
 * `not-auto-executable` (the structural reason), never `awaiting-human-go`.
 */
export function resolveGoNoGo(
  candidates: readonly GoNoGoCandidate[],
  stage: RatchetStage
): GoNoGoDecision {
  // Stage guard: Phase 3 implements stage 1 only. Any other stage holds everything
  // — a fail-safe, never a silent auto-go (a mis-set knob must not loosen the gate).
  if (stage !== 1) {
    return {
      approved: [],
      held: candidates.map((c) => ({
        externalId: c.externalId,
        category: c.category,
        reason: 'ratchet-stage-unsupported',
      })),
    };
  }

  const approved: GoNoGoCandidate[] = [];
  const held: HeldCandidate[] = [];
  for (const c of candidates) {
    // 1. Category gate first (structural): non-autoExecute stays human regardless of go.
    if (!AUTO_EXECUTE_CATEGORIES.has(c.category)) {
      held.push({ externalId: c.externalId, category: c.category, reason: 'not-auto-executable' });
      continue;
    }
    // 2. Human-go gate: auto-executable but not yet approved holds (SC4).
    if (!c.humanApproved) {
      held.push({ externalId: c.externalId, category: c.category, reason: 'awaiting-human-go' });
      continue;
    }
    approved.push(c);
  }
  return { approved, held };
}
