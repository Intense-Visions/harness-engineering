// packages/local-models/src/capability/harness-fit-rerank.ts
//
// The `reRankWithBuildQuality` binding (harness-fit-probe D5, Task 1). The probe
// pass produces a `buildQuality ∈ [0, 1]` per probed candidate; this helper threads
// those signals back into the SAME ranker so a narrate-only model sorts below an
// act-and-converge one at equal benchmark score.
//
// It does NOT duplicate any ranker math. `buildQuality` is already a first-class
// `RankerCandidate` field consumed by `scoreAgentic` (ranker/agentic.ts) — so the
// re-rank just re-invokes the EXISTING `recommend(hardware)` (a
// `createNativeRecommender` binding) over the same candidate set, augmented with the
// probed `buildQuality` keyed by {@link probeCacheKey}. Absent-key ⇒ no buildQuality
// for that candidate (fail-open — the ranker treats undefined as "no effect", D6).
//
// Pure composition: the recommender it wraps stays the single source of ranking
// truth; this file only maps `(candidate → cacheKey → buildQuality)` onto the
// candidate inputs before delegating.
//
// @see docs/changes/harness-fit-probe/proposal.md (D1, D5, SC2)

import type { HardwareProfile } from '../hardware/types.js';
import type { RankerCandidate } from '../ranker/types.js';
import type { RecommendResult } from '../recommender/native.js';
import { probeCacheKey } from './probe-policy.js';

/** A `recommend(hardware)` binding — structurally, a `createNativeRecommender` result. */
export type Recommend = (hardware: HardwareProfile) => Promise<RecommendResult>;

/**
 * The re-rank binding the scheduler injects as `HarnessFitProbeDeps.reRankWithBuildQuality`.
 */
export type BuildQualityReRanker = (
  hardware: HardwareProfile,
  buildQualityByKey: ReadonlyMap<string, number>
) => Promise<RecommendResult>;

/**
 * Build a `reRankWithBuildQuality(hardware, byKey)` closure over the operator's
 * candidate set. Each call clones the candidates, stamps `buildQuality` on any whose
 * {@link probeCacheKey} is present in `byKey`, and re-runs `buildRecommender(augmented)`
 * — reusing the whole existing rank algorithm (VRAM + speed + benchmark + agentic
 * fusion). No ranker math is re-implemented here.
 *
 * `buildRecommender` takes the augmented candidate list and returns a fresh
 * `recommend` bound to it (in production a `createNativeRecommender({ candidates, ... })`
 * with the same snapshot loader / HF client the tick uses). This indirection keeps the
 * re-rank on the SAME ranking path as the tick's primary `recommend`.
 */
export function createBuildQualityReRanker(
  candidates: readonly RankerCandidate[],
  buildRecommender: (augmented: readonly RankerCandidate[]) => Recommend
): BuildQualityReRanker {
  return async (hardware, buildQualityByKey) => {
    const augmented = candidates.map((candidate) => {
      const bq = buildQualityByKey.get(probeCacheKey(candidate));
      // Absent key ⇒ leave `buildQuality` untouched (fail-open, no ranking effect).
      return bq === undefined ? candidate : { ...candidate, buildQuality: bq };
    });
    return buildRecommender(augmented)(hardware);
  };
}
