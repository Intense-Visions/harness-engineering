/**
 * Ranker — public type surface for the `RankedModel` orchestrator.
 *
 * Phase 2d composes the Phase 2b math (`estimateVram`, `estimateSpeed`) and the
 * Phase 2c fusion (`gradeEvidence`, `applyRecencyDecay`, `mergeBenchmarks`)
 * into a single hardware-aware ranking. The types in this file are the public
 * contract every downstream surface — the proposal engine (Phase 5b), the
 * HTTP routes (Phase 7), the dashboard recommendations card (Phase 8) — reads.
 *
 * `RankedModel` is a superset of the spec's Core types block (proposal.md
 * lines 124–138). The spec's block names the dashboard-facing fields; we add
 * the per-candidate `vramEstimate` / `speedEstimate` / `benchmarkScore`
 * breakdown so the dashboard's "why this score?" tooltip can render the
 * provenance without re-running the math.
 *
 * @see docs/changes/local-model-lifecycle-manager/proposal.md (lines 124–138, 414–429; F3, Q1–Q5, S4)
 */

import type { HardwareProfile } from '../hardware/types.js';
import type {
  BenchmarkEvidence,
  BenchmarkObservation,
  BenchmarkSnapshot,
} from './benchmarks/types.js';
import type { MergedScore } from './benchmarks/merge.js';
import type { KvCacheQuant, VramEstimate } from './vram.js';
import type { SpeedBackend, SpeedEstimate } from './speed.js';

/**
 * Per-candidate input the orchestrator consumes. Identifiers and the
 * `(sizeB, activeB?, quant)` triple are everything the VRAM + speed estimators
 * need; the benchmark merge derives observations from `hfRepoId`.
 */
export interface RankerCandidate {
  /** Stable HF repo id (`'Qwen/Qwen3-32B-GGUF'`). */
  hfRepoId: string;
  /** Common Ollama name when the model has a known mirror. */
  ollamaName?: string;
  /** Total parameter count in billions. For MoE this is `total`, not `active`. */
  sizeB: number;
  /** Active parameter count in billions for MoE. */
  activeB?: number;
  /** Quant id — any string `normalizeQuantId` recognises. */
  quant: string;
}

/**
 * `BenchmarkObservation` carries the source + benchmark + value but not the
 * model id (Phase 2c keeps the model dimension on the snapshot's outer
 * `ModelBenchmark.hfRepoId`). Live observations the source adapters surface
 * each refresh therefore need an explicit model anchor before the orchestrator
 * can pair them with a candidate; `LiveObservation` is that anchor. Phase 6's
 * scheduler will refactor the source adapters to emit this shape directly so
 * the orchestrator does not have to re-stitch the model dimension at call
 * time.
 */
export interface LiveObservation extends BenchmarkObservation {
  /** Stable HF repo id the observation applies to. */
  hfRepoId: string;
}

/** Ranking-options surface — every field optional so callers can stay terse. */
export interface RankOptions {
  /** Workload context window. Defaults to `DEFAULT_CONTEXT_TOKENS` (4 096). */
  contextTokens?: number;
  /** KV-cache precision. Defaults to `'fp16'`. */
  kvCacheQuant?: KvCacheQuant;
  /** Local-runtime override. Defaults to the platform-derived backend. */
  backend?: SpeedBackend;
  /** ISO date pinning "now" for recency decay. Defaults to `snapshot.generatedAt`. */
  snapshotDate?: string;
  /** Truncate the result to this many rows after sorting. */
  limit?: number;
  /**
   * Keep won't-fit candidates in the result (sorted to the bottom). Default
   * `false` so callers conform to F3 / Q3 without an extra filter step.
   */
  includeUnfit?: boolean;
}

/** Input envelope for `rankModels`. */
export interface RankInput {
  /** Candidate models to score. May be empty. */
  candidates: readonly RankerCandidate[];
  /** Hardware profile from `HardwareDetector`. */
  hardware: HardwareProfile;
  /**
   * Benchmark snapshot. Pass the frozen-snapshot loader's result for the
   * offline path, or a freshly merged snapshot for the live path.
   */
  snapshot: BenchmarkSnapshot;
  /**
   * Optional live observations the source adapters surfaced this tick. Each
   * carries an explicit `hfRepoId` so the orchestrator can pair it with a
   * candidate without re-stitching the model dimension. The orchestrator
   * unions these with the snapshot's per-model rows for the matching repo
   * before scoring.
   */
  liveObservations?: readonly LiveObservation[];
  /** Optional ranking knobs. */
  options?: RankOptions;
}

/**
 * Ranked candidate with the full provenance the dashboard's "why this score?"
 * tooltip and the proposal engine's justification renderer consume.
 */
export interface RankedModel {
  /** Stable HF repo id (`'Qwen/Qwen3-32B-GGUF'`). */
  hfRepoId: string;
  /** Ollama mirror name when known; absent for HF-only repos. */
  ollamaName?: string;
  /** Total parameter count in billions. */
  sizeB: number;
  /** Active parameter count in billions for MoE; absent for dense models. */
  activeB?: number;
  /** Canonical quant id the estimators ran against. */
  quant: string;
  /** VRAM footprint in gibibytes from `estimateVram`. */
  estimatedVramGb: number;
  /** Bandwidth-bound throughput projection from `estimateSpeed`. */
  estimatedTokPerSec: number;
  /** Confidence band from the speed estimator. */
  speedConfidence: 'high' | 'medium' | 'low';
  /** Composite score on `[0, 100]`. Higher is better. `0` for won't-fit rows. */
  score: number;
  /**
   * Weakest evidence grade among the merged contributions. A single
   * `self-reported` observation is enough to flag the row — operators read
   * this as "how trustworthy is the supporting evidence?".
   */
  evidence: BenchmarkEvidence;
  /** ISO date of the snapshot the merge ran against. */
  benchmarkSnapshot: string;
  /** True when `vramEstimate.totalGb ≤ hardware.vramGb`. */
  fitsHardware: boolean;
  /** Full VRAM breakdown — surfaced for the dashboard tooltip. */
  vramEstimate: VramEstimate;
  /** Full speed breakdown — surfaced for the dashboard tooltip. */
  speedEstimate: SpeedEstimate;
  /** Merged benchmark score plus per-observation contributions. */
  benchmarkScore: MergedScore;
}

/** Stable warning codes the ranker surfaces alongside the ranking. */
export type RankerWarningCode = 'snapshot_unavailable' | 'candidate_invalid';

/** Structured warning attached to a `RankResult`. */
export interface RankerWarning {
  code: RankerWarningCode;
  message: string;
  /** Optional candidate id for `candidate_invalid` warnings. */
  hfRepoId?: string;
}

/**
 * Output envelope from `rankModels`. Always populated — the orchestrator
 * never throws; degraded paths surface through `warnings`.
 */
export interface RankResult {
  /** Ranked candidates after filtering, sorting, and `limit` truncation. */
  ranked: RankedModel[];
  /** Structured warnings for any degraded path the ranker took. */
  warnings: RankerWarning[];
  /** ISO date the merge ran against (echoed from `snapshot.generatedAt` or `options.snapshotDate`). */
  snapshotDate: string;
}
