import { describe, it, expect } from 'vitest';
import type { ModelProposalRecord } from '@harness-engineering/types';
import { renderModelProposal } from '../../src/proposals/model-renderer';

function modelProposal(model: Partial<ModelProposalRecord['model']> = {}): ModelProposalRecord {
  return {
    kind: 'model',
    id: 'proposal_m1',
    createdAt: '2026-07-07T00:00:00.000Z',
    proposedBy: 'orchestrator:lmlm',
    status: 'open',
    source: { justification: 'A newer model beats the current pool member by a wide margin.' },
    model: {
      action: 'swap',
      target: { hfRepoId: 'Qwen/Qwen3-32B-GGUF', ollamaName: 'qwen3:32b' },
      replaces: { ollamaName: 'qwen2.5:32b' },
      scoreDelta: 7.4,
      justification: {
        summary: 'Qwen3 32B outscores the current pool member on LiveBench.',
        benchmarkBasis: ['LiveBench 82 vs 71.4'],
        hardwareFit: '27GB VRAM est; you have 32GB',
        evidence: 'direct',
        freshness: 'Benchmark snapshot 2026-05-21',
      },
      diskImpactGb: 3.2,
      ...model,
    },
  };
}

describe('renderModelProposal', () => {
  it('renders a swap with a source→target title and a justification body', () => {
    const { title, body } = renderModelProposal(modelProposal());
    expect(title).toBe('Swap qwen2.5:32b → qwen3:32b');
    expect(body).toMatch(/LiveBench 82 vs 71\.4/);
    expect(body).toMatch(/27GB VRAM est/);
    expect(body).toMatch(/Score delta: \+7\.4/);
    expect(body).toMatch(/Disk impact: 3\.2 GB/);
  });

  it('renders an add without a replaces arrow', () => {
    const { title } = renderModelProposal(modelProposal({ action: 'add', replaces: undefined }));
    expect(title).toBe('Add qwen3:32b');
  });

  it('renders an evict title', () => {
    const { title } = renderModelProposal(modelProposal({ action: 'evict', replaces: undefined }));
    expect(title).toBe('Evict qwen3:32b');
  });
});
