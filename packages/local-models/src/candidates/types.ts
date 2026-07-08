/**
 * Frozen candidate snapshot types (LMLM Phase 2, D3/D8).
 *
 * The runtime recommender consumes a bundled, human-curated candidate list as
 * its offline-safe, deterministic source (mirroring the benchmark snapshot).
 * A `FrozenCandidate` is a `RankerCandidate` plus an optional `family` tag so
 * the operator's `allowedFamilies` allowlist can filter it.
 *
 * @see docs/changes/lmlm-functional-wiring/proposal.md (Phase 2, D5)
 */

import type { RankerCandidate } from '../ranker/index.js';

/** A ranker candidate augmented with the family tag used for allowlist filtering. */
export interface FrozenCandidate extends RankerCandidate {
  /** Model family (e.g. `qwen3`, `deepseek-r1`) for `allowedFamilies` filtering. */
  family?: string;
}

/** On-disk / bundled frozen candidate file. */
export interface FrozenCandidatesFile {
  /** Schema version. Bumped when the shape changes. */
  version: number;
  /** ISO date the snapshot was generated (provenance). */
  generatedAt: string;
  /** How the snapshot was produced (`seed` = hand-curated, `hf-refresh` = script). */
  source: string;
  /** The candidate list. */
  candidates: FrozenCandidate[];
}

/** Result of loading the frozen candidate snapshot. Never throws. */
export interface LoadFrozenCandidatesResult {
  candidates: FrozenCandidate[];
  /** `frozen` when the bundled snapshot loaded; `fallback` on validation failure. */
  source: 'frozen' | 'fallback';
  /** Human-readable warnings (schema failure detail) — advisory, never fatal. */
  warnings: string[];
}
