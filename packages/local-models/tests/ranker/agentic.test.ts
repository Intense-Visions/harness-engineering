import { describe, expect, it } from 'vitest';

import type { HardwareProfile } from '../../src/hardware/types.js';
import { rankModels } from '../../src/ranker/algorithm.js';
import {
  AGENTIC_REASON,
  DEFAULT_LATENCY_BUDGET_MS,
  scoreAgentic,
  type AgenticScoreInput,
} from '../../src/ranker/agentic.js';
import type { BenchmarkObservation, BenchmarkSnapshot } from '../../src/ranker/benchmarks/types.js';
import type { RankerCandidate, RankInput } from '../../src/ranker/types.js';

const SNAPSHOT_DATE = '2026-07-16';

const M3_MAX_36GB: HardwareProfile = {
  platform: 'macos',
  vramGb: 36,
  ramGb: 36,
  bandwidthGbps: 300,
  gpuName: 'Apple M3 Max',
  cpuName: 'Apple M3 Max',
  detectedAt: SNAPSHOT_DATE,
};

const QWEN_32B: RankerCandidate = {
  hfRepoId: 'Qwen/Qwen3-32B-GGUF',
  ollamaName: 'qwen3:32b',
  sizeB: 32,
  quant: 'Q4_K_M',
};

const CODER_7B: RankerCandidate = {
  hfRepoId: 'Qwen/Qwen2.5-Coder-7B-GGUF',
  ollamaName: 'qwen2.5-coder:7b',
  sizeB: 7,
  quant: 'Q4_K_M',
};

function directObs(value: number): BenchmarkObservation {
  return {
    source: 'open-llm-leaderboard',
    benchmark: 'mmlu',
    value,
    evidence: 'direct',
    observedAt: SNAPSHOT_DATE,
  };
}

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

/** Baseline pure-scorer input: fits, benchmark 80, healthy throughput, default budget. */
function baseInput(overrides: Partial<AgenticScoreInput> = {}): AgenticScoreInput {
  return {
    latencyBudgetMs: DEFAULT_LATENCY_BUDGET_MS,
    benchmarkScore: 80,
    speedTokPerSec: 40,
    fitsHardware: true,
    ...overrides,
  };
}

describe('scoreAgentic — tool-calling hard gate (SC2, D2)', () => {
  it('toolCalling:false ⇒ ineligible, score 0, reason names "no tool-calling"', () => {
    const r = scoreAgentic(baseInput({ toolCalling: false, measuredAgenticLatencyMs: 1000 }));
    expect(r.agenticEligible).toBe(false);
    expect(r.agenticScore).toBe(0);
    expect(r.agenticReasons).toContain(AGENTIC_REASON.noToolCalling);
    expect(AGENTIC_REASON.noToolCalling).toContain('no tool-calling');
  });

  it('toolCalling:true ⇒ eligible with a positive score', () => {
    const r = scoreAgentic(baseInput({ toolCalling: true, measuredAgenticLatencyMs: 1000 }));
    expect(r.agenticEligible).toBe(true);
    expect(r.agenticScore).toBeGreaterThan(0);
  });
});

describe('scoreAgentic — unknown tool-calling fails open (SC4, D2)', () => {
  it('toolCalling:undefined ⇒ eligible, flagged toolCallingUnknown', () => {
    const r = scoreAgentic(baseInput({ measuredAgenticLatencyMs: 1000 }));
    expect(r.agenticEligible).toBe(true);
    expect(r.agenticScore).toBeGreaterThan(0);
    expect(r.agenticReasons).toContain(AGENTIC_REASON.toolCallingUnknown);
  });
});

describe('scoreAgentic — latency gate + monotonicity (SC3, D3)', () => {
  it('measuredAgenticLatencyMs > budget ⇒ ineligible with a latency reason', () => {
    const r = scoreAgentic(
      baseInput({ toolCalling: true, measuredAgenticLatencyMs: DEFAULT_LATENCY_BUDGET_MS + 1 })
    );
    expect(r.agenticEligible).toBe(false);
    expect(r.agenticScore).toBe(0);
    expect(r.agenticReasons.join(' ')).toMatch(/latenc/i);
  });

  it('under budget ⇒ agenticScore decreases monotonically as latency rises', () => {
    const latencies = [500, 5_000, 30_000, 90_000, 119_000];
    const scores = latencies.map(
      (measuredAgenticLatencyMs) =>
        scoreAgentic(baseInput({ toolCalling: true, measuredAgenticLatencyMs })).agenticScore
    );
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i]!).toBeLessThan(scores[i - 1]!);
    }
    expect(scores.every((s) => s > 0)).toBe(true);
  });

  it('unmeasured latency ⇒ eligible but steeply discounted + flagged (measured out-scores estimated)', () => {
    const measured = scoreAgentic(
      baseInput({ toolCalling: true, measuredAgenticLatencyMs: 15_000 })
    );
    // Same effective latency, but arriving via the speed estimate (unmeasured).
    const estimated = scoreAgentic(baseInput({ toolCalling: true, speedTokPerSec: 40 }));
    expect(estimated.agenticEligible).toBe(true);
    expect(estimated.agenticReasons).toContain(AGENTIC_REASON.latencyEstimated);
    expect(estimated.agenticScore).toBeLessThan(measured.agenticScore);
  });
});

describe('rankModels — SC1: absent agentic inputs leave primary score + order unchanged', () => {
  const snapshot = buildSnapshot([
    { hfRepoId: QWEN_32B.hfRepoId, family: 'qwen3', sizeB: 32, observations: [directObs(80)] },
    { hfRepoId: CODER_7B.hfRepoId, family: 'qwen2.5-coder', sizeB: 7, observations: [directObs(70)] },
  ]);

  it('produces identical score/order with and without the (absent) agentic fields, and always populates the triple', () => {
    const input: RankInput = { candidates: [QWEN_32B, CODER_7B], hardware: M3_MAX_36GB, snapshot };
    const result = rankModels(input);
    expect(result.ranked.length).toBe(2);
    for (const row of result.ranked) {
      expect(typeof row.agenticScore).toBe('number');
      expect(typeof row.agenticEligible).toBe('boolean');
      expect(Array.isArray(row.agenticReasons)).toBe(true);
      // Absent tool-calling fails open (eligible), latency estimated → flagged.
      expect(row.agenticEligible).toBe(true);
      expect(row.agenticReasons).toContain(AGENTIC_REASON.toolCallingUnknown);
    }
    // Order is by primary score, unchanged by the agentic dimension.
    expect(result.ranked.map((r) => r.hfRepoId)).toEqual([QWEN_32B.hfRepoId, CODER_7B.hfRepoId]);
    expect(result.ranked[0]!.score).toBeGreaterThan(result.ranked[1]!.score);
  });
});

describe('rankModels — SC5: sorting by agenticScore prefers the tool-caller over a higher-raw-score model that can’t', () => {
  it('the incapable model has higher raw score but agenticScore 0; sorting by agenticScore puts the capable one first', () => {
    // Coder-7b: higher raw benchmark (90) but CANNOT tool-call.
    // Qwen-32b: lower raw benchmark (70) but CAN tool-call, fast.
    const snapshot = buildSnapshot([
      { hfRepoId: CODER_7B.hfRepoId, family: 'qwen2.5-coder', sizeB: 7, observations: [directObs(90)] },
      { hfRepoId: QWEN_32B.hfRepoId, family: 'qwen3', sizeB: 32, observations: [directObs(70)] },
    ]);
    const candidates: RankerCandidate[] = [
      { ...CODER_7B, toolCalling: false, measuredAgenticLatencyMs: 2_000 },
      { ...QWEN_32B, toolCalling: true, measuredAgenticLatencyMs: 2_000 },
    ];
    const result = rankModels({ candidates, hardware: M3_MAX_36GB, snapshot });

    const coder = result.ranked.find((r) => r.hfRepoId === CODER_7B.hfRepoId)!;
    const qwen = result.ranked.find((r) => r.hfRepoId === QWEN_32B.hfRepoId)!;

    // Default order: coder wins on raw score.
    expect(coder.score).toBeGreaterThan(qwen.score);
    expect(result.ranked[0]!.hfRepoId).toBe(CODER_7B.hfRepoId);

    // But for dispatch: coder is ineligible (score 0), qwen leads by agenticScore.
    expect(coder.agenticEligible).toBe(false);
    expect(coder.agenticScore).toBe(0);
    expect(qwen.agenticScore).toBeGreaterThan(0);

    const byAgentic = [...result.ranked].sort((a, b) => b.agenticScore - a.agenticScore);
    expect(byAgentic[0]!.hfRepoId).toBe(QWEN_32B.hfRepoId);
  });
});
