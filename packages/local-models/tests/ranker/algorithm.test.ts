import { describe, expect, it } from 'vitest';

import type { HardwareProfile } from '../../src/hardware/types.js';
import {
  BENCHMARK_CONFIDENCE_MULTIPLIER,
  rankModels,
  scaleScore,
  SPEED_CONFIDENCE_MULTIPLIER,
  weakestEvidence,
} from '../../src/ranker/algorithm.js';
import type {
  BenchmarkEvidence,
  BenchmarkObservation,
  BenchmarkSnapshot,
} from '../../src/ranker/benchmarks/types.js';
import { emptySnapshot } from '../../src/ranker/benchmarks/types.js';
import type { LiveObservation, RankerCandidate, RankInput } from '../../src/ranker/types.js';

const SNAPSHOT_DATE = '2026-05-29';

/** Apple Silicon M3 Max (36 GB unified memory) profile, sized to fit 32B-class GGUF candidates. */
const M3_MAX_36GB: HardwareProfile = {
  platform: 'macos',
  vramGb: 36,
  ramGb: 36,
  bandwidthGbps: 300,
  gpuName: 'Apple M3 Max',
  cpuName: 'Apple M3 Max',
  detectedAt: SNAPSHOT_DATE,
};

/** Tiny CPU-only profile so 32B candidates blow past the fit gate. */
const CPU_ONLY: HardwareProfile = {
  platform: 'cpu',
  vramGb: 0,
  ramGb: 8,
  bandwidthGbps: 60,
  cpuName: 'Test CPU',
  detectedAt: SNAPSHOT_DATE,
};

const QWEN_32B: RankerCandidate = {
  hfRepoId: 'Qwen/Qwen3-32B-GGUF',
  ollamaName: 'qwen3:32b',
  sizeB: 32,
  quant: 'Q4_K_M',
};

const DEEPSEEK_32B: RankerCandidate = {
  hfRepoId: 'deepseek-ai/DeepSeek-R1-Distill-Qwen-32B-GGUF',
  ollamaName: 'deepseek-r1:32b',
  sizeB: 32,
  quant: 'Q4_K_M',
};

const LLAMA_70B: RankerCandidate = {
  hfRepoId: 'meta-llama/Llama-3.3-70B-Instruct-GGUF',
  ollamaName: 'llama3.3:70b',
  sizeB: 70,
  quant: 'Q4_K_M',
};

/** Build a snapshot with one observation per provided `(repo, evidence, observedAt, value)`. */
function buildSnapshot(
  rows: ReadonlyArray<{
    hfRepoId: string;
    family: string;
    sizeB: number;
    observations: BenchmarkObservation[];
  }>
): BenchmarkSnapshot {
  return {
    version: 1,
    generatedAt: SNAPSHOT_DATE,
    source: 'snapshot',
    models: rows.map((r) => ({
      hfRepoId: r.hfRepoId,
      family: r.family,
      sizeB: r.sizeB,
      observations: r.observations,
    })),
  };
}

/** Helper: a snapshot date offset by N months (calendar-approximate via MS_PER_MONTH). */
const MS_PER_MONTH = 1000 * 60 * 60 * 24 * 30;
function monthsBefore(months: number): string {
  return new Date(Date.parse(SNAPSHOT_DATE) - months * MS_PER_MONTH).toISOString().slice(0, 10);
}

function freshDirectObservation(value: number): BenchmarkObservation {
  return {
    source: 'open-llm-leaderboard',
    benchmark: 'mmlu',
    value,
    evidence: 'direct',
    observedAt: SNAPSHOT_DATE,
  };
}

describe('rankModels — composition (OT1)', () => {
  it('composes VRAM + speed + merge for a fits-hardware candidate with direct evidence', () => {
    const snapshot = buildSnapshot([
      {
        hfRepoId: QWEN_32B.hfRepoId,
        family: 'qwen3',
        sizeB: QWEN_32B.sizeB,
        observations: [freshDirectObservation(80)],
      },
    ]);
    const input: RankInput = {
      candidates: [QWEN_32B],
      hardware: M3_MAX_36GB,
      snapshot,
    };
    const result = rankModels(input);
    expect(result.ranked).toHaveLength(1);
    const [top] = result.ranked;
    expect(top).toBeDefined();
    if (!top) return;
    expect(top.fitsHardware).toBe(true);
    expect(top.score).toBeGreaterThan(0);
    expect(top.score).toBeLessThanOrEqual(100);
    expect(top.evidence).toBe('direct');
    expect(top.ollamaName).toBe('qwen3:32b');
    expect(top.vramEstimate.totalGb).toBeCloseTo(top.estimatedVramGb, 6);
    expect(top.speedEstimate.tokPerSec).toBeCloseTo(top.estimatedTokPerSec, 6);
    expect(result.warnings).toHaveLength(0);
    expect(result.snapshotDate).toBe(SNAPSHOT_DATE);
  });
});

describe("rankModels — won't-fit handling (OT2 / OT3)", () => {
  it("filters won't-fit candidates out of the default result (F3 / Q3)", () => {
    const snapshot = buildSnapshot([
      {
        hfRepoId: QWEN_32B.hfRepoId,
        family: 'qwen3',
        sizeB: QWEN_32B.sizeB,
        observations: [freshDirectObservation(80)],
      },
    ]);
    const result = rankModels({
      candidates: [QWEN_32B],
      hardware: CPU_ONLY,
      snapshot,
    });
    expect(result.ranked).toHaveLength(0);
  });

  it("includes won't-fit candidates when includeUnfit is set, with score 0 and 0 tok/s", () => {
    const snapshot = buildSnapshot([
      {
        hfRepoId: QWEN_32B.hfRepoId,
        family: 'qwen3',
        sizeB: QWEN_32B.sizeB,
        observations: [freshDirectObservation(80)],
      },
    ]);
    const result = rankModels({
      candidates: [QWEN_32B],
      hardware: CPU_ONLY,
      snapshot,
      options: { includeUnfit: true },
    });
    expect(result.ranked).toHaveLength(1);
    const [row] = result.ranked;
    expect(row).toBeDefined();
    if (!row) return;
    expect(row.fitsHardware).toBe(false);
    expect(row.score).toBe(0);
    expect(row.estimatedTokPerSec).toBe(0);
  });

  it('every default-result row has fitsHardware=true and estimatedVramGb <= hardware.vramGb (Q3)', () => {
    const snapshot = buildSnapshot([
      {
        hfRepoId: QWEN_32B.hfRepoId,
        family: 'qwen3',
        sizeB: QWEN_32B.sizeB,
        observations: [freshDirectObservation(80)],
      },
      {
        hfRepoId: LLAMA_70B.hfRepoId,
        family: 'llama-3',
        sizeB: LLAMA_70B.sizeB,
        observations: [freshDirectObservation(85)],
      },
    ]);
    const result = rankModels({
      candidates: [QWEN_32B, LLAMA_70B],
      hardware: M3_MAX_36GB,
      snapshot,
    });
    for (const row of result.ranked) {
      expect(row.fitsHardware).toBe(true);
      expect(row.estimatedVramGb).toBeLessThanOrEqual(M3_MAX_36GB.vramGb);
    }
  });
});

describe('rankModels — evidence ordering (OT4 / Q4)', () => {
  it('ranks direct evidence strictly above self-reported at the same raw value', () => {
    const snapshot = buildSnapshot([
      {
        hfRepoId: QWEN_32B.hfRepoId,
        family: 'qwen3',
        sizeB: QWEN_32B.sizeB,
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
        hfRepoId: DEEPSEEK_32B.hfRepoId,
        family: 'deepseek-r1',
        sizeB: DEEPSEEK_32B.sizeB,
        observations: [
          {
            source: 'open-llm-leaderboard',
            benchmark: 'mmlu',
            value: 80,
            evidence: 'self-reported',
            observedAt: SNAPSHOT_DATE,
          },
        ],
      },
    ]);
    const result = rankModels({
      candidates: [QWEN_32B, DEEPSEEK_32B],
      hardware: M3_MAX_36GB,
      snapshot,
    });
    expect(result.ranked).toHaveLength(2);
    const [first, second] = result.ranked;
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    if (!first || !second) return;
    expect(first.hfRepoId).toBe(QWEN_32B.hfRepoId);
    expect(first.evidence).toBe('direct');
    expect(second.evidence).toBe('self-reported');
    expect(first.score).toBeGreaterThan(second.score);
  });

  it('flags the row with the weakest grade among contributions (single self-reported wins)', () => {
    const snapshot = buildSnapshot([
      {
        hfRepoId: QWEN_32B.hfRepoId,
        family: 'qwen3',
        sizeB: QWEN_32B.sizeB,
        observations: [
          {
            source: 'open-llm-leaderboard',
            benchmark: 'mmlu',
            value: 80,
            evidence: 'direct',
            observedAt: SNAPSHOT_DATE,
          },
          {
            source: 'hf-popularity',
            benchmark: 'hf-popularity',
            value: 60,
            evidence: 'self-reported',
            observedAt: SNAPSHOT_DATE,
          },
        ],
      },
    ]);
    const result = rankModels({
      candidates: [QWEN_32B],
      hardware: M3_MAX_36GB,
      snapshot,
    });
    const [top] = result.ranked;
    expect(top).toBeDefined();
    if (!top) return;
    expect(top.evidence).toBe('self-reported');
  });
});

describe('rankModels — recency demotion (OT5 / Q5)', () => {
  it('ranks the fresh observation strictly above the 18-month-old one', () => {
    const snapshot = buildSnapshot([
      {
        hfRepoId: QWEN_32B.hfRepoId,
        family: 'qwen3',
        sizeB: QWEN_32B.sizeB,
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
        hfRepoId: DEEPSEEK_32B.hfRepoId,
        family: 'deepseek-r1',
        sizeB: DEEPSEEK_32B.sizeB,
        observations: [
          {
            source: 'open-llm-leaderboard',
            benchmark: 'mmlu',
            value: 80,
            evidence: 'direct',
            observedAt: monthsBefore(18),
          },
        ],
      },
    ]);
    const result = rankModels({
      candidates: [QWEN_32B, DEEPSEEK_32B],
      hardware: M3_MAX_36GB,
      snapshot,
    });
    const [first, second] = result.ranked;
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    if (!first || !second) return;
    expect(first.hfRepoId).toBe(QWEN_32B.hfRepoId);
    expect(first.score).toBeGreaterThan(second.score);
  });
});

describe('rankModels — empty input (OT6)', () => {
  it('returns no rows + no warnings on empty candidates', () => {
    const result = rankModels({
      candidates: [],
      hardware: M3_MAX_36GB,
      snapshot: emptySnapshot(SNAPSHOT_DATE),
    });
    expect(result.ranked).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it('scores a candidate with no contributions as 0 / interpolated / low confidence', () => {
    const result = rankModels({
      candidates: [QWEN_32B],
      hardware: M3_MAX_36GB,
      snapshot: emptySnapshot(SNAPSHOT_DATE),
    });
    expect(result.ranked).toHaveLength(1);
    const [row] = result.ranked;
    expect(row).toBeDefined();
    if (!row) return;
    expect(row.evidence).toBe('interpolated');
    expect(row.score).toBe(0);
    expect(row.benchmarkScore.confidence).toBe('low');
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]?.code).toBe('snapshot_unavailable');
  });
});

describe('rankModels — deterministic tie-break (OT7)', () => {
  it('breaks ties on tokPerSec desc then hfRepoId asc', () => {
    // Identical observations -> identical merged score, identical scaling.
    const snapshot = buildSnapshot([
      {
        hfRepoId: QWEN_32B.hfRepoId,
        family: 'qwen3',
        sizeB: QWEN_32B.sizeB,
        observations: [freshDirectObservation(70)],
      },
      {
        hfRepoId: DEEPSEEK_32B.hfRepoId,
        family: 'deepseek-r1',
        sizeB: DEEPSEEK_32B.sizeB,
        observations: [freshDirectObservation(70)],
      },
    ]);
    const result = rankModels({
      candidates: [DEEPSEEK_32B, QWEN_32B],
      hardware: M3_MAX_36GB,
      snapshot,
    });
    // Same sizeB / quant / hardware -> same vram + speed math -> identical
    // tokPerSec, so the deterministic alphabetical tie-break wins:
    // 'Qwen/...' sorts before 'deepseek-ai/...' lexicographically (uppercase Q < lowercase d).
    // Verify the order is at least stable + deterministic.
    expect(result.ranked).toHaveLength(2);
    const ids = result.ranked.map((r) => r.hfRepoId);
    const sorted = [...ids].sort();
    expect(ids).toEqual(sorted);
  });
});

describe('rankModels — snapshot-unavailable warning (OT8 / S4)', () => {
  it('emits a single snapshot_unavailable warning when no observations are present', () => {
    const result = rankModels({
      candidates: [QWEN_32B, DEEPSEEK_32B],
      hardware: M3_MAX_36GB,
      snapshot: emptySnapshot(SNAPSHOT_DATE),
    });
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]?.code).toBe('snapshot_unavailable');
    // Per-candidate VRAM / speed still populated so the dashboard can render
    // an explanation row.
    for (const row of result.ranked) {
      expect(row.vramEstimate.totalGb).toBeGreaterThan(0);
    }
  });

  it('does not emit snapshot_unavailable when at least one observation exists', () => {
    const snapshot = buildSnapshot([
      {
        hfRepoId: QWEN_32B.hfRepoId,
        family: 'qwen3',
        sizeB: QWEN_32B.sizeB,
        observations: [freshDirectObservation(70)],
      },
    ]);
    const result = rankModels({
      candidates: [QWEN_32B, DEEPSEEK_32B],
      hardware: M3_MAX_36GB,
      snapshot,
    });
    expect(result.warnings).toEqual([]);
  });
});

describe('rankModels — live observations pair by hfRepoId', () => {
  it('unions liveObservations into the candidate matching its hfRepoId', () => {
    const live: LiveObservation[] = [
      {
        hfRepoId: QWEN_32B.hfRepoId,
        source: 'open-llm-leaderboard',
        benchmark: 'mmlu',
        value: 90,
        evidence: 'direct',
        observedAt: SNAPSHOT_DATE,
      },
    ];
    const result = rankModels({
      candidates: [QWEN_32B, DEEPSEEK_32B],
      hardware: M3_MAX_36GB,
      snapshot: emptySnapshot(SNAPSHOT_DATE),
      liveObservations: live,
    });
    const qwen = result.ranked.find((r) => r.hfRepoId === QWEN_32B.hfRepoId);
    const deepseek = result.ranked.find((r) => r.hfRepoId === DEEPSEEK_32B.hfRepoId);
    expect(qwen).toBeDefined();
    expect(deepseek).toBeDefined();
    if (!qwen || !deepseek) return;
    expect(qwen.benchmarkScore.contributions).toHaveLength(1);
    expect(deepseek.benchmarkScore.contributions).toHaveLength(0);
    expect(qwen.score).toBeGreaterThan(deepseek.score);
  });
});

describe('rankModels — limit truncates result', () => {
  it('returns at most options.limit rows', () => {
    const snapshot = buildSnapshot([
      {
        hfRepoId: QWEN_32B.hfRepoId,
        family: 'qwen3',
        sizeB: QWEN_32B.sizeB,
        observations: [freshDirectObservation(85)],
      },
      {
        hfRepoId: DEEPSEEK_32B.hfRepoId,
        family: 'deepseek-r1',
        sizeB: DEEPSEEK_32B.sizeB,
        observations: [freshDirectObservation(70)],
      },
    ]);
    const result = rankModels({
      candidates: [QWEN_32B, DEEPSEEK_32B],
      hardware: M3_MAX_36GB,
      snapshot,
      options: { limit: 1 },
    });
    expect(result.ranked).toHaveLength(1);
    expect(result.ranked[0]?.hfRepoId).toBe(QWEN_32B.hfRepoId);
  });
});

describe('weakestEvidence helper', () => {
  const cases: Array<{ grades: BenchmarkEvidence[]; expected: BenchmarkEvidence }> = [
    { grades: [], expected: 'interpolated' },
    { grades: ['direct'], expected: 'direct' },
    { grades: ['direct', 'variant'], expected: 'variant' },
    { grades: ['direct', 'self-reported'], expected: 'self-reported' },
    { grades: ['base', 'interpolated'], expected: 'interpolated' },
  ];
  for (const { grades, expected } of cases) {
    it(`returns ${expected} for ${JSON.stringify(grades)}`, () => {
      expect(weakestEvidence(grades)).toBe(expected);
    });
  }
});

describe('scaleScore helper', () => {
  it('returns 0 when fitsHardware is false', () => {
    expect(
      scaleScore({
        mergedScore: 90,
        fitsHardware: false,
        speedConfidence: 'high',
        benchmarkConfidence: 'high',
      })
    ).toBe(0);
  });

  it('multiplies by both confidence multipliers when fitsHardware is true', () => {
    expect(
      scaleScore({
        mergedScore: 100,
        fitsHardware: true,
        speedConfidence: 'high',
        benchmarkConfidence: 'high',
      })
    ).toBe(100 * SPEED_CONFIDENCE_MULTIPLIER.high * BENCHMARK_CONFIDENCE_MULTIPLIER.high);
    expect(
      scaleScore({
        mergedScore: 100,
        fitsHardware: true,
        speedConfidence: 'low',
        benchmarkConfidence: 'low',
      })
    ).toBe(100 * SPEED_CONFIDENCE_MULTIPLIER.low * BENCHMARK_CONFIDENCE_MULTIPLIER.low);
  });

  it('is monotonic in speed confidence (high >= medium >= low)', () => {
    const args = { mergedScore: 50, fitsHardware: true, benchmarkConfidence: 'high' as const };
    const high = scaleScore({ ...args, speedConfidence: 'high' });
    const medium = scaleScore({ ...args, speedConfidence: 'medium' });
    const low = scaleScore({ ...args, speedConfidence: 'low' });
    expect(high).toBeGreaterThanOrEqual(medium);
    expect(medium).toBeGreaterThanOrEqual(low);
  });

  it('is monotonic in benchmark confidence (high >= medium >= low)', () => {
    const args = { mergedScore: 50, fitsHardware: true, speedConfidence: 'high' as const };
    const high = scaleScore({ ...args, benchmarkConfidence: 'high' });
    const medium = scaleScore({ ...args, benchmarkConfidence: 'medium' });
    const low = scaleScore({ ...args, benchmarkConfidence: 'low' });
    expect(high).toBeGreaterThanOrEqual(medium);
    expect(medium).toBeGreaterThanOrEqual(low);
  });
});
