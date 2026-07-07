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
    expect(j.benchmarkBasis[0]).toMatch(/82.*71\.4|71\.4.*82/);
    expect(j.hardwareFit).toMatch(/27.*32/);
    expect(j.evidence).toBe('direct');
    expect(j.freshness).toMatch(/2026-05-21/);
  });

  it('renders an add rationale (no current member) without a comparison', () => {
    const j = buildJustification({ target, vramGb: 32 });
    expect(j.summary).toMatch(/qwen3:32b/);
    expect(j.benchmarkBasis[0]).toMatch(/82/);
    expect(j.hardwareFit).toMatch(/27.*32/);
  });
});
