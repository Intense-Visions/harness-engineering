/**
 * `RankedModel` orchestrator.
 *
 * Composes the Phase 2b math (`estimateVram`, `estimateSpeed`) and the Phase
 * 2c fusion (`mergeBenchmarks`) into a single hardware-aware ranking. The
 * orchestrator is pure: candidates in, ranked models out, no I/O. The caller
 * — the proposal engine in Phase 5b, the HTTP route in Phase 7, the dashboard
 * card in Phase 8 — provides the snapshot (frozen-loader result or freshly
 * merged) and any live observations the source adapters surfaced this tick.
 *
 * Composition order matters because each step's output feeds the next:
 *
 *   estimateVram → estimateSpeed (needs `vramEstimate` for partial-offload)
 *                → mergeBenchmarks (independent of the math; pulls observations
 *                  keyed by `hfRepoId`)
 *                → scaleScore (multiplies merged score by fitness +
 *                  speed-confidence multipliers so a high-confidence fit beats
 *                  a low-confidence fit at equal raw score)
 *
 * The `evidence` field on each `RankedModel` is the **weakest** grade among
 * the merged contributions, not the best. This matches how operators read the
 * field — "how trustworthy is the supporting evidence?" — so a single
 * self-reported observation is enough to flag the row even when a `direct`
 * observation also contributes. The dashboard's tooltip surfaces the full
 * per-contribution breakdown through `benchmarkScore.contributions` so both
 * the conservative summary and the optimistic detail are available without
 * re-running the math.
 *
 * Won't-fit candidates are kept in the underlying computation (so the
 * dashboard can explain why a popular model is missing) but filtered out of
 * the default result. `options.includeUnfit: true` keeps them, sorted to the
 * bottom with `score: 0`. F3 / Q3 in the spec specifies the default filtered
 * shape.
 *
 * @see docs/changes/local-model-lifecycle-manager/proposal.md (lines 124–138, 414–429; F3, Q1–Q5, S4)
 */

import { mergeBenchmarks } from './benchmarks/merge.js';
import type { BenchmarkEvidence, BenchmarkObservation } from './benchmarks/types.js';
import { estimateSpeed, type SpeedEstimate } from './speed.js';
import { estimateVram, type VramEstimate } from './vram.js';
import type {
  LiveObservation,
  RankInput,
  RankResult,
  RankedModel,
  RankerCandidate,
  RankerWarning,
} from './types.js';

/**
 * Evidence ordering from strongest to weakest. The orchestrator picks the
 * **last** entry of this list among the merged contributions as the row's
 * `evidence` field — see the module docstring for why "weakest" is the right
 * roll-up for operator reading.
 */
const EVIDENCE_ORDER: readonly BenchmarkEvidence[] = [
  'direct',
  'variant',
  'base',
  'interpolated',
  'self-reported',
];

/** Score multiplier per speed-confidence band. Tunes the score so a high-confidence */
/** fit beats a low-confidence fit at equal raw merged score. */
export const SPEED_CONFIDENCE_MULTIPLIER: Readonly<Record<SpeedEstimate['confidence'], number>> = {
  high: 1,
  medium: 0.9,
  low: 0.75,
};

/**
 * Score multiplier per benchmark-confidence band. The merge's weighted-mean
 * math collapses to the same raw score when a model has a single observation
 * (the weight cancels in numerator and denominator), so the merge's
 * **confidence** label is the only signal that distinguishes a fresh direct
 * observation from a stale self-reported one in that case. Folding the
 * multiplier into the orchestrator-level score is what makes Q4 / Q5 hold at
 * the `RankedModel.score` boundary: at equal raw merged value, a `'high'`-
 * confidence row outranks a `'low'`-confidence one.
 */
export const BENCHMARK_CONFIDENCE_MULTIPLIER: Readonly<Record<'high' | 'medium' | 'low', number>> =
  {
    high: 1,
    medium: 0.85,
    low: 0.6,
  };

/**
 * Floor evidence grade when the candidate has zero contributions (empty
 * snapshot + empty `liveObservations`). `'interpolated'` is the conservative
 * choice — `'self-reported'` would imply a vendor claim exists, which is
 * worse than the truth ("we know nothing about this model").
 */
const NO_EVIDENCE_FLOOR: BenchmarkEvidence = 'interpolated';

/**
 * Compose VRAM + speed + merged-benchmark fusion into a single hardware-aware
 * ranking. Always succeeds — degraded paths surface through `warnings`.
 */
export function rankModels(input: RankInput): RankResult {
  const snapshotDate = input.options?.snapshotDate ?? input.snapshot.generatedAt;
  const warnings: RankerWarning[] = [];

  const totalObservations =
    input.snapshot.models.reduce((acc, m) => acc + m.observations.length, 0) +
    (input.liveObservations?.length ?? 0);
  if (totalObservations === 0 && input.candidates.length > 0) {
    warnings.push({
      code: 'snapshot_unavailable',
      message: 'Ranker invoked with no benchmark observations; all scores fall back to 0.',
    });
  }

  const observationsByRepo = indexObservationsByRepo(input);

  const scored = input.candidates.map((candidate) =>
    scoreCandidate(candidate, input, observationsByRepo, snapshotDate)
  );

  const filtered = input.options?.includeUnfit ? scored : scored.filter((m) => m.fitsHardware);
  filtered.sort(compareRanked);

  const limited =
    input.options?.limit !== undefined ? filtered.slice(0, input.options.limit) : filtered;

  return { ranked: limited, warnings, snapshotDate };
}

/**
 * Group `liveObservations` + snapshot observations by `hfRepoId` so the
 * per-candidate scoring loop is O(candidates) instead of O(candidates × obs).
 * Live observations carry their model anchor on `LiveObservation.hfRepoId`;
 * the merge receives the base `BenchmarkObservation` shape with the anchor
 * stripped (the merge keys evidence + recency off the contribution's source
 * + grade, not the model id).
 */
function indexObservationsByRepo(input: RankInput): Map<string, BenchmarkObservation[]> {
  const byRepo = new Map<string, BenchmarkObservation[]>();

  for (const model of input.snapshot.models) {
    byRepo.set(model.hfRepoId, [...model.observations]);
  }

  if (input.liveObservations !== undefined) {
    for (const live of input.liveObservations) {
      const existing = byRepo.get(live.hfRepoId) ?? [];
      existing.push(stripModelAnchor(live));
      byRepo.set(live.hfRepoId, existing);
    }
  }

  return byRepo;
}

/** Drop the model anchor before handing the observation to the merge. */
function stripModelAnchor(live: LiveObservation): BenchmarkObservation {
  return {
    source: live.source,
    benchmark: live.benchmark,
    value: live.value,
    evidence: live.evidence,
    observedAt: live.observedAt,
  };
}

/** Run the full math + merge pipeline for one candidate. */
function scoreCandidate(
  candidate: RankerCandidate,
  input: RankInput,
  observationsByRepo: Map<string, BenchmarkObservation[]>,
  snapshotDate: string
): RankedModel {
  const vramEstimate = computeVram(candidate, input);
  const speedEstimate = computeSpeed(candidate, input, vramEstimate);
  const observations = observationsByRepo.get(candidate.hfRepoId) ?? [];
  const benchmarkScore = mergeBenchmarks({
    observations,
    target: candidateTarget(candidate),
    snapshotDate,
  });

  const fitsHardware = vramEstimate.totalGb <= input.hardware.vramGb;
  const evidence = weakestEvidence(benchmarkScore.contributions.map((c) => c.observation.evidence));
  const score = scaleScore({
    mergedScore: benchmarkScore.score,
    fitsHardware,
    speedConfidence: speedEstimate.confidence,
    benchmarkConfidence: benchmarkScore.confidence,
  });

  return assembleRankedModel({
    candidate,
    vramEstimate,
    speedEstimate,
    benchmarkScore,
    evidence,
    fitsHardware,
    score,
    benchmarkSnapshot: snapshotDate,
  });
}

/** Build the `MergeTarget` shape from a candidate. */
function candidateTarget(candidate: RankerCandidate): { model: string; quant: string } {
  return { model: candidate.hfRepoId, quant: candidate.quant };
}

/** Assemble the `RankedModel` envelope with conditional optional fields. */
function assembleRankedModel(args: {
  candidate: RankerCandidate;
  vramEstimate: VramEstimate;
  speedEstimate: SpeedEstimate;
  benchmarkScore: ReturnType<typeof mergeBenchmarks>;
  evidence: BenchmarkEvidence;
  fitsHardware: boolean;
  score: number;
  benchmarkSnapshot: string;
}): RankedModel {
  const { candidate, vramEstimate, speedEstimate, benchmarkScore } = args;
  return {
    hfRepoId: candidate.hfRepoId,
    sizeB: candidate.sizeB,
    quant: vramEstimate.quant,
    estimatedVramGb: vramEstimate.totalGb,
    estimatedTokPerSec: speedEstimate.tokPerSec,
    speedConfidence: speedEstimate.confidence,
    score: args.score,
    evidence: args.evidence,
    benchmarkSnapshot: args.benchmarkSnapshot,
    fitsHardware: args.fitsHardware,
    vramEstimate,
    speedEstimate,
    benchmarkScore,
    ...(candidate.ollamaName !== undefined ? { ollamaName: candidate.ollamaName } : {}),
    ...(candidate.activeB !== undefined ? { activeB: candidate.activeB } : {}),
  };
}

/** Compose the `VramEstimateInput` from a candidate + ranking options. */
function computeVram(candidate: RankerCandidate, input: RankInput): VramEstimate {
  return estimateVram({
    sizeB: candidate.sizeB,
    quant: candidate.quant,
    ...(candidate.activeB !== undefined ? { activeB: candidate.activeB } : {}),
    ...(input.options?.contextTokens !== undefined
      ? { contextTokens: input.options.contextTokens }
      : {}),
    ...(input.options?.kvCacheQuant !== undefined
      ? { kvCacheQuant: input.options.kvCacheQuant }
      : {}),
  });
}

/** Compose the `SpeedEstimateInput` from a candidate + hardware + the freshly computed VRAM. */
function computeSpeed(
  candidate: RankerCandidate,
  input: RankInput,
  vramEstimate: VramEstimate
): SpeedEstimate {
  return estimateSpeed({
    sizeB: candidate.sizeB,
    quant: candidate.quant,
    hardware: input.hardware,
    vramEstimate,
    ...(candidate.activeB !== undefined ? { activeB: candidate.activeB } : {}),
    ...(input.options?.backend !== undefined ? { backend: input.options.backend } : {}),
  });
}

/**
 * Pick the weakest evidence grade among the contributions. Empty contributions
 * fall back to `NO_EVIDENCE_FLOOR` so the field is always populated.
 */
export function weakestEvidence(grades: readonly BenchmarkEvidence[]): BenchmarkEvidence {
  if (grades.length === 0) return NO_EVIDENCE_FLOOR;
  let worstIndex = -1;
  for (const grade of grades) {
    const index = EVIDENCE_ORDER.indexOf(grade);
    if (index > worstIndex) worstIndex = index;
  }
  return EVIDENCE_ORDER[worstIndex] ?? NO_EVIDENCE_FLOOR;
}

/**
 * Combine the merge's raw score with hardware-fitness, speed-confidence, and
 * benchmark-confidence multipliers. Multiplicative composition keeps the math
 * readable for the proposal-threshold delta in Phase 5b: a row scoring 80 vs
 * another scoring 60 is a +20 delta on the same scale the merge already
 * produces.
 */
export function scaleScore(args: {
  mergedScore: number;
  fitsHardware: boolean;
  speedConfidence: SpeedEstimate['confidence'];
  benchmarkConfidence: 'high' | 'medium' | 'low';
}): number {
  if (!args.fitsHardware) return 0;
  return (
    args.mergedScore *
    SPEED_CONFIDENCE_MULTIPLIER[args.speedConfidence] *
    BENCHMARK_CONFIDENCE_MULTIPLIER[args.benchmarkConfidence]
  );
}

/**
 * Sort by score desc; tie-break on `speedEstimate.tokPerSec` desc; final tie
 * resolves on `hfRepoId` ascending **code-point** order so the order stays
 * stable across locales (`localeCompare` would put `'deepseek-ai/...'` before
 * `'Qwen/...'` on a case-insensitive locale and after it on a strict one,
 * which would silently flip parity fixtures between CI environments).
 */
function compareRanked(a: RankedModel, b: RankedModel): number {
  if (a.score !== b.score) return b.score - a.score;
  if (a.estimatedTokPerSec !== b.estimatedTokPerSec) {
    return b.estimatedTokPerSec - a.estimatedTokPerSec;
  }
  if (a.hfRepoId === b.hfRepoId) return 0;
  return a.hfRepoId < b.hfRepoId ? -1 : 1;
}
