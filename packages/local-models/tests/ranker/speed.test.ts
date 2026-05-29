import { describe, expect, it } from 'vitest';

import type { HardwareProfile } from '../../src/hardware/types.js';
import type { ModelShape } from '../../src/ranker/model-shape.js';
import { BACKEND_EFFICIENCY, estimateTokPerSec, pickBackend } from '../../src/ranker/speed.js';

const qwen3_32b: ModelShape = {
  paramsB: 32,
  layers: 64,
  hiddenSize: 5120,
  numAttnHeads: 64,
  numKvHeads: 8,
  headDim: 128,
  vocabSize: 152064,
  contextLen: 8192,
  family: 'qwen3',
};

const moe_100_15: ModelShape = {
  paramsB: 100,
  activeParamsB: 15,
  layers: 60,
  hiddenSize: 5120,
  numAttnHeads: 40,
  numKvHeads: 8,
  headDim: 128,
  vocabSize: 152064,
  contextLen: 8192,
  family: 'moe-test',
};

const m3_max: HardwareProfile = {
  platform: 'macos',
  vramGb: 36,
  ramGb: 36,
  bandwidthGbps: 400,
  gpuName: 'Apple M3 Max',
  cpuName: 'Apple M3 Max',
  detectedAt: '2026-05-29T00:00:00.000Z',
};

const rtx_4090: HardwareProfile = {
  platform: 'nvidia',
  vramGb: 24,
  ramGb: 64,
  bandwidthGbps: 1008,
  gpuName: 'NVIDIA GeForce RTX 4090',
  cpuName: 'AMD Ryzen 9 7950X',
  detectedAt: '2026-05-29T00:00:00.000Z',
};

const cpu_only: HardwareProfile = {
  platform: 'cpu',
  vramGb: 0,
  ramGb: 32,
  bandwidthGbps: 100,
  cpuName: 'AMD Ryzen 9 7950X',
  detectedAt: '2026-05-29T00:00:00.000Z',
};

describe('pickBackend', () => {
  it('maps platform to backend tag', () => {
    expect(pickBackend(m3_max)).toBe('metal');
    expect(pickBackend(rtx_4090)).toBe('cuda');
    expect(pickBackend(cpu_only)).toBe('cpu');
  });
});

describe('estimateTokPerSec', () => {
  it('Qwen3-32B Q4_K_M on M3 Max lands in the 10–25 t/s envelope at high confidence', () => {
    const r = estimateTokPerSec({ shape: qwen3_32b, quant: 'Q4_K_M', hardware: m3_max });
    expect(r.tokPerSec).toBeGreaterThan(10);
    expect(r.tokPerSec).toBeLessThan(25);
    expect(r.confidence).toBe('high');
    expect(r.backend).toBe('metal');
    expect(r.notes).toEqual([]);
  });

  it('Qwen3-32B Q4_K_M on RTX 4090 lands in the 35–60 t/s envelope at high confidence', () => {
    const r = estimateTokPerSec({ shape: qwen3_32b, quant: 'Q4_K_M', hardware: rtx_4090 });
    expect(r.tokPerSec).toBeGreaterThan(35);
    expect(r.tokPerSec).toBeLessThan(60);
    expect(r.confidence).toBe('high');
    expect(r.backend).toBe('cuda');
  });

  it('RTX 4090 is materially faster than M3 Max for the same shape + quant', () => {
    const m3 = estimateTokPerSec({ shape: qwen3_32b, quant: 'Q4_K_M', hardware: m3_max });
    const nv = estimateTokPerSec({ shape: qwen3_32b, quant: 'Q4_K_M', hardware: rtx_4090 });
    expect(nv.tokPerSec).toBeGreaterThan(m3.tokPerSec * 2);
  });

  it('MoE: active-params drive throughput; a 100B-total/15B-active model is ≥ 2× as fast as dense 32B', () => {
    const dense = estimateTokPerSec({ shape: qwen3_32b, quant: 'Q4_K_M', hardware: m3_max });
    const moe = estimateTokPerSec({ shape: moe_100_15, quant: 'Q4_K_M', hardware: m3_max });
    expect(moe.tokPerSec).toBeGreaterThan(dense.tokPerSec * 2);
  });

  it('CPU-only path: confidence is "low" and tokPerSec lags M3 Max for the same shape', () => {
    const cpu = estimateTokPerSec({ shape: qwen3_32b, quant: 'Q4_K_M', hardware: cpu_only });
    const m3 = estimateTokPerSec({ shape: qwen3_32b, quant: 'Q4_K_M', hardware: m3_max });
    expect(cpu.confidence).toBe('low');
    expect(cpu.tokPerSec).toBeLessThan(m3.tokPerSec);
    expect(cpu.notes.some((n) => n.code === 'speed_cpu_fallback')).toBe(true);
  });

  it('unknown quant: confidence demotes to "medium" with a structured note', () => {
    const r = estimateTokPerSec({ shape: qwen3_32b, quant: 'MX_FP4', hardware: m3_max });
    expect(r.confidence).toBe('medium');
    expect(r.notes.some((n) => n.code === 'speed_unknown_quant')).toBe(true);
  });

  it('partial offload on NVIDIA: confidence demotes to "low" and tokPerSec drops vs full residency', () => {
    const full = estimateTokPerSec({ shape: qwen3_32b, quant: 'Q4_K_M', hardware: rtx_4090 });
    const partial = estimateTokPerSec({
      shape: qwen3_32b,
      quant: 'Q4_K_M',
      hardware: rtx_4090,
      partialOffload: { layersOffloaded: 32, dramBandwidthGbps: 50 },
    });
    expect(partial.confidence).toBe('low');
    expect(partial.tokPerSec).toBeLessThan(full.tokPerSec);
    expect(partial.notes.some((n) => n.code === 'speed_partial_offload')).toBe(true);
  });

  it('partial offload with all layers resident is a no-op (full residency)', () => {
    const full = estimateTokPerSec({ shape: qwen3_32b, quant: 'Q4_K_M', hardware: rtx_4090 });
    const fullExplicit = estimateTokPerSec({
      shape: qwen3_32b,
      quant: 'Q4_K_M',
      hardware: rtx_4090,
      partialOffload: { layersOffloaded: qwen3_32b.layers, dramBandwidthGbps: 50 },
    });
    expect(fullExplicit.tokPerSec).toBeCloseTo(full.tokPerSec, 6);
    expect(fullExplicit.confidence).toBe('high');
  });

  it('partial offload is ignored on macOS (unified memory; nothing to offload through)', () => {
    const m3 = estimateTokPerSec({ shape: qwen3_32b, quant: 'Q4_K_M', hardware: m3_max });
    const m3Partial = estimateTokPerSec({
      shape: qwen3_32b,
      quant: 'Q4_K_M',
      hardware: m3_max,
      partialOffload: { layersOffloaded: 32, dramBandwidthGbps: 50 },
    });
    expect(m3Partial.tokPerSec).toBeCloseTo(m3.tokPerSec, 6);
    expect(m3Partial.confidence).toBe('high');
  });

  it('bytesPerToken and effectiveBandwidthGbps are exposed for the dashboard breakdown', () => {
    const r = estimateTokPerSec({ shape: qwen3_32b, quant: 'Q4_K_M', hardware: rtx_4090 });
    expect(r.bytesPerToken).toBeGreaterThan(0);
    expect(r.effectiveBandwidthGbps).toBeGreaterThan(0);
    expect(r.effectiveBandwidthGbps).toBeLessThan(rtx_4090.bandwidthGbps);
  });

  it('backend efficiency table is exposed and exhaustive', () => {
    expect(BACKEND_EFFICIENCY.metal).toBeGreaterThan(0);
    expect(BACKEND_EFFICIENCY.cuda).toBeGreaterThan(BACKEND_EFFICIENCY.metal);
    expect(BACKEND_EFFICIENCY.cpu).toBeLessThan(BACKEND_EFFICIENCY.metal);
  });
});
