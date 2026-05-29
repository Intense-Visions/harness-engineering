import { describe, expect, it } from 'vitest';

import {
  ACTIVATIONS_GB,
  DEFAULT_CONTEXT_TOKENS,
  FRAMEWORK_OVERHEAD_GB,
  estimateVram,
} from '../../src/ranker/vram.js';

const APPROX_EPSILON = 1e-9;

describe('estimateVram — published footprint sanity ranges', () => {
  it('places Qwen3-32B Q4_K_M at 4 K context in the 20–26 GB band (OT1)', () => {
    const e = estimateVram({ sizeB: 32, quant: 'Q4_K_M' });
    expect(e.contextTokens).toBe(DEFAULT_CONTEXT_TOKENS);
    expect(e.totalGb).toBeGreaterThanOrEqual(20);
    expect(e.totalGb).toBeLessThanOrEqual(26);
    expect(e.weightsGb).toBeGreaterThanOrEqual(18);
    expect(e.weightsGb).toBeLessThanOrEqual(22);
  });

  it('places 7B Q4_K_M at 4 K context in the 5–8 GB band', () => {
    const e = estimateVram({ sizeB: 7, quant: 'Q4_K_M' });
    expect(e.totalGb).toBeGreaterThanOrEqual(5);
    expect(e.totalGb).toBeLessThanOrEqual(8);
  });

  it('places 70B Q4_K_M at 4 K context in the 42–50 GB band', () => {
    const e = estimateVram({ sizeB: 70, quant: 'Q4_K_M' });
    expect(e.totalGb).toBeGreaterThanOrEqual(42);
    expect(e.totalGb).toBeLessThanOrEqual(50);
  });
});

describe('estimateVram — KV cache scaling (OT2)', () => {
  it('doubling contextTokens doubles kvCacheGb', () => {
    const a = estimateVram({ sizeB: 32, quant: 'Q4_K_M', contextTokens: 4096 });
    const b = estimateVram({ sizeB: 32, quant: 'Q4_K_M', contextTokens: 8192 });
    expect(b.kvCacheGb).toBeGreaterThan(a.kvCacheGb);
    expect(b.kvCacheGb / a.kvCacheGb).toBeCloseTo(2, 5);
  });

  it('halves kvCacheGb when the KV cache is quantized to q8', () => {
    const fp16 = estimateVram({ sizeB: 32, quant: 'Q4_K_M', kvCacheQuant: 'fp16' });
    const q8 = estimateVram({ sizeB: 32, quant: 'Q4_K_M', kvCacheQuant: 'q8' });
    expect(q8.kvCacheGb / fp16.kvCacheGb).toBeCloseTo(0.5, 5);
  });

  it('quarters kvCacheGb when the KV cache is quantized to q4', () => {
    const fp16 = estimateVram({ sizeB: 32, quant: 'Q4_K_M', kvCacheQuant: 'fp16' });
    const q4 = estimateVram({ sizeB: 32, quant: 'Q4_K_M', kvCacheQuant: 'q4' });
    expect(q4.kvCacheGb / fp16.kvCacheGb).toBeCloseTo(0.25, 5);
  });

  it('echoes the contributors so totalGb is the sum of weights + kv + activations + overhead', () => {
    const e = estimateVram({ sizeB: 32, quant: 'Q4_K_M' });
    const sum = e.weightsGb + e.kvCacheGb + e.activationsGb + e.overheadGb;
    expect(e.totalGb).toBeCloseTo(sum, 6);
    expect(e.activationsGb).toBe(ACTIVATIONS_GB);
    expect(e.overheadGb).toBe(FRAMEWORK_OVERHEAD_GB);
  });
});

describe('estimateVram — MoE handling (OT3)', () => {
  it('sizes weights off sizeB and echoes activeB', () => {
    const moe = estimateVram({ sizeB: 30, activeB: 3, quant: 'Q4_K_M' });
    const dense = estimateVram({ sizeB: 30, quant: 'Q4_K_M' });
    // Weights track the total params — MoE does not save VRAM, only bandwidth.
    expect(moe.weightsGb).toBeCloseTo(dense.weightsGb, APPROX_EPSILON);
    expect(moe.activeB).toBe(3);
    expect(dense.activeB).toBeUndefined();
  });
});

describe('estimateVram — unknown quant (OT4)', () => {
  it('surfaces a quant_unknown warning and uses the conservative fallback', () => {
    const e = estimateVram({ sizeB: 32, quant: 'not-a-quant' });
    expect(e.quantWarning).toBe('quant_unknown');
    // The conservative fallback is 8 bits/weight (Q8-ish). 32B × 8 bits ÷ 8
    // bits/byte × 1e9 params ÷ 2^30 bytes/GiB ≈ 29.80 GiB.
    expect(e.quantBitsPerWeight).toBe(8);
    expect(e.weightsGb).toBeCloseTo(29.8, 1);
    expect(e.quant).toBe('not-a-quant');
  });

  it('does not set a quantWarning when the quant resolves through an alias', () => {
    const e = estimateVram({ sizeB: 32, quant: 'q4_k_m' });
    expect(e.quantWarning).toBeUndefined();
    expect(e.quant).toBe('Q4_K_M');
  });
});

describe('estimateVram — defaults', () => {
  it('defaults contextTokens to 4096 and kvCacheQuant to fp16', () => {
    const explicit = estimateVram({
      sizeB: 32,
      quant: 'Q4_K_M',
      contextTokens: 4096,
      kvCacheQuant: 'fp16',
    });
    const defaulted = estimateVram({ sizeB: 32, quant: 'Q4_K_M' });
    expect(defaulted.totalGb).toBeCloseTo(explicit.totalGb, APPROX_EPSILON);
  });
});
