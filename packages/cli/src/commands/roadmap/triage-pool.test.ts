// packages/cli/src/commands/roadmap/triage-pool.test.ts
//
// Pool-first local-model selection for triage: the persisted LMLM pool is the PREFERRED source
// (top-ranked installed model for the profile); an empty/absent/broken pool degrades to
// `undefined` so the caller falls back to the static config list. Mirrors the orchestrator's
// LocalModelResolver candidate derivation.

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

describe('resolvePreferredLocalModel — pool-first selection', () => {
  it('returns the top-ranked entry for the reasoning profile', async () => {
    // qwen3:32b has no per-profile score → falls back to currentScore 54.57, still tops 8b's 9.63.
    const store = storeOf(
      poolWith([
        { name: 'qwen3:8b', score: 9.63, reasoningScore: 9.63 },
        { name: 'qwen3:32b', score: 54.57 },
        { name: 'llama3.3:70b', score: 0 },
      ])
    );
    expect(await resolvePreferredLocalModel('reasoning', { store })).toBe('qwen3:32b');
  });

  it('honors a per-profile score over currentScore when ranking', async () => {
    // 8b's reasoning score (99) beats 32b's currentScore fallback (54.57) for the reasoning profile.
    const store = storeOf(
      poolWith([
        { name: 'qwen3:8b', score: 9.63, reasoningScore: 99 },
        { name: 'qwen3:32b', score: 54.57 },
      ])
    );
    expect(await resolvePreferredLocalModel('reasoning', { store })).toBe('qwen3:8b');
  });

  it('returns undefined for an empty pool (⇒ caller falls back to the static config list)', async () => {
    const store = storeOf(poolWith([]));
    expect(await resolvePreferredLocalModel('reasoning', { store })).toBeUndefined();
  });

  it('returns undefined (never throws) when the store load fails', async () => {
    const faulty: PoolSnapshotStore = {
      load: async () => {
        throw new Error('disk on fire');
      },
      snapshot: () => poolWith([]),
    };
    await expect(
      resolvePreferredLocalModel('reasoning', { store: faulty })
    ).resolves.toBeUndefined();
  });

  it('returns undefined (never throws) when snapshot() throws', async () => {
    const faulty: PoolSnapshotStore = {
      load: async () => undefined,
      snapshot: () => {
        throw new Error('corrupt state');
      },
    };
    await expect(
      resolvePreferredLocalModel('reasoning', { store: faulty })
    ).resolves.toBeUndefined();
  });
});
