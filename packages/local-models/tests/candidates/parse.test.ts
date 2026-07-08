import { describe, it, expect } from 'vitest';
import {
  extractSizeB,
  extractQuantFromFilename,
  parseHfModelToCandidates,
} from '../../src/candidates/parse.js';
import type { HuggingFaceModelDetail } from '../../src/huggingface/index.js';

function model(id: string, rfilenames: string[]): HuggingFaceModelDetail {
  return {
    id,
    downloads: 0,
    likes: 0,
    tags: ['gguf'],
    siblings: rfilenames.map((rfilename) => ({ rfilename })),
  };
}

describe('extractSizeB', () => {
  it('reads a dense parameter count from the repo id', () => {
    expect(extractSizeB('Qwen/Qwen3-32B-GGUF')).toEqual({ sizeB: 32 });
    expect(extractSizeB('Qwen/Qwen3-8B')).toEqual({ sizeB: 8 });
  });

  it('ignores version numbers that carry no B suffix (picks the largest B token)', () => {
    expect(extractSizeB('meta-llama/Llama-3.3-70B-Instruct-GGUF')).toEqual({ sizeB: 70 });
    expect(extractSizeB('meta-llama/Llama-3.1-405B')).toEqual({ sizeB: 405 });
  });

  it('reads fractional sizes', () => {
    expect(extractSizeB('Qwen/Qwen2.5-1.5B-Instruct')).toEqual({ sizeB: 1.5 });
  });

  it('reads MoE naming as total + active', () => {
    expect(extractSizeB('mistralai/Mixtral-8x7B-v0.1')).toEqual({ sizeB: 56, activeB: 7 });
  });

  it('returns null when there is no size token', () => {
    expect(extractSizeB('deepseek-ai/DeepSeek-V2.5')).toBeNull();
    expect(extractSizeB('some/random-model')).toBeNull();
  });
});

describe('extractQuantFromFilename', () => {
  it('extracts K-quants from GGUF filenames', () => {
    expect(extractQuantFromFilename('Qwen3-32B-Q4_K_M.gguf')).toBe('Q4_K_M');
    expect(extractQuantFromFilename('model.Q8_0.gguf')).toBe('Q8_0');
    expect(extractQuantFromFilename('model-Q4_0.gguf')).toBe('Q4_0');
  });

  it('extracts importance-quants and float formats', () => {
    expect(extractQuantFromFilename('model-IQ4_XS.gguf')).toBe('IQ4_XS');
    expect(extractQuantFromFilename('model-f16.gguf')).toBe('f16');
    expect(extractQuantFromFilename('model.BF16.gguf')).toBe('BF16');
  });

  it('extracts the quant from a sharded filename', () => {
    expect(extractQuantFromFilename('Qwen3-32B-Q4_K_M-00001-of-00002.gguf')).toBe('Q4_K_M');
  });

  it('returns null for non-gguf files and quant-less names', () => {
    expect(extractQuantFromFilename('README.md')).toBeNull();
    expect(extractQuantFromFilename('model.safetensors')).toBeNull();
    expect(extractQuantFromFilename('config.json')).toBeNull();
    expect(extractQuantFromFilename('model-nonsense.gguf')).toBeNull();
  });
});

describe('parseHfModelToCandidates', () => {
  it('produces one candidate per recognised quant, with size from the repo id', () => {
    const detail = model('Qwen/Qwen3-32B-GGUF', [
      'Qwen3-32B-Q4_K_M.gguf',
      'Qwen3-32B-Q8_0.gguf',
      'README.md',
    ]);
    const candidates = parseHfModelToCandidates(detail);
    expect(candidates).toEqual([
      { hfRepoId: 'Qwen/Qwen3-32B-GGUF', sizeB: 32, quant: 'Q4_K_M' },
      { hfRepoId: 'Qwen/Qwen3-32B-GGUF', sizeB: 32, quant: 'Q8_0' },
    ]);
  });

  it('deduplicates a quant repeated across shards', () => {
    const detail = model('Qwen/Qwen3-32B-GGUF', [
      'Qwen3-32B-Q4_K_M-00001-of-00002.gguf',
      'Qwen3-32B-Q4_K_M-00002-of-00002.gguf',
    ]);
    expect(parseHfModelToCandidates(detail)).toEqual([
      { hfRepoId: 'Qwen/Qwen3-32B-GGUF', sizeB: 32, quant: 'Q4_K_M' },
    ]);
  });

  it('returns [] when the size cannot be determined', () => {
    expect(parseHfModelToCandidates(model('some/no-size-model', ['x-Q4_K_M.gguf']))).toEqual([]);
  });

  it('returns [] when no GGUF quant is recognised', () => {
    expect(parseHfModelToCandidates(model('Qwen/Qwen3-32B-GGUF', ['model.safetensors']))).toEqual(
      []
    );
  });

  it('honors a size override for models whose name lacks a param count', () => {
    const detail = model('some/custom-model', ['custom-Q4_K_M.gguf']);
    expect(parseHfModelToCandidates(detail, { sizeOverride: 12 })).toEqual([
      { hfRepoId: 'some/custom-model', sizeB: 12, quant: 'Q4_K_M' },
    ]);
  });

  it('carries MoE active params through to the candidate', () => {
    const detail = model('mistralai/Mixtral-8x7B-v0.1', ['mixtral-8x7b-Q4_K_M.gguf']);
    expect(parseHfModelToCandidates(detail)).toEqual([
      { hfRepoId: 'mistralai/Mixtral-8x7B-v0.1', sizeB: 56, activeB: 7, quant: 'Q4_K_M' },
    ]);
  });
});
