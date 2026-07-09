import { describe, it, expect } from 'vitest';
import {
  discoverCandidates,
  curationFromCandidates,
  type CurationTags,
} from '../../src/candidates/discover.js';
import type { HuggingFaceModel, HuggingFaceModelDetail } from '../../src/huggingface/types.js';
import type { FrozenCandidate } from '../../src/candidates/types.js';

/** Minimal HF model detail with GGUF siblings the parser recognises. */
function detail(id: string, quants: string[]): HuggingFaceModelDetail {
  return {
    id,
    tags: ['gguf'],
    siblings: quants.map((q) => ({ rfilename: `${id.split('/')[1]}-${q}.gguf` })),
  } as unknown as HuggingFaceModelDetail;
}

function fakeClient(
  listing: Record<string, HuggingFaceModel[]>,
  details: Record<string, HuggingFaceModelDetail>
) {
  const calls = { list: [] as string[], get: [] as string[] };
  return {
    calls,
    client: {
      async listModels(o: { author?: string }) {
        calls.list.push(o.author ?? '');
        return listing[o.author ?? ''] ?? [];
      },
      async getModel(id: string) {
        calls.get.push(id);
        const d = details[id];
        if (!d) throw new Error(`no detail for ${id}`);
        return d;
      },
    },
  };
}

const CURATION = new Map<string, CurationTags>([
  ['Qwen/Qwen3-32B-GGUF', { ollamaName: 'qwen3:32b', family: 'qwen3' }],
]);

describe('discoverCandidates', () => {
  it('merges curated ollamaName/family onto live-parsed candidates', async () => {
    const { client } = fakeClient(
      { Qwen: [{ id: 'Qwen/Qwen3-32B-GGUF', tags: ['gguf'] } as HuggingFaceModel] },
      { 'Qwen/Qwen3-32B-GGUF': detail('Qwen/Qwen3-32B-GGUF', ['Q4_K_M', 'Q8_0']) }
    );
    const res = await discoverCandidates({ orgs: ['Qwen'], curation: CURATION, client });
    expect(res.candidates.length).toBeGreaterThan(0);
    for (const c of res.candidates) {
      expect(c.ollamaName).toBe('qwen3:32b'); // curation applied
      expect(c.family).toBe('qwen3');
      expect(c.hfRepoId).toBe('Qwen/Qwen3-32B-GGUF');
    }
  });

  it('DROPS a discovered model with no curated ollamaName (decision A — uninstallable)', async () => {
    const { client } = fakeClient(
      {
        Qwen: [
          { id: 'Qwen/Qwen3-32B-GGUF', tags: ['gguf'] } as HuggingFaceModel,
          { id: 'Qwen/BrandNew-99B-GGUF', tags: ['gguf'] } as HuggingFaceModel, // not curated
        ],
      },
      {
        'Qwen/Qwen3-32B-GGUF': detail('Qwen/Qwen3-32B-GGUF', ['Q4_K_M']),
        'Qwen/BrandNew-99B-GGUF': detail('Qwen/BrandNew-99B-GGUF', ['Q4_K_M']),
      }
    );
    const res = await discoverCandidates({ orgs: ['Qwen'], curation: CURATION, client });
    expect(res.candidates.every((c) => c.hfRepoId === 'Qwen/Qwen3-32B-GGUF')).toBe(true);
    expect(res.candidates.some((c) => c.hfRepoId === 'Qwen/BrandNew-99B-GGUF')).toBe(false);
  });

  it('is fail-soft: an org list error is recorded, other orgs still contribute', async () => {
    const client = {
      async listModels(o: { author?: string }) {
        if (o.author === 'broken') throw new Error('HF 503');
        return [{ id: 'Qwen/Qwen3-32B-GGUF', tags: ['gguf'] } as HuggingFaceModel];
      },
      async getModel() {
        return detail('Qwen/Qwen3-32B-GGUF', ['Q4_K_M']);
      },
    };
    const res = await discoverCandidates({ orgs: ['broken', 'Qwen'], curation: CURATION, client });
    expect(res.warnings.some((w) => /broken/.test(w))).toBe(true);
    expect(res.candidates.length).toBeGreaterThan(0); // Qwen still discovered
  });

  it('skips models not tagged gguf', async () => {
    const { client, calls } = fakeClient(
      { Qwen: [{ id: 'Qwen/Qwen3-32B', tags: ['safetensors'] } as HuggingFaceModel] },
      {}
    );
    const res = await discoverCandidates({ orgs: ['Qwen'], curation: CURATION, client });
    expect(res.candidates).toHaveLength(0);
    expect(calls.get).toHaveLength(0); // never fetched the non-gguf model
  });
});

describe('curationFromCandidates', () => {
  it('maps hfRepoId → ollamaName/family, ignoring entries without an ollamaName', () => {
    const frozen: FrozenCandidate[] = [
      {
        hfRepoId: 'Qwen/Qwen3-32B-GGUF',
        sizeB: 32,
        quant: 'Q4_K_M',
        ollamaName: 'qwen3:32b',
        family: 'qwen3',
      },
      { hfRepoId: 'Org/NoName-GGUF', sizeB: 8, quant: 'Q4_K_M' }, // no ollamaName → skipped
    ];
    const map = curationFromCandidates(frozen);
    expect(map.get('Qwen/Qwen3-32B-GGUF')).toEqual({ ollamaName: 'qwen3:32b', family: 'qwen3' });
    expect(map.has('Org/NoName-GGUF')).toBe(false);
  });
});
