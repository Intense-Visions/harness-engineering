import { describe, it, expect } from 'vitest';

import { createBuildQualityReRanker } from '../../src/capability/harness-fit-rerank.js';
import { probeCacheKey } from '../../src/capability/probe-policy.js';
import { createNativeRecommender } from '../../src/recommender/native.js';
import type { RankerCandidate } from '../../src/ranker/types.js';
import type { HardwareProfile } from '../../src/hardware/types.js';
import type { BenchmarkSnapshot } from '../../src/ranker/benchmarks/types.js';

/**
 * `reRankWithBuildQuality` (Task 1) — re-run the EXISTING ranker with the probed
 * `buildQuality` injected per candidate (keyed by `probeCacheKey`), so a
 * narrate-only model sorts below an act-and-converge one at equal benchmark score.
 * No ranker-math duplication: the re-ranker just re-invokes the recommender over
 * candidates augmented with buildQuality. Proves:
 *   - injecting a HIGH buildQuality on one of two equal-benchmark candidates
 *     re-orders them by agenticScore (build-quality candidate first);
 *   - an absent key ⇒ no buildQuality for that candidate (fail-open, no effect);
 *   - the base ranking (no buildQuality) is byte-identical to the plain recommender.
 */

const SNAPSHOT_DATE = '2026-07-18';

const HARDWARE: HardwareProfile = {
  platform: 'macos',
  vramGb: 48,
  ramGb: 64,
  bandwidthGbps: 400,
  gpuName: 'Apple M4 Max',
  cpuName: 'Apple M4 Max',
  detectedAt: SNAPSHOT_DATE,
};

const NARRATE: RankerCandidate = {
  hfRepoId: 'Org/Narrator',
  ollamaName: 'narrator:1',
  sizeB: 8,
  quant: 'Q4_K_M',
  toolCalling: true,
  measuredAgenticLatencyMs: 2_000,
};

const BUILDER: RankerCandidate = {
  hfRepoId: 'Org/Builder',
  ollamaName: 'builder:1',
  sizeB: 8,
  quant: 'Q4_K_M',
  toolCalling: true,
  measuredAgenticLatencyMs: 2_000,
};

const CANDIDATES: RankerCandidate[] = [NARRATE, BUILDER];

/** Equal benchmark score for both so ONLY buildQuality can separate their agenticScore. */
const SNAPSHOT: BenchmarkSnapshot = {
  version: 1,
  generatedAt: SNAPSHOT_DATE,
  source: 'snapshot',
  models: [
    {
      hfRepoId: NARRATE.hfRepoId,
      family: 'narrator',
      sizeB: 8,
      observations: [
        {
          source: 'open-llm-leaderboard',
          benchmark: 'mmlu',
          value: 80,
          evidence: 'direct',
          observedAt: SNAPSHOT_DATE,
        },
      ],
    },
    {
      hfRepoId: BUILDER.hfRepoId,
      family: 'builder',
      sizeB: 8,
      observations: [
        {
          source: 'open-llm-leaderboard',
          benchmark: 'mmlu',
          value: 80,
          evidence: 'direct',
          observedAt: SNAPSHOT_DATE,
        },
      ],
    },
  ],
};

/** A recommender FACTORY over an (augmented) candidate set — the shape the re-ranker consumes. */
function buildRecommender(candidates: readonly RankerCandidate[]) {
  return createNativeRecommender({
    candidates,
    loadSnapshot: async () => ({ snapshot: SNAPSHOT, source: 'frozen', warnings: [] }),
  });
}

const BUILDER_KEY = probeCacheKey(BUILDER);
const NARRATE_KEY = probeCacheKey(NARRATE);

describe('createBuildQualityReRanker', () => {
  it('injects a HIGH buildQuality that re-orders the two by agenticScore', async () => {
    const reRank = createBuildQualityReRanker(CANDIDATES, buildRecommender);
    const byKey = new Map<string, number>([
      [BUILDER_KEY, 0.95], // converged
      [NARRATE_KEY, 0.1], // narrated
    ]);
    const result = await reRank(HARDWARE, byKey);

    const builder = result.ranked.find((r) => r.hfRepoId === BUILDER.hfRepoId)!;
    const narrator = result.ranked.find((r) => r.hfRepoId === NARRATE.hfRepoId)!;
    expect(builder.agenticScore).toBeGreaterThan(narrator.agenticScore);
    const byAgentic = [...result.ranked].sort((a, b) => b.agenticScore - a.agenticScore);
    expect(byAgentic[0]!.hfRepoId).toBe(BUILDER.hfRepoId);
  });

  it('an absent key leaves that candidate with no buildQuality (fail-open: neutral 1.0)', async () => {
    const reRank = createBuildQualityReRanker(CANDIDATES, buildRecommender);
    // Only the NARRATOR is keyed (LOW); the builder is absent ⇒ no buildQuality
    // (the ranker treats absent as a neutral 1.0 multiplier — "no evidence, no penalty").
    const byKey = new Map<string, number>([[NARRATE_KEY, 0.1]]);
    const result = await reRank(HARDWARE, byKey);

    const builder = result.ranked.find((r) => r.hfRepoId === BUILDER.hfRepoId)!;
    const narrator = result.ranked.find((r) => r.hfRepoId === NARRATE.hfRepoId)!;
    // The un-probed builder (neutral) out-scores the LOW-probed narrator — the
    // probed LOW signal is applied, the absent one is not (fail-open, no effect).
    expect(builder.agenticScore).toBeGreaterThan(narrator.agenticScore);
  });

  it('an empty buildQuality map is byte-identical to the base recommender', async () => {
    const base = await buildRecommender(CANDIDATES)(HARDWARE);
    const reRank = createBuildQualityReRanker(CANDIDATES, buildRecommender);
    const reRanked = await reRank(HARDWARE, new Map());
    expect(reRanked.ranked.map((r) => r.agenticScore)).toEqual(
      base.ranked.map((r) => r.agenticScore)
    );
    expect(reRanked.ranked.map((r) => r.hfRepoId)).toEqual(base.ranked.map((r) => r.hfRepoId));
  });
});
