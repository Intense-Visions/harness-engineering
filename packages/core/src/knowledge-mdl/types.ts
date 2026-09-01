/**
 * MDL knowledge pruning (#1630) — shared types + config.
 *
 * Minimum Description Length as the knowledge store's fitness function: a
 * knowledge entry is only knowledge if the cost of storing and shipping it
 * (description cost) is less than the cost of the re-derivations and rework it
 * prevents (compression value). This module SCORES and RECOMMENDS only — it
 * never mutates the store. Executing the prune/merge is deferred (#1630).
 */

/** The MDL verdict for a single knowledge entry. */
export type MdlVerdict =
  /** Measured value covers description cost — the entry pays rent. */
  | 'keep'
  /**
   * Measured worthlessness: with sufficient evidence, the entry taxes more than
   * it saves. The ONLY verdict that authorizes a (reversible) prune recommendation.
   */
  | 'prune'
  /**
   * Not enough matched evidence to judge. A first-class verdict — pruning
   * requires measured worthlessness, never measurement absence. Never pruned.
   */
  | 'insufficient-evidence';

/**
 * One knowledge-store entry under MDL scrutiny.
 *
 * `tokensPerInclusion` is the entry's description cost per inclusion — the
 * tokens it ships into an assembled context each time it is included. When
 * inclusion telemetry carries measured per-inclusion tokens those are preferred;
 * this field is the fallback estimate (e.g. `estimateTokens(text)`).
 */
export interface KnowledgeEntry {
  /** Stable identity (content hash of the entry). */
  id: string;
  /** Fallback description cost per inclusion, in tokens. */
  tokensPerInclusion: number;
  /** Optional tags (used for reporting only). */
  tags?: string[];
  /** Optional full text (required for overlap/consolidation). */
  text?: string;
}

/** One time a knowledge entry was shipped into a run's assembled context. */
export interface InclusionEvent {
  /** The {@link KnowledgeEntry.id} that was included. */
  entryId: string;
  /** The run this inclusion belonged to. */
  runId: string;
  /** Measured tokens shipped for this inclusion. */
  tokensShipped: number;
}

/**
 * A run's outcome cost — the re-derivation / wrong-turn / rework burn, expressed
 * in tokens so both sides of the MDL ledger share one currency. Higher is worse.
 */
export interface RunOutcome {
  /** The run identifier (joins to {@link InclusionEvent.runId}). */
  runId: string;
  /**
   * The matching covariate key (e.g. workflow class / task type). The matched
   * comparison only compares present-vs-absent runs WITHIN the same stratum.
   */
  stratum: string;
  /** Re-derivation / wrong-turn / rework cost in tokens (>= 0). */
  cost: number;
}

/** Tunables for the MDL scorer. */
export interface MdlConfig {
  /** Minimum present runs (entry included) required to judge an entry. */
  minPresentRuns: number;
  /** Minimum absent runs (entry not included) required to judge an entry. */
  minAbsentRuns: number;
  /** Minimum number of matched strata (with both present and absent runs). */
  minMatchedStrata: number;
  /** Minimum present AND absent runs required within a stratum for it to count. */
  minPerCell: number;
  /**
   * Prune margin, in tokens. An entry is pruned only when its net MDL
   * contribution is below `-pruneMargin` (taxes at least this many tokens more
   * than it saves) WITH sufficient evidence. Guards against pruning on noise.
   */
  pruneMargin: number;
  /** Overlap score at/above which two entries are merge candidates. */
  overlapThreshold: number;
}

/** Conservative defaults: demand real matched evidence before recommending a prune. */
export const DEFAULT_MDL_CONFIG: MdlConfig = {
  minPresentRuns: 3,
  minAbsentRuns: 3,
  minMatchedStrata: 1,
  minPerCell: 2,
  pruneMargin: 0,
  overlapThreshold: 0.7,
};
