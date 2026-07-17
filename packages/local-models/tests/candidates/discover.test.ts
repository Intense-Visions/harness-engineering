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

/** Sort-aware fake: `listing[author][sort]` lets a test return different ids per sort. */
function sortAwareClient(
  listing: Record<string, Partial<Record<string, HuggingFaceModel[]>>>,
  details: Record<string, HuggingFaceModelDetail>,
  opts: { throwOnSort?: string } = {}
) {
  const calls = { list: [] as Array<{ author: string; sort: string }>, get: [] as string[] };
  return {
    calls,
    client: {
      async listModels(o: { author?: string; sort?: string }) {
        const author = o.author ?? '';
        const sort = o.sort ?? 'downloads';
        calls.list.push({ author, sort });
        if (opts.throwOnSort && sort === opts.throwOnSort) throw new Error(`HF ${sort} 503`);
        return listing[author]?.[sort] ?? [];
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

const WIDE_CURATION = new Map<string, CurationTags>([
  ['Qwen/Qwen3-32B-GGUF', { ollamaName: 'qwen3:32b', family: 'qwen3' }],
  ['Qwen/Qwen3.6-27B-GGUF', { ollamaName: 'qwen3.6:27b', family: 'qwen3' }],
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

describe('discoverCandidates wide-net (SC1)', () => {
  it('SC1: includes a NEW model returned only under `trending` (absent from `downloads`)', async () => {
    const { client } = sortAwareClient(
      {
        Qwen: {
          downloads: [{ id: 'Qwen/Qwen3-32B-GGUF', tags: ['gguf'] } as HuggingFaceModel],
          trending: [{ id: 'Qwen/Qwen3.6-27B-GGUF', tags: ['gguf'] } as HuggingFaceModel],
        },
      },
      {
        'Qwen/Qwen3-32B-GGUF': detail('Qwen/Qwen3-32B-GGUF', ['Q4_K_M']),
        'Qwen/Qwen3.6-27B-GGUF': detail('Qwen/Qwen3.6-27B-GGUF', ['Q4_K_M']),
      }
    );
    const res = await discoverCandidates({ orgs: ['Qwen'], curation: WIDE_CURATION, client });
    const ids = res.candidates.map((c) => c.hfRepoId);
    expect(ids).toContain('Qwen/Qwen3.6-27B-GGUF'); // trending-only new model reaches the pool
    expect(ids).toContain('Qwen/Qwen3-32B-GGUF'); // established still present
  });

  it('SC2: dedupes overlap by id and caps the inspected set at perOrgLimit', async () => {
    const shared = { id: 'Qwen/Qwen3-32B-GGUF', tags: ['gguf'] } as HuggingFaceModel;
    const { client, calls } = sortAwareClient(
      {
        Qwen: {
          downloads: [shared, { id: 'Qwen/Qwen3.6-27B-GGUF', tags: ['gguf'] } as HuggingFaceModel],
          trending: [shared], // overlaps downloads → must dedupe, not double
        },
      },
      {
        'Qwen/Qwen3-32B-GGUF': detail('Qwen/Qwen3-32B-GGUF', ['Q4_K_M']),
        'Qwen/Qwen3.6-27B-GGUF': detail('Qwen/Qwen3.6-27B-GGUF', ['Q4_K_M']),
      }
    );
    await discoverCandidates({ orgs: ['Qwen'], curation: WIDE_CURATION, client, perOrgLimit: 5 });
    // shared id fetched exactly once (deduped across the two sorts)
    const sharedFetches = calls.get.filter((id) => id === 'Qwen/Qwen3-32B-GGUF');
    expect(sharedFetches).toHaveLength(1);
    // both sorts were queried
    expect(calls.list.map((c) => c.sort).sort()).toEqual(['downloads', 'trending']);
  });

  it('SC2: never inspects more than perOrgLimit distinct repos', async () => {
    const many = (n: number) =>
      Array.from(
        { length: n },
        (_, i) => ({ id: `Qwen/M${i}-GGUF`, tags: ['gguf'] }) as HuggingFaceModel
      );
    const { client, calls } = sortAwareClient(
      { Qwen: { downloads: many(4), trending: many(4).map((m) => ({ ...m, id: m.id + 'T' })) } },
      {}
    );
    // getModel throws for all (uncurated) — we only assert the cap on inspection count
    await discoverCandidates({ orgs: ['Qwen'], curation: WIDE_CURATION, client, perOrgLimit: 3 });
    expect(calls.get.length).toBeLessThanOrEqual(3);
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
