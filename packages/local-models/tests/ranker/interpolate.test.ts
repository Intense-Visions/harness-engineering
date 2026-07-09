import { describe, expect, it } from 'vitest';
import {
  buildSeriesScores,
  interpolateBySize,
  seriesKey,
  type SeriesPoint,
} from '../../src/ranker/interpolate.js';
import type { BenchmarkSnapshot } from '../../src/ranker/benchmarks/types.js';

describe('seriesKey', () => {
  it('collapses every size of a model line to one key', () => {
    expect(seriesKey('Qwen/Qwen3-8B-GGUF')).toBe(seriesKey('Qwen/Qwen3-32B-GGUF'));
    expect(seriesKey('deepseek-ai/DeepSeek-R1-Distill-Qwen-14B-GGUF')).toBe(
      seriesKey('deepseek-ai/DeepSeek-R1-Distill-Qwen-32B-GGUF')
    );
  });

  it('keeps distinct model lines apart', () => {
    expect(seriesKey('Qwen/Qwen3-8B-GGUF')).not.toBe(
      seriesKey('deepseek-ai/DeepSeek-R1-Distill-Qwen-8B-GGUF')
    );
  });

  it('does not strip a non-parameter numeric like the "3" in Qwen3 or "R1"', () => {
    expect(seriesKey('Qwen/Qwen3-8B-GGUF')).toContain('qwen3');
    expect(seriesKey('deepseek-ai/DeepSeek-R1-Distill-Qwen-14B-GGUF')).toContain('r1');
  });
});

describe('interpolateBySize', () => {
  const points: SeriesPoint[] = [
    { sizeB: 8, score: 40 },
    { sizeB: 32, score: 60 },
    { sizeB: 70, score: 72 },
  ];

  it('returns undefined when there is no sibling', () => {
    expect(interpolateBySize([], 8)).toBeUndefined();
  });

  it('linearly interpolates between bracketing siblings', () => {
    // Halfway (in size) between 8→32 is 20 → halfway between 40 and 60 = 50.
    expect(interpolateBySize(points, 20)).toBe(50);
  });

  it('clamps to the largest measured score above the range (never invents higher)', () => {
    expect(interpolateBySize(points, 200)).toBe(72);
  });

  it('extrapolates downward below the smallest size, floored at 0', () => {
    const two: SeriesPoint[] = [
      { sizeB: 8, score: 40 },
      { sizeB: 32, score: 60 },
    ];
    // Slope 20/24 per B; at size 2 → 40 - 6*(20/24) = 35.
    expect(interpolateBySize(two, 2)).toBeCloseTo(35, 5);
    expect(interpolateBySize(two, 0)).toBeGreaterThanOrEqual(0);
  });

  it('scales a single sibling down for a smaller target and holds it for a larger one', () => {
    const one: SeriesPoint[] = [{ sizeB: 32, score: 60 }];
    expect(interpolateBySize(one, 8)).toBeCloseTo(60 * (8 / 32), 5); // 15
    expect(interpolateBySize(one, 70)).toBe(60); // no upward invention
  });
});

describe('buildSeriesScores', () => {
  function snapshot(models: BenchmarkSnapshot['models']): BenchmarkSnapshot {
    return { version: 1, generatedAt: '2026-05-28', source: 'seed', models };
  }
  const obs = (value: number) => ({
    source: 'open-llm-leaderboard',
    benchmark: 'mmlu-pro',
    value,
    evidence: 'direct' as const,
    observedAt: '2026-05-01',
  });

  it('groups measured models by series, sorted by size, skipping unobserved ones', () => {
    const map = buildSeriesScores(
      snapshot([
        { hfRepoId: 'Qwen/Qwen3-32B-GGUF', family: 'qwen3', sizeB: 32, observations: [obs(60)] },
        { hfRepoId: 'Qwen/Qwen3-8B-GGUF', family: 'qwen3', sizeB: 8, observations: [obs(40)] },
        { hfRepoId: 'Qwen/Qwen3-14B-GGUF', family: 'qwen3', sizeB: 14, observations: [] }, // skipped
      ]),
      '2026-05-28'
    );
    const qwen = map.get(seriesKey('Qwen/Qwen3-8B-GGUF'));
    expect(qwen?.map((p) => p.sizeB)).toEqual([8, 32]); // sorted, 14B (no obs) omitted
    expect(qwen?.[0]?.score).toBeGreaterThan(0);
  });
});
