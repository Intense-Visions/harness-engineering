import { describe, expect, it } from 'vitest';

import type { HardwareProfile } from '../../src/hardware/types.js';
import { BACKEND_EFFICIENCY, estimateSpeed } from '../../src/ranker/speed.js';
import { estimateVram } from '../../src/ranker/vram.js';

const M3_MAX_36GB: HardwareProfile = {
  platform: 'macos',
  vramGb: 36,
  ramGb: 36, // unified — same number reported by Phase 1's detector
  bandwidthGbps: 400,
  gpuName: 'Apple M3 Max',
  cpuName: 'Apple M3 Max',
  detectedAt: '2026-05-29T00:00:00.000Z',
};

const RTX_4090: HardwareProfile = {
  platform: 'nvidia',
  vramGb: 24,
  ramGb: 64,
  bandwidthGbps: 1008,
  gpuName: 'NVIDIA GeForce RTX 4090',
  cpuName: 'AMD Ryzen 9 7950X 16-Core Processor',
  detectedAt: '2026-05-29T00:00:00.000Z',
};

const CPU_HOST: HardwareProfile = {
  platform: 'cpu',
  vramGb: 0,
  ramGb: 64,
  bandwidthGbps: 80,
  cpuName: 'AMD Ryzen 9 7950X 16-Core Processor',
  detectedAt: '2026-05-29T00:00:00.000Z',
};

const TINY_HOST: HardwareProfile = {
  platform: 'cpu',
  vramGb: 4,
  ramGb: 8,
  bandwidthGbps: 40,
  cpuName: 'tiny',
  detectedAt: '2026-05-29T00:00:00.000Z',
};

describe('estimateSpeed — Apple Silicon full-fit (OT5)', () => {
  it('projects Qwen3 32B Q4_K_M on M3 Max in the 10–30 t/s band with high confidence', () => {
    const v = estimateVram({ sizeB: 32, quant: 'Q4_K_M' });
    const s = estimateSpeed({
      sizeB: 32,
      quant: 'Q4_K_M',
      hardware: M3_MAX_36GB,
      vramEstimate: v,
    });
    expect(s.partialOffloadFraction).toBe(0);
    expect(s.effectiveBandwidthGbps).toBe(M3_MAX_36GB.bandwidthGbps);
    expect(s.backend).toBe('mlx');
    expect(s.tokPerSec).toBeGreaterThanOrEqual(10);
    expect(s.tokPerSec).toBeLessThanOrEqual(30);
    expect(s.confidence).toBe('high');
  });
});

describe('estimateSpeed — NVIDIA partial-offload (OT6)', () => {
  it('drops tokPerSec below the would-be full-fit projection when 70B Q4 spills past 24 GB VRAM', () => {
    const v = estimateVram({ sizeB: 70, quant: 'Q4_K_M' });
    expect(v.totalGb).toBeGreaterThan(RTX_4090.vramGb);

    const s = estimateSpeed({
      sizeB: 70,
      quant: 'Q4_K_M',
      hardware: RTX_4090,
      vramEstimate: v,
    });
    expect(s.partialOffloadFraction).toBeGreaterThan(0);
    expect(s.partialOffloadFraction).toBeLessThan(1);
    expect(s.backend).toBe('llama-cpp');

    // Would-be full-fit projection — same math but pretend everything fit.
    const wouldBeFullFit = (RTX_4090.bandwidthGbps * 0.55) / v.weightsGb;
    expect(s.tokPerSec).toBeLessThan(wouldBeFullFit);

    // 70B Q4 spills ~49% over 24 GB → confidence stays 'medium' (threshold is > 0.5 for 'low').
    expect(s.confidence === 'medium' || s.confidence === 'low').toBe(true);
  });

  it('confidence drops to low when the offload share exceeds 0.5', () => {
    // 70B Q4 on 12 GB VRAM forces >50% spillover.
    const tightVramHost: HardwareProfile = { ...RTX_4090, vramGb: 12 };
    const v = estimateVram({ sizeB: 70, quant: 'Q4_K_M' });
    const s = estimateSpeed({
      sizeB: 70,
      quant: 'Q4_K_M',
      hardware: tightVramHost,
      vramEstimate: v,
    });
    expect(s.partialOffloadFraction).toBeGreaterThan(0.5);
    expect(s.confidence).toBe('low');
  });
});

describe('estimateSpeed — MoE active params (OT7)', () => {
  it('matches the dense projection at the same bandwidth when activeB equals sizeB', () => {
    const v = estimateVram({ sizeB: 30, quant: 'Q4_K_M' });
    const dense = estimateSpeed({
      sizeB: 30,
      quant: 'Q4_K_M',
      hardware: M3_MAX_36GB,
      vramEstimate: v,
    });
    const echoed = estimateSpeed({
      sizeB: 30,
      activeB: 30,
      quant: 'Q4_K_M',
      hardware: M3_MAX_36GB,
      vramEstimate: v,
    });
    expect(echoed.tokPerSec).toBeCloseTo(dense.tokPerSec, 6);
  });

  it('projects MoE 30B-A3B at >= 4× the dense-30B throughput', () => {
    const v = estimateVram({ sizeB: 30, activeB: 3, quant: 'Q4_K_M' });
    const moe = estimateSpeed({
      sizeB: 30,
      activeB: 3,
      quant: 'Q4_K_M',
      hardware: M3_MAX_36GB,
      vramEstimate: v,
    });
    const dense = estimateSpeed({
      sizeB: 30,
      quant: 'Q4_K_M',
      hardware: M3_MAX_36GB,
      vramEstimate: v,
    });
    expect(moe.tokPerSec).toBeGreaterThanOrEqual(dense.tokPerSec * 4);
    expect(moe.activeWeightsGb).toBeLessThan(dense.activeWeightsGb);
  });
});

describe('estimateSpeed — CPU profile (OT8)', () => {
  it('returns non-zero throughput with low confidence and full offload', () => {
    const v = estimateVram({ sizeB: 7, quant: 'Q4_K_M' });
    const s = estimateSpeed({
      sizeB: 7,
      quant: 'Q4_K_M',
      hardware: CPU_HOST,
      vramEstimate: v,
    });
    expect(s.tokPerSec).toBeGreaterThan(0);
    expect(s.confidence).toBe('low');
    expect(s.partialOffloadFraction).toBe(1);
    expect(s.backend).toBe('cpu');
  });
});

describe("estimateSpeed — model won't fit at all (OT9)", () => {
  it('returns zero throughput and low confidence when totalGb exceeds vram + ram', () => {
    const v = estimateVram({ sizeB: 70, quant: 'Q4_K_M' });
    expect(v.totalGb).toBeGreaterThan(TINY_HOST.vramGb + TINY_HOST.ramGb);

    const s = estimateSpeed({
      sizeB: 70,
      quant: 'Q4_K_M',
      hardware: TINY_HOST,
      vramEstimate: v,
    });
    expect(s.tokPerSec).toBe(0);
    expect(s.confidence).toBe('low');
    expect(s.partialOffloadFraction).toBe(1);
    expect(s.effectiveBandwidthGbps).toBe(0);
  });
});

describe('estimateSpeed — unknown quant downgrades confidence', () => {
  it('returns low confidence even for a fully-fitting full-VRAM scenario when the quant is unknown', () => {
    // 32B at 8 bits/weight = 32 GB → fits in M3 Max 36 GB (with a little headroom for KV).
    const v = estimateVram({ sizeB: 32, quant: 'not-a-quant', contextTokens: 1024 });
    const s = estimateSpeed({
      sizeB: 32,
      quant: 'not-a-quant',
      hardware: M3_MAX_36GB,
      vramEstimate: v,
    });
    expect(v.quantWarning).toBe('quant_unknown');
    expect(s.confidence).toBe('low');
  });
});

describe('estimateSpeed — backend override', () => {
  it('honours an explicit backend over the platform default', () => {
    const v = estimateVram({ sizeB: 32, quant: 'Q4_K_M' });
    const mlxDefault = estimateSpeed({
      sizeB: 32,
      quant: 'Q4_K_M',
      hardware: M3_MAX_36GB,
      vramEstimate: v,
    });
    const ollamaOverride = estimateSpeed({
      sizeB: 32,
      quant: 'Q4_K_M',
      hardware: M3_MAX_36GB,
      vramEstimate: v,
      backend: 'ollama',
    });
    expect(mlxDefault.backend).toBe('mlx');
    expect(ollamaOverride.backend).toBe('ollama');
    // MLX efficiency (0.70) > Ollama efficiency (0.55); throughput should reflect that.
    expect(mlxDefault.tokPerSec).toBeGreaterThan(ollamaOverride.tokPerSec);
  });
});
