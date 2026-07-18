import { describe, expect, it } from 'vitest';

import type { HardwareProfile } from '../../src/hardware/types.js';
import { rankModels } from '../../src/ranker/algorithm.js';
import { scoreAgentic, DEFAULT_LATENCY_BUDGET_MS } from '../../src/ranker/agentic.js';
import type { BenchmarkObservation, BenchmarkSnapshot } from '../../src/ranker/benchmarks/types.js';
import type { RankerCandidate } from '../../src/ranker/types.js';
import { scoreBuildQuality, type HarnessFitResult } from '../../src/capability/harness-fit.js';

/**
 * SC2 — the end-to-end PURE path:
 *   HarnessFitResult → scoreBuildQuality → buildQuality → scoreAgentic → rank order.
 *
 * Two OTHERWISE-IDENTICAL candidates (same benchmark score, same toolCalling=true,
 * same measured latency) differ only in the probe verdict feeding buildQuality. The
 * act-and-converge model must rank ABOVE the narrate-only model on `agenticScore`.
 * No real probe runs — the HarnessFitResults are injected observations (D3).
 */

const SNAPSHOT_DATE = '2026-07-18';

const M3_MAX_36GB: HardwareProfile = {
  platform: 'macos',
  vramGb: 36,
  ramGb: 36,
  bandwidthGbps: 300,
  gpuName: 'Apple M3 Max',
  cpuName: 'Apple M3 Max',
  detectedAt: SNAPSHOT_DATE,
};

/** The narrate-only failure mode (llama3.3:70b): 1 tool call, no artifact, no convergence. */
const NARRATED: HarnessFitResult = {
  converged: false,
  toolCalls: 1,
  filesTouched: 0,
  retries: 0,
};

/** The act-and-converge success mode (gpt-oss:20b): explored, wrote code, gate passed. */
const CONVERGED: HarnessFitResult = {
  converged: true,
  toolCalls: 6,
  filesTouched: 2,
  retries: 0,
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

// Both sized to fit the 36GB profile so neither is filtered as unfit — buildQuality,
// not hardware, must be the only thing separating them. (The real head-to-head's
// llama3.3:70b is the narrate-mode inspiration, but here we need both to fit.)
const NARRATE_MODEL: RankerCandidate = {
  hfRepoId: 'meta/Llama-3.1-8B-GGUF',
  ollamaName: 'llama3.1:8b',
  sizeB: 8,
  quant: 'Q4_K_M',
};

const CONVERGE_MODEL: RankerCandidate = {
  hfRepoId: 'openai/gpt-oss-20b-GGUF',
  ollamaName: 'gpt-oss:20b',
  sizeB: 20,
  quant: 'Q4_K_M',
};

describe('SC2 — buildQuality from scoreBuildQuality moves scoreAgentic', () => {
  it('a HIGH-buildQuality (converged) candidate out-scores a LOW (narrated) one at equal everything else', () => {
    const narratedBq = scoreBuildQuality(NARRATED)!;
    const convergedBq = scoreBuildQuality(CONVERGED)!;

    // Sanity: the pure mapping produced a genuine low/high split.
    expect(narratedBq).toBeLessThan(convergedBq);

    // Identical inputs except the probe-derived buildQuality.
    const base = {
      latencyBudgetMs: DEFAULT_LATENCY_BUDGET_MS,
      benchmarkScore: 80,
      speedTokPerSec: 40,
      fitsHardware: true,
      toolCalling: true as const,
      measuredAgenticLatencyMs: 2_000,
    };
    const narrated = scoreAgentic({ ...base, buildQuality: narratedBq });
    const converged = scoreAgentic({ ...base, buildQuality: convergedBq });

    expect(narrated.agenticEligible).toBe(true);
    expect(converged.agenticEligible).toBe(true);
    // The narrate-only model ranks BELOW the act-and-converge model on agenticScore.
    expect(converged.agenticScore).toBeGreaterThan(narrated.agenticScore);
  });
});

describe('SC2 — the effect survives the full rankModels path', () => {
  it('feeding buildQuality per-candidate re-orders the two by agenticScore (converge over narrate)', () => {
    // Equal benchmark score so ONLY buildQuality can separate their agenticScore.
    const snapshot: BenchmarkSnapshot = {
      version: 1,
      generatedAt: SNAPSHOT_DATE,
      source: 'snapshot',
      models: [
        {
          hfRepoId: NARRATE_MODEL.hfRepoId,
          family: 'llama3.1',
          sizeB: 8,
          observations: [directObs(80)],
        },
        {
          hfRepoId: CONVERGE_MODEL.hfRepoId,
          family: 'gpt-oss',
          sizeB: 20,
          observations: [directObs(80)],
        },
      ],
    };

    // Identical agentic signals; only the probe verdict (→ buildQuality) differs.
    const candidates: RankerCandidate[] = [
      {
        ...NARRATE_MODEL,
        toolCalling: true,
        measuredAgenticLatencyMs: 2_000,
        buildQuality: scoreBuildQuality(NARRATED),
      },
      {
        ...CONVERGE_MODEL,
        toolCalling: true,
        measuredAgenticLatencyMs: 2_000,
        buildQuality: scoreBuildQuality(CONVERGED),
      },
    ];

    const result = rankModels({ candidates, hardware: M3_MAX_36GB, snapshot });
    const narrate = result.ranked.find((r) => r.hfRepoId === NARRATE_MODEL.hfRepoId)!;
    const converge = result.ranked.find((r) => r.hfRepoId === CONVERGE_MODEL.hfRepoId)!;

    // Both eligible (both tool-call, both under budget) — buildQuality alone separates them.
    expect(narrate.agenticEligible).toBe(true);
    expect(converge.agenticEligible).toBe(true);
    expect(converge.agenticScore).toBeGreaterThan(narrate.agenticScore);

    // Sorting for dispatch by agenticScore puts the act-and-converge model first.
    const byAgentic = [...result.ranked].sort((a, b) => b.agenticScore - a.agenticScore);
    expect(byAgentic[0]!.hfRepoId).toBe(CONVERGE_MODEL.hfRepoId);
  });
});
