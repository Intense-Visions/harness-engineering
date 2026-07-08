import { describe, it, expect } from 'vitest';
import { loadFrozenCandidates, validateFrozenCandidates } from '../../src/candidates/frozen.js';
import { normalizeQuantId } from '../../src/ranker/index.js';

describe('loadFrozenCandidates (bundled snapshot)', () => {
  it('loads the bundled snapshot with no warnings', () => {
    const result = loadFrozenCandidates();
    expect(result.source).toBe('frozen');
    expect(result.warnings).toEqual([]);
    expect(result.candidates.length).toBeGreaterThan(0);
  });

  it('every bundled candidate has a valid size and a recognised quant', () => {
    for (const c of loadFrozenCandidates().candidates) {
      expect(c.sizeB).toBeGreaterThan(0);
      expect(normalizeQuantId(c.quant).known).toBe(true);
      expect(c.hfRepoId).toContain('/');
    }
  });

  it('covers the three allow-listed orgs so the default config is non-empty', () => {
    const orgs = new Set(loadFrozenCandidates().candidates.map((c) => c.hfRepoId.split('/')[0]));
    expect(orgs).toContain('Qwen');
    expect(orgs).toContain('deepseek-ai');
    expect(orgs).toContain('meta-llama');
  });
});

describe('loadFrozenCandidates (degradation)', () => {
  it('falls back to an empty list with a warning on a schema-invalid override', () => {
    const result = loadFrozenCandidates({ version: 99, candidates: [] });
    expect(result.source).toBe('fallback');
    expect(result.candidates).toEqual([]);
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});

describe('validateFrozenCandidates', () => {
  it('accepts a well-formed document', () => {
    const parsed = validateFrozenCandidates({
      version: 1,
      generatedAt: '2026-07-08',
      source: 'seed',
      candidates: [{ hfRepoId: 'Qwen/Qwen3-8B-GGUF', sizeB: 8, quant: 'q4' }],
    });
    expect(parsed.ok).toBe(true);
    // 'q4' is aliased to the canonical 'Q4_K_M'.
    if (parsed.ok) expect(parsed.candidates[0]!.quant).toBe('Q4_K_M');
  });

  it('rejects an unsupported version', () => {
    const parsed = validateFrozenCandidates({ version: 2, candidates: [] });
    expect(parsed.ok).toBe(false);
  });

  it('rejects a candidate with an unrecognised quant', () => {
    const parsed = validateFrozenCandidates({
      version: 1,
      candidates: [{ hfRepoId: 'Qwen/X', sizeB: 8, quant: 'totally-made-up' }],
    });
    expect(parsed.ok).toBe(false);
  });

  it('rejects a candidate with a non-positive size', () => {
    const parsed = validateFrozenCandidates({
      version: 1,
      candidates: [{ hfRepoId: 'Qwen/X', sizeB: 0, quant: 'Q4_K_M' }],
    });
    expect(parsed.ok).toBe(false);
  });
});
