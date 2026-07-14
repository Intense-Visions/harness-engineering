// packages/intelligence/src/triage/brainstorm/types.ts
//
// Roadmap Auto-Triage — Phase 2, Task 1: the autonomous-brainstorm decision-core contracts.
//
// The brainstorm plays BOTH roles of `harness-brainstorming`: it enumerates each fork
// (a design decision — options + tradeoffs) AND selects its own recommended default with a
// self-assessed confidence. The pure runner (`runAutoBrainstorm`) drives forks up to a
// depth budget and either COMPLETES cleanly (writing a spec draft) or HALTS at the first
// fork it can't confidently recommend, handing that fork to a human.
//
// The `ForkGenerator` is the injected seam — the one thing that "calls the model". The pure
// core never touches a live provider; the orchestrator supplies the real generator (SEL
// provider + self-consistency sampling + human-only rubric). Tests stub it. Mirrors Phase 1's
// pure-probe / injected-provider split.
//
// Directive (Task 0 spike): confidence is a CONSERVATIVE input, never authority. The gate
// halts unless `confidence === 'high'` — and the generator is contractually required to
// DOWNGRADE to 'low' when self-consistency sampling shows the recommendation is unstable.
//
// Layer note: intelligence-only. Imports @harness-engineering/types + local siblings only.
// No core/orchestrator import — spec doc I/O + the live provider live in the wiring layer.

import type { ComplexityLevel } from '@harness-engineering/types';

/** Self-assessed confidence in a fork recommendation. Mirrors the AMR tie-break enum. */
export type ForkConfidence = 'high' | 'medium' | 'low';

/**
 * One decision fork the brainstorm surfaces: a design choice with mutually-exclusive
 * options. The runner asks the generator to recommend a default for each; a fork it can't
 * confidently recommend is the no-go trigger (SC2). `id` orders forks deterministically.
 */
export interface Fork {
  /** Stable fork identity within a brainstorm (e.g. 'storage-backend'). Orders the loop. */
  id: string;
  /** The question this fork decides (human-legible; carried into a halt handoff). */
  question: string;
  /** The mutually-exclusive options considered (at least one; usually 2–3). */
  options: readonly string[];
}

/**
 * The generator's decision on a single fork: which option it recommends, how confident it
 * is (AFTER any self-consistency downgrade), and why. Mirrors `tiebreak.ts` structured
 * output `{ recommendation, confidence, rationale }` — the schema the SEL provider fills.
 */
export interface ForkDecision {
  /** The fork this decision answers. */
  fork: Fork;
  /** The recommended option (should be one of `fork.options`). */
  recommendation: string;
  /**
   * Self-assessed confidence — the gate input. `high` is the ONLY value that auto-accepts;
   * `medium`/`low` halt (SC2). The generator MUST force this to `low` when self-consistency
   * sampling shows the recommendation flipped across samples (overconfidence hardening).
   */
  confidence: ForkConfidence;
  /** Why this option, in one or two sentences (carried into the spec draft / halt handoff). */
  rationale: string;
}

/**
 * The injected seam that generates + decides one fork at a time. The pure runner calls this
 * `depth.maxForks` times (or until it returns `null`, signalling "no more forks — done").
 *
 * `index` is the 0-based position in the brainstorm (the runner tracks depth). Returning
 * `null` means the brainstorm has enumerated every fork it needs — the runner then COMPLETES.
 * A thrown error is caught by the runner and mapped to `halted{ reason: 'error' }` (SC5):
 * the generator is allowed to throw; the runner is total.
 *
 * Overconfidence hardening (self-consistency) is the GENERATOR's contract: it samples the
 * underlying model N times per fork and, if the recommendation flips, returns the decision
 * with `confidence: 'low'`. Keeping it in the generator (behind this seam) makes it testable
 * with a stub that reports a flip → the pure runner still just reads the enum and halts.
 */
export interface ForkGenerator {
  /**
   * Produce the next fork's decision, or `null` when there are no more forks. May be async.
   * MAY throw — the runner catches it and halts with `reason: 'error'`.
   */
  next(
    index: number,
    priorDecisions: readonly ForkDecision[]
  ): ForkDecision | null | Promise<ForkDecision | null>;
}

/**
 * The depth budget: how many forks the brainstorm may explore, scaled by the Phase-1
 * complexity estimate (SC3). A `trivial` item runs a shallow pass; `simple` a fuller one.
 * Bounded so a typo never gets the full 4-phase treatment. The runner NEVER exceeds
 * `maxForks` — if the generator keeps producing forks past the budget, the loop stops and
 * completes with what it has (the budget is a ceiling, not a required count).
 */
export interface DepthBudget {
  /** Hard ceiling on forks explored. Bounded (e.g. trivial→2, simple→4). Always ≥ 1. */
  maxForks: number;
}

/** Map a Phase-1 complexity level to a bounded brainstorm depth (SC3). */
export const DEPTH_BY_LEVEL: Record<ComplexityLevel, DepthBudget> = {
  trivial: { maxForks: 2 },
  simple: { maxForks: 4 },
  // moderate/complex are OUT of the eligible band (the probe holds them to human) — a depth
  // is defined only so the mapping is total; the brainstorm should never run on them.
  moderate: { maxForks: 4 },
  complex: { maxForks: 4 },
};

/** Resolve the bounded depth budget for a complexity level (SC3 depth-scaling). */
export function depthForLevel(level: ComplexityLevel): DepthBudget {
  return DEPTH_BY_LEVEL[level] ?? { maxForks: 2 };
}

/**
 * A proposal-shaped spec draft accumulated from the accepted fork decisions on clean
 * completion. Intentionally lightweight (the wiring layer renders it to a proposal.md);
 * the pure core only accumulates the resolved decisions + a title/summary.
 */
export interface SpecDraft {
  /** The item this spec is for (roadmap External-ID / identifier). */
  externalId: string;
  /** A short title (from the item). */
  title: string;
  /** One-line summary of the item. */
  summary: string;
  /** Every fork the brainstorm resolved, in order — the spec's decision record. */
  decisions: readonly ForkDecision[];
}

/**
 * The input to one brainstorm run: the item identity + text the generator reasons over,
 * plus the Phase-1 complexity level that scales the depth. Pure — no provider, no IO.
 */
export interface BrainstormInput {
  /** Stable item identity (roadmap External-ID / identifier). */
  externalId: string;
  /** Short title (carried into the spec draft). */
  title: string;
  /** One-line summary / description (carried into the spec draft + fed to the generator). */
  summary: string;
  /** The Phase-1 complexity level — scales the depth budget (SC3). */
  level: ComplexityLevel;
}

/** Why a brainstorm halted — the closed no-go set handed to a human. */
export type HaltReason =
  | 'low-confidence' // a fork's confidence was below the 'high' bar (the SC2 no-go trigger)
  | 'error'; // the generator threw / timed out (SC5)

/**
 * The single outcome of a brainstorm run (SC1): either a clean COMPLETION carrying the spec
 * draft, or a HALT carrying the fork it stopped at + the reason. Exactly one of the two.
 * A halt is a REAL handoff — never a rubber-stamped stub (proposal §"a halt is a real
 * handoff, not a rubber stamp").
 */
export type BrainstormOutcome =
  | { kind: 'completed'; spec: SpecDraft }
  | { kind: 'halted'; fork: Fork; reason: HaltReason; detail: string };
