import { describe, it, expect } from 'vitest';
import { createNativeRecommender } from '../../src/recommender/native.js';
import { emptySnapshot } from '../../src/ranker/benchmarks/types.js';
import type { BenchmarkSnapshotLoadResult } from '../../src/ranker/benchmarks/types.js';
import type { RankerCandidate } from '../../src/ranker/types.js';
import type { HardwareProfile } from '../../src/hardware/types.js';

const HARDWARE: HardwareProfile = {
  platform: 'macos',
  vramGb: 48,
  ramGb: 64,
  bandwidthGbps: 400,
  cpuName: 'Apple M4 Max',
  detectedAt: '2026-07-07T00:00:00.000Z',
};

const CANDIDATES: readonly RankerCandidate[] = [
  { hfRepoId: 'Qwen/Qwen3-8B-GGUF', ollamaName: 'qwen3:8b', sizeB: 8, quant: 'Q4_K_M' },
  { hfRepoId: 'Qwen/Qwen3-32B-GGUF', ollamaName: 'qwen3:32b', sizeB: 32, quant: 'Q4_K_M' },
];

function frozenResult(): BenchmarkSnapshotLoadResult {
  return { snapshot: emptySnapshot('2026-06-01'), source: 'frozen', warnings: [] };
}

describe('createNativeRecommender', () => {
  it('ranks the explicit candidates against a loaded snapshot (snapshotLoaded: true)', async () => {
    const recommend = createNativeRecommender({
      candidates: CANDIDATES,
      loadSnapshot: async () => frozenResult(),
    });
    const result = await recommend(HARDWARE);

    expect(result.snapshotLoaded).toBe(true);
    expect(typeof result.hfReachable).toBe('boolean');
    // RankedModel[] sorted by descending score.
    expect(result.ranked.length).toBeGreaterThan(0);
    for (let i = 1; i < result.ranked.length; i++) {
      expect(result.ranked[i - 1]!.score).toBeGreaterThanOrEqual(result.ranked[i]!.score);
    }
  });

  it('degrades to an empty ranking with a warning when the snapshot loader throws (O4 hard-failure)', async () => {
    const recommend = createNativeRecommender({
      candidates: CANDIDATES,
      loadSnapshot: async () => {
        throw new Error('snapshot bundle unreadable');
      },
    });
    const result = await recommend(HARDWARE);

    expect(result.snapshotLoaded).toBe(false);
    expect(result.ranked).toEqual([]);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('never throws when the HF popularity probe fails; sets hfReachable false', async () => {
    const recommend = createNativeRecommender({
      candidates: CANDIDATES,
      loadSnapshot: async () => frozenResult(),
      hfClient: {
        listModels: async () => {
          throw new Error('HF unreachable');
        },
      } as never,
    });
    const result = await recommend(HARDWARE);

    expect(result.hfReachable).toBe(false);
    expect(result.snapshotLoaded).toBe(true);
  });
});
