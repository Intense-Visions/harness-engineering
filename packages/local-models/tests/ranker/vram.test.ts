import { describe, expect, it } from 'vitest';

import type { ModelShape } from '../../src/ranker/model-shape.js';
import {
  QUANT_BITS,
  RUNTIME_OVERHEAD_GB,
  estimateActivationsGb,
  estimateKvCacheGb,
  estimateVram,
  estimateWeightsGb,
} from '../../src/ranker/vram.js';

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

const deepseek_moe_100_15: ModelShape = {
  paramsB: 100,
  activeParamsB: 15,
  layers: 60,
  hiddenSize: 5120,
  numAttnHeads: 40,
  numKvHeads: 8,
  headDim: 128,
  vocabSize: 152064,
  contextLen: 8192,
  family: 'deepseek-r1',
};

describe('estimateWeightsGb', () => {
  it('computes Qwen3-32B at Q4_K_M (4.5 bits) ≈ 16.764 GiB', () => {
    const weightsGb = estimateWeightsGb(32, 4.5);
    expect(weightsGb).toBeCloseTo(16.764, 2);
  });

  it('is linear in params and bits', () => {
    const a = estimateWeightsGb(32, 4.5);
    const b = estimateWeightsGb(64, 4.5);
    const c = estimateWeightsGb(32, 9);
    expect(b).toBeCloseTo(a * 2, 6);
    expect(c).toBeCloseTo(a * 2, 6);
  });

  it('returns zero for a zero-parameter model', () => {
    expect(estimateWeightsGb(0, 4.5)).toBe(0);
  });
});

describe('estimateKvCacheGb', () => {
  it('computes Qwen3-32B GQA KV @ 4K context ≈ 1.0 GiB (FP16 default)', () => {
    const kvGb = estimateKvCacheGb({
      layers: 64,
      headDim: 128,
      numKvHeads: 8,
      contextLen: 4096,
    });
    expect(kvGb).toBeCloseTo(1.0, 6);
  });

  it('computes Qwen3-32B GQA KV @ 8K context ≈ 2.0 GiB', () => {
    const kvGb = estimateKvCacheGb({
      layers: 64,
      headDim: 128,
      numKvHeads: 8,
      contextLen: 8192,
    });
    expect(kvGb).toBeCloseTo(2.0, 6);
  });

  it('GQA collapse reduces KV by the head ratio vs MHA', () => {
    const gqaGb = estimateKvCacheGb({ layers: 64, headDim: 128, numKvHeads: 8, contextLen: 4096 });
    const mhaGb = estimateKvCacheGb({ layers: 64, headDim: 128, numKvHeads: 64, contextLen: 4096 });
    expect(mhaGb / gqaGb).toBeCloseTo(8, 6);
  });

  it('respects an explicit bytesPerEntry override (KV-Q8 = 1)', () => {
    const fp16 = estimateKvCacheGb({ layers: 64, headDim: 128, numKvHeads: 8, contextLen: 4096 });
    const kvQ8 = estimateKvCacheGb({
      layers: 64,
      headDim: 128,
      numKvHeads: 8,
      contextLen: 4096,
      bytesPerEntry: 1,
    });
    expect(kvQ8).toBeCloseTo(fp16 / 2, 6);
  });
});

describe('estimateActivationsGb', () => {
  it('Qwen3-32B activations at 8K, batch 1 ≈ 0.313 GiB', () => {
    const actGb = estimateActivationsGb({ hiddenSize: 5120, contextLen: 8192 });
    expect(actGb).toBeCloseTo(0.313, 2);
  });

  it('scales linearly in batchSize', () => {
    const b1 = estimateActivationsGb({ hiddenSize: 5120, contextLen: 8192, batchSize: 1 });
    const b4 = estimateActivationsGb({ hiddenSize: 5120, contextLen: 8192, batchSize: 4 });
    expect(b4).toBeCloseTo(b1 * 4, 6);
  });
});

describe('estimateVram', () => {
  it('Qwen3-32B Q4_K_M totals ≈ 19.6 GiB across all four buckets', () => {
    const v = estimateVram(qwen3_32b, 'Q4_K_M');
    expect(v.totalGb).toBeCloseTo(19.58, 1);
    expect(v.weightsGb).toBeCloseTo(16.764, 2);
    expect(v.kvGb).toBeCloseTo(2.0, 6);
    expect(v.activationsGb).toBeCloseTo(0.313, 2);
    expect(v.overheadGb).toBe(RUNTIME_OVERHEAD_GB);
    expect(v.quantBits).toBe(QUANT_BITS.Q4_K_M);
    expect(v.notes).toEqual([]);
  });

  it('breakdown components sum to totalGb modulo float epsilon', () => {
    const v = estimateVram(qwen3_32b, 'Q4_K_M');
    const sum = v.weightsGb + v.kvGb + v.activationsGb + v.overheadGb;
    expect(sum).toBeCloseTo(v.totalGb, 9);
  });

  it('MoE: weights bucket uses TOTAL params, not active', () => {
    const v = estimateVram(deepseek_moe_100_15, 'Q4_K_M');
    const dense100b = estimateWeightsGb(100, QUANT_BITS.Q4_K_M);
    const dense15b = estimateWeightsGb(15, QUANT_BITS.Q4_K_M);
    expect(v.weightsGb).toBeCloseTo(dense100b, 6);
    expect(v.weightsGb).toBeGreaterThan(dense15b * 5);
  });

  it('unknown quant falls back to FP16 with a structured note', () => {
    const v = estimateVram(qwen3_32b, 'NOT_A_QUANT');
    expect(v.quantBits).toBe(QUANT_BITS.FP16);
    expect(v.notes).toHaveLength(1);
    expect(v.notes[0]?.code).toBe('vram_unknown_quant');
    expect(v.weightsGb).toBeCloseTo(estimateWeightsGb(32, 16), 6);
  });

  it('respects a custom kvBytesPerEntry override', () => {
    const fp16 = estimateVram(qwen3_32b, 'Q4_K_M');
    const kvQ8 = estimateVram(qwen3_32b, 'Q4_K_M', { kvBytesPerEntry: 1 });
    expect(kvQ8.kvGb).toBeCloseTo(fp16.kvGb / 2, 6);
    expect(kvQ8.totalGb).toBeLessThan(fp16.totalGb);
  });

  it('respects a custom batchSize for activations', () => {
    const b1 = estimateVram(qwen3_32b, 'Q4_K_M');
    const b4 = estimateVram(qwen3_32b, 'Q4_K_M', { batchSize: 4 });
    expect(b4.activationsGb).toBeCloseTo(b1.activationsGb * 4, 6);
  });

  it('all listed GGUF Q-quants are recognized in the bits table', () => {
    const namedQuants = [
      'Q2_K',
      'Q3_K_M',
      'Q4_0',
      'Q4_K_M',
      'Q5_0',
      'Q5_K_M',
      'Q6_K',
      'Q8_0',
      'FP16',
      'BF16',
      'FP32',
    ];
    for (const q of namedQuants) {
      const v = estimateVram(qwen3_32b, q);
      expect(v.notes).toEqual([]);
      expect(v.quantBits).toBeGreaterThan(0);
    }
  });
});
