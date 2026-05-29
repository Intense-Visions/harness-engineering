/**
 * Benchmark data — public barrel.
 *
 * Phase 2a exposes the snapshot loader and the shared types. Phase 2c adds
 * `sources.ts` (live leaderboard adapters behind a common interface) and
 * `merge.ts` (cross-source weighting + confidence). Phase 2d composes these
 * with the VRAM/speed math from `../vram.ts` / `../speed.ts` into the
 * `RankedModel` orchestrator.
 */

export { loadFrozenSnapshot } from './snapshot.js';

export {
  emptySnapshot,
  type BenchmarkEvidence,
  type BenchmarkObservation,
  type BenchmarkSnapshot,
  type BenchmarkSnapshotLoadResult,
  type BenchmarkSnapshotWarning,
  type ModelBenchmark,
} from './types.js';

export {
  HF_POPULARITY_URL,
  LIKE_WEIGHT,
  OPEN_LLM_LEADERBOARD_URL,
  huggingFacePopularitySource,
  openLlmLeaderboardSource,
  type BenchmarkSource,
  type BenchmarkSourceFetchOptions,
  type BenchmarkSourceResult,
  type Fetcher,
  type FetcherResponse,
  type SourceWarning,
  type SourceWarningCode,
} from './sources.js';

export {
  DEFAULT_SOURCE_WEIGHTS,
  DEFAULT_UNKNOWN_SOURCE_WEIGHT,
  HIGH_CONFIDENCE_RECENCY_FLOOR,
  LOW_CONFIDENCE_WEIGHT_FLOOR,
  mergeBenchmarks,
  type MergeInput,
  type MergeTarget,
  type MergedScore,
  type ScoredObservation,
} from './merge.js';
