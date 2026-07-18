import { describe, it, expect } from 'vitest';
import { selectCandidates } from '../../src/candidates/select.js';
import type { FrozenCandidate } from '../../src/candidates/types.js';

const CANDIDATES: FrozenCandidate[] = [
  {
    hfRepoId: 'Qwen/Qwen3-32B-GGUF',
    ollamaName: 'qwen3:32b',
    family: 'qwen3',
    sizeB: 32,
    quant: 'Q4_K_M',
  },
  {
    hfRepoId: 'deepseek-ai/DeepSeek-R1-Distill-Qwen-32B-GGUF',
    family: 'deepseek-r1',
    sizeB: 32,
    quant: 'Q4_K_M',
  },
  {
    hfRepoId: 'meta-llama/Llama-3.3-70B-Instruct-GGUF',
    family: 'llama-3',
    sizeB: 70,
    quant: 'Q4_K_M',
  },
];

describe('selectCandidates', () => {
  it('keeps only candidates whose org is allow-listed', () => {
    const result = selectCandidates(CANDIDATES, { allowedOrgs: ['Qwen'], allowedFamilies: [] });
    expect(result.map((c) => c.hfRepoId)).toEqual(['Qwen/Qwen3-32B-GGUF']);
  });

  it('narrows further by allowedFamilies when non-empty', () => {
    const result = selectCandidates(
      [
        ...CANDIDATES,
        { hfRepoId: 'Qwen/Qwen2.5-32B-GGUF', family: 'qwen2.5', sizeB: 32, quant: 'Q4_K_M' },
      ],
      { allowedOrgs: ['Qwen'], allowedFamilies: ['qwen3'] }
    );
    expect(result.map((c) => c.hfRepoId)).toEqual(['Qwen/Qwen3-32B-GGUF']);
  });

  it('returns [] when the org allowlist is empty (nothing approved)', () => {
    expect(selectCandidates(CANDIDATES, { allowedOrgs: [], allowedFamilies: [] })).toEqual([]);
    expect(selectCandidates(CANDIDATES, undefined)).toEqual([]);
  });

  it('strips the family tag and preserves ollamaName on the returned candidate', () => {
    const [first] = selectCandidates(CANDIDATES, {
      allowedOrgs: ['Qwen'],
      allowedFamilies: [],
    });
    expect(first).toEqual({
      hfRepoId: 'Qwen/Qwen3-32B-GGUF',
      ollamaName: 'qwen3:32b',
      sizeB: 32,
      quant: 'Q4_K_M',
    });
    expect('family' in first!).toBe(false);
  });

  it('SC4: a candidate from an added leader org (openai) passes the org filter', () => {
    const withLeader: FrozenCandidate[] = [
      ...CANDIDATES,
      {
        hfRepoId: 'openai/gpt-oss-20B-GGUF',
        ollamaName: 'gpt-oss:20b',
        sizeB: 20,
        quant: 'Q4_K_M',
      },
    ];
    const result = selectCandidates(withLeader, {
      allowedOrgs: [
        'Qwen',
        'deepseek-ai',
        'meta-llama',
        'google',
        'openai',
        'zai-org',
        'THUDM',
        'moonshotai',
      ],
      allowedFamilies: [],
    });
    expect(result.map((c) => c.hfRepoId)).toContain('openai/gpt-oss-20B-GGUF');
  });
});
