import { describe, it, expect } from 'vitest';
import { buildJustification } from '../../src/proposals/justification.js';
import type { RankedModel } from '../../src/ranker/types.js';

const target = {
  hfRepoId: 'Qwen/Qwen3-32B-GGUF',
  ollamaName: 'qwen3:32b',
  estimatedVramGb: 27,
  score: 82,
  evidence: 'direct',
  benchmarkSnapshot: '2026-05-21',
  fitsHardware: true,
} as unknown as RankedModel;

describe('buildJustification', () => {
  it('renders a swap rationale with benchmark basis + hardware fit', () => {
    const j = buildJustification({ target, currentScore: 71.4, vramGb: 32 });
    expect(j.summary).toMatch(/qwen3:32b/);
    // Scores render as whole numbers — 71.4 → 71.
    expect(j.benchmarkBasis[0]).toMatch(/82.*\b71\b|\b71\b.*82/);
    expect(j.hardwareFit).toMatch(/27.*32/);
    expect(j.evidence).toBe('direct');
    expect(j.freshness).toMatch(/2026-05-21/);
  });

  it('rounds raw score/VRAM floats so they never leak into the rationale', () => {
    const noisy = {
      ...target,
      score: 57.629999999999995,
      estimatedVramGb: 18.067657947540283,
    } as unknown as RankedModel;
    const j = buildJustification({ target: noisy, currentScore: 54.57, vramGb: 63.9999 });
    // Absolute scores → whole; GB → at most one decimal.
    expect(j.summary).toContain('score 58');
    expect(j.summary).toContain('scoring 55');
    expect(j.hardwareFit).toBe('18.1GB VRAM est; you have 64GB');
    // No long float ever reaches the operator.
    expect(j.summary).not.toMatch(/\d\.\d{3,}/);
    expect(j.benchmarkBasis.join(' ')).not.toMatch(/\d\.\d{3,}/);
  });

  it('renders an add rationale (no current member) without a comparison', () => {
    const j = buildJustification({ target, vramGb: 32 });
    expect(j.summary).toMatch(/qwen3:32b/);
    expect(j.benchmarkBasis[0]).toMatch(/82/);
    expect(j.hardwareFit).toMatch(/27.*32/);
  });
});
