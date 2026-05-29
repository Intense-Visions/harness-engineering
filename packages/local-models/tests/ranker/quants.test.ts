import { describe, expect, it } from 'vitest';

import {
  QUANT_BITS_PER_WEIGHT,
  UNKNOWN_QUANT_BITS_PER_WEIGHT,
  normalizeQuantId,
} from '../../src/ranker/quants.js';

describe('normalizeQuantId', () => {
  it('returns the canonical key verbatim for an exact match', () => {
    const result = normalizeQuantId('Q4_K_M');
    expect(result.canonical).toBe('Q4_K_M');
    expect(result.known).toBe(true);
    expect(result.bitsPerWeight).toBe(QUANT_BITS_PER_WEIGHT.Q4_K_M);
  });

  it('matches case-insensitively', () => {
    const lower = normalizeQuantId('q4_k_m');
    expect(lower.canonical).toBe('Q4_K_M');
    expect(lower.known).toBe(true);

    const mixed = normalizeQuantId('q4_K_m');
    expect(mixed.canonical).toBe('Q4_K_M');
    expect(mixed.known).toBe(true);
  });

  it('trims whitespace before matching', () => {
    const padded = normalizeQuantId('  Q5_K_M  ');
    expect(padded.canonical).toBe('Q5_K_M');
    expect(padded.known).toBe(true);
  });

  it('resolves documented MLX aliases', () => {
    expect(normalizeQuantId('mlx-q4').canonical).toBe('MLX-4bit');
    expect(normalizeQuantId('mlx-q4').known).toBe(true);
    expect(normalizeQuantId('MLX-Q8').canonical).toBe('MLX-8bit');
    expect(normalizeQuantId('mlx-4-bit').canonical).toBe('MLX-4bit');
  });

  it('resolves shorthand precision aliases', () => {
    expect(normalizeQuantId('fp16').canonical).toBe('FP16');
    expect(normalizeQuantId('bf16').canonical).toBe('BF16');
    expect(normalizeQuantId('q8').canonical).toBe('Q8_0');
    expect(normalizeQuantId('q4').canonical).toBe('Q4_K_M');
  });

  it('returns unknown for inputs that do not map', () => {
    const result = normalizeQuantId('not-a-quant');
    expect(result.known).toBe(false);
    expect(result.bitsPerWeight).toBe(UNKNOWN_QUANT_BITS_PER_WEIGHT);
    expect(result.canonical).toBe('not-a-quant');
  });

  it('treats the empty string as unknown without throwing', () => {
    const result = normalizeQuantId('');
    expect(result.known).toBe(false);
    expect(result.bitsPerWeight).toBe(UNKNOWN_QUANT_BITS_PER_WEIGHT);
  });

  it('keeps every registered key resolvable through normalizeQuantId', () => {
    for (const [canonical, bits] of Object.entries(QUANT_BITS_PER_WEIGHT)) {
      const result = normalizeQuantId(canonical);
      expect(result.known).toBe(true);
      expect(result.canonical).toBe(canonical);
      expect(result.bitsPerWeight).toBe(bits);
    }
  });
});
