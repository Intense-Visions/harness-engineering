// packages/cli/src/commands/roadmap/triage-pool.test.ts
//
// Pool-first local-model selection for triage: the persisted LMLM pool is the PREFERRED source
// (top-ranked served model for the profile), health-checked against the endpoint's /v1/models so
// only a model the endpoint is ACTUALLY SERVING is picked. An empty/absent/broken pool, a missing
// endpoint, a failed probe, or no served candidate all degrade to `undefined` so the caller falls
// back to the static config list. Mirrors the live LocalModelResolver (rank, then intersect).

import { describe, it, expect } from 'vitest';
import type { PoolState } from '@harness-engineering/orchestrator';
import { resolvePreferredLocalModel, type PoolSnapshotStore } from './triage-pool.js';

/** Build a PoolState from a list of {name, score, reasoningScore?} entries (other fields stubbed). */
function poolWith(
  entries: Array<{ name: string; score: number; reasoningScore?: number }>
): PoolState {
  return {
    diskBudgetGb: 100,
    diskUsedGb: 0,
    allowedOrgs: [],
    allowedFamilies: [],
    lastRefreshAt: null,
    entries: entries.map((e) => ({
      ollamaName: e.name,
      hfRepoId: `stub/${e.name}`,
      sizeOnDiskGb: 1,
      installedAt: '2026-01-01T00:00:00.000Z',
      lastUsedAt: null,
      currentScore: e.score,
      ...(e.reasoningScore !== undefined
        ? { scoresByProfile: { reasoning: e.reasoningScore } }
        : {}),
    })),
  } as PoolState;
}

/** A store returning a fixed snapshot; `load()` is a no-op. */
function storeOf(state: PoolState): PoolSnapshotStore {
  return { load: async () => undefined, snapshot: () => state };
}

/** A fake `fetch` for the `/v1/models` health probe returning a fixed served set. */
function stubFetch(
  servedIds: string[],
  opts: { ok?: boolean; throwErr?: boolean } = {}
): typeof fetch {
  return (async () => {
    if (opts.throwErr) throw new Error('ECONNREFUSED');
    return {
      ok: opts.ok ?? true,
      json: async () => ({ data: servedIds.map((id) => ({ id })) }),
    } as Response;
  }) as unknown as typeof fetch;
}

const ENDPOINT = 'http://127.0.0.1:11434/v1';

describe('resolvePreferredLocalModel — pool-first, health-checked selection', () => {
  const threePool = () =>
    poolWith([
      { name: 'qwen3:8b', score: 9.63, reasoningScore: 9.63 },
      { name: 'qwen3:32b', score: 54.57 },
      { name: 'llama3.3:70b', score: 0 },
    ]);

  it('returns the top-ranked reasoning model that the endpoint serves', async () => {
    const model = await resolvePreferredLocalModel('reasoning', {
      store: storeOf(threePool()),
      endpoint: ENDPOINT,
      fetchImpl: stubFetch(['qwen3:8b', 'qwen3:32b', 'llama3.3:70b']),
    });
    expect(model).toBe('qwen3:32b'); // 54.57 currentScore fallback tops 8b's 9.63
  });

  it('honors a per-profile score over currentScore when ranking', async () => {
    const model = await resolvePreferredLocalModel('reasoning', {
      store: storeOf(
        poolWith([
          { name: 'qwen3:8b', score: 9.63, reasoningScore: 99 },
          { name: 'qwen3:32b', score: 54.57 },
        ])
      ),
      endpoint: ENDPOINT,
      fetchImpl: stubFetch(['qwen3:8b', 'qwen3:32b']),
    });
    expect(model).toBe('qwen3:8b');
  });

  it("SKIPS a top-ranked candidate the endpoint no longer serves (rm'd out-of-band) → next served", async () => {
    // qwen3:32b ranks #1 but is not served (ollama rm); fall to the next served candidate.
    const model = await resolvePreferredLocalModel('reasoning', {
      store: storeOf(threePool()),
      endpoint: ENDPOINT,
      fetchImpl: stubFetch(['qwen3:8b', 'llama3.3:70b']), // 32b absent
    });
    expect(model).toBe('qwen3:8b');
  });

  it('returns undefined when NONE of the ranked candidates are served (non-Ollama pi endpoint)', async () => {
    // A vLLM/LM-Studio endpoint serves different ids → no pool tag matches → config fallback.
    const model = await resolvePreferredLocalModel('reasoning', {
      store: storeOf(threePool()),
      endpoint: ENDPOINT,
      fetchImpl: stubFetch(['Qwen2.5-72B-Instruct']),
    });
    expect(model).toBeUndefined();
  });

  it('returns undefined when no endpoint is supplied (cannot verify → config fallback)', async () => {
    const model = await resolvePreferredLocalModel('reasoning', { store: storeOf(threePool()) });
    expect(model).toBeUndefined();
  });

  it('returns undefined when the health probe returns non-2xx', async () => {
    const model = await resolvePreferredLocalModel('reasoning', {
      store: storeOf(threePool()),
      endpoint: ENDPOINT,
      fetchImpl: stubFetch([], { ok: false }),
    });
    expect(model).toBeUndefined();
  });

  it('returns undefined (never throws) when the health probe throws', async () => {
    await expect(
      resolvePreferredLocalModel('reasoning', {
        store: storeOf(threePool()),
        endpoint: ENDPOINT,
        fetchImpl: stubFetch([], { throwErr: true }),
      })
    ).resolves.toBeUndefined();
  });

  it('returns undefined for an empty pool (before any probe)', async () => {
    const model = await resolvePreferredLocalModel('reasoning', {
      store: storeOf(poolWith([])),
      endpoint: ENDPOINT,
      fetchImpl: stubFetch(['qwen3:32b']),
    });
    expect(model).toBeUndefined();
  });

  it('returns undefined (never throws) when the store load fails', async () => {
    const faulty: PoolSnapshotStore = {
      load: async () => {
        throw new Error('disk on fire');
      },
      snapshot: () => poolWith([]),
    };
    await expect(
      resolvePreferredLocalModel('reasoning', { store: faulty, endpoint: ENDPOINT })
    ).resolves.toBeUndefined();
  });
});
