// packages/intelligence/src/triage/types.ts
//
// Roadmap Auto-Triage — Phase 1, the scoping-probe contracts.
//
// The pure probe's input/output shapes plus the two seams it is injected with (the
// AnalysisProvider it already knows, and the GraphScope resolution seam introduced
// here). `PrecedentLookup` + the config type are DEFINED IN PHASE 0 (record.ts /
// @harness-engineering/types); this module IMPORTS and consumes them, never redefines.
//
// Layer note: intelligence-only. Imports @harness-engineering/types (RoutingTaskText,
// ComplexityVerdict) + local Phase-0 siblings (PrecedentRate). No core/orchestrator
// import — the roadmap IO + graph resolution live in the wiring layer.

import type { ComplexityVerdict, RoutingTaskText } from '@harness-engineering/types';
import type { PrecedentRate } from './record.js';

/**
 * One lever's result. Every lever either produces a concrete value or degrades to the
 * literal `'unknown'` (never throwing out of the probe), carrying an optional `reason`
 * that feeds the verdict's `rationale`. A degraded lever LOWERS corroboration; it never
 * forces a pass (proposal §"any lever that returns 'unknown' lowers the corroboration
 * score rather than forcing a pass").
 */
export interface LeverResult<T> {
  /** The lever's value, or the literal `'unknown'` when it could not be determined. */
  value: T | 'unknown';
  /** Human-legible note (why it degraded, or a one-line summary of the finding). */
  reason?: string;
}

/** A single resolved-entity scope datum from the graph seam. */
export interface ResolvedEntity {
  /** The raw candidate that resolved (as emitted by extractEntities). */
  candidate: string;
  /** The graph node id it resolved to. */
  nodeId: string;
  /** Estimated blast radius (affected-node count) from the graph for this entity. */
  blastRadius: number;
}

/**
 * The scope lever's value: the graph-grounded scope estimate. `resolved` is the subset
 * of candidates that ACTUALLY resolved in the graph — extractEntities over-generates
 * (it emits `e.g`/`i.e` noise and other non-symbols), so a non-empty extraction is NOT
 * itself "scope resolved" (follow-up S3). Only resolved candidates count. When `resolved`
 * is empty the scope is unresolved and the item is not dispatchable (`unresolved-scope`).
 */
export interface ScopeEstimate {
  /** Candidates emitted by the extractor (pre-resolution). */
  candidates: readonly string[];
  /** The subset that resolved against the graph (empty ⇒ unresolved scope). */
  resolved: readonly ResolvedEntity[];
  /** Aggregate estimated blast radius across resolved entities (max, the worst case). */
  blastRadius: number;
  /** Distinct architectural layers the resolved entities touch (feeds ComplexitySignals). */
  layersTouched: number;
  /** Count of resolved entities (proxy for filesTouched into the static pass). */
  filesTouched: number;
}

/**
 * The injected graph-resolution seam. The pure probe NEVER touches a GraphStore — it is
 * handed this. It maps a candidate entity string to a resolved node + blast radius, or
 * `null` when the candidate does not resolve (vague/non-symbol candidate). The wiring
 * layer (orchestrator/CLI) implements it over GraphStore + CascadeSimulator; tests stub
 * it. This is the S3 seam: raw-string resolution is NOT cleanly exposed by the graph
 * package, so it lives behind this injected boundary rather than inside the probe.
 */
export interface GraphScope {
  /**
   * Resolve a candidate entity mention to a graph node + blast radius, or `null` if it
   * does not resolve. May be sync or async; the probe awaits it. MUST NOT throw — but
   * the probe still guards it (any throw degrades the scope lever to `unknown`).
   */
  resolve(candidate: string): ResolvedEntity | null | Promise<ResolvedEntity | null>;
}

/**
 * The open-decisions self-assessment the semantic-read lever surfaces: the human/agent
 * boundary. Any open decision requiring human judgment (API shape, product tradeoff,
 * irreversible/outward action) → not dispatchable, regardless of complexity band.
 */
export interface OpenDecision {
  /** Short description of the choice requiring human judgment. */
  question: string;
}

/** The closed set of reasons a non-dispatchable item was held (mirrors EscalationCategory). */
export type HoldReason =
  | 'not-in-band'
  | 'unresolved-scope'
  | 'open-decision'
  // The open-decisions lever could not be READ (no provider wired / assessment errored) — the
  // item is held because we can't CONFIRM there are no open decisions, NOT because one was
  // surfaced. Distinct from `open-decision` (DEV3): don't conflate "unread" with "a real
  // decision exists". Fail-safe (an unread lever never clears the gate), but legibly labelled.
  | 'read-incomplete'
  | 'precedent-contradicts'
  | 'error';

/**
 * Input to the pure probe for one roadmap item. Built from an `Issue` in the wiring
 * layer (reusing `buildTaskText`) — the probe stays orchestrator-free and unit-testable.
 */
export interface ProbeInput {
  /** Stable item identity (roadmap External-ID). Absent ⇒ not dispatch-eligible. */
  externalId: string;
  /** Pre-diff text-only signals (title+description length, spec/acceptance hints, prompt). */
  taskText: RoutingTaskText;
  /** Candidate entity mentions from the item text (from `extractEntities`) — pre-resolution. */
  entityCandidates: readonly string[];
  /** Item labels (for shapeKey bucketing / precedent lookup). */
  labels: readonly string[];
  /** Whether the item's risk band is high (drives the classifier's standard-tier tie-break). */
  riskHigh?: boolean;
}

/** The per-lever bundle carried on every verdict (SC-O1 traceability). */
export interface ProbeLevers {
  /** Scope lever: graph-grounded scope estimate (or `unknown` on degrade). */
  scope: LeverResult<ScopeEstimate>;
  /** Semantic-read lever: the local-model complexity read (or `unknown`). */
  semanticRead: LeverResult<ComplexityVerdict>;
  /** Open-decisions lever: surfaced human-judgment choices (or `unknown`). */
  openDecisions: LeverResult<readonly OpenDecision[]>;
  /** Precedent lever: measured base-rate for this shape (or `unknown` at cold-start). */
  precedent: LeverResult<PrecedentRate>;
}

/**
 * The probe's output for one item. `dispatchable` is TRUE only when scope is bounded AND
 * the semantic read agrees trivial|simple (the eligible band) AND confidence ≥ medium AND
 * there are no open decisions AND precedent does not contradict. Any shortfall or lever
 * error fails safe to `dispatchable:false` with a legible `holdReason` + `rationale`.
 */
export interface TriageVerdict {
  /** The item this verdict is for. */
  externalId: string;
  /** The corroborated complexity verdict (from the semantic read, or a conservative degrade). */
  verdict: ComplexityVerdict;
  /** Authorization decision: only true when all levers corroborate (see the gate above). */
  dispatchable: boolean;
  /** The single legible reason it was held (absent when `dispatchable`). SC-F2 closed set. */
  holdReason?: HoldReason;
  /** All four levers' results (SC-O1 traceability). */
  levers: ProbeLevers;
  /** Human-legible corroboration narrative (per-lever notes joined). */
  rationale: string;
}
