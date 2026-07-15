import { describe, it, expect } from 'vitest';
import { poolStateToCandidates } from '../../src/pool/provider.js';
import type { PoolStateProvider } from '../../src/pool/provider.js';
import { EmptyPoolState, type PoolEntry, type PoolState } from '../../src/pool/types.js';
import { PoolStateStore } from '../../src/pool/state.js';
import { PoolManager } from '../../src/pool/manager.js';

const entry = (ollamaName: string, currentScore: number): PoolEntry => ({
  ollamaName,
  hfRepoId: `Org/${ollamaName}`,
  sizeOnDiskGb: 1,
  installedAt: '2026-07-07T00:00:00.000Z',
  lastUsedAt: null,
  currentScore,
});

describe('poolStateToCandidates', () => {
  it('orders ollamaNames by currentScore descending', () => {
    const state: PoolState = {
      ...EmptyPoolState(),
      entries: [entry('llama3:8b', 50), entry('qwen3:32b', 80)],
    };
    expect(poolStateToCandidates(state)).toEqual(['qwen3:32b', 'llama3:8b']);
  });

  it('returns [] for an empty pool', () => {
    expect(poolStateToCandidates(EmptyPoolState())).toEqual([]);
  });

  it('does not mutate the input entries array', () => {
    const entries = [entry('a', 1), entry('b', 2)];
    const state: PoolState = { ...EmptyPoolState(), entries };
    poolStateToCandidates(state);
    expect(entries.map((e) => e.ollamaName)).toEqual(['a', 'b']);
  });

  it('T15: orders by the requested profile score, not currentScore', () => {
    // 'coder' has the lower composite score but the higher CODING profile score.
    const coder: PoolEntry = {
      ...entry('coder:7b', 60),
      scoresByProfile: { coding: 95, reasoning: 30 },
    };
    const generalist: PoolEntry = {
      ...entry('generalist:32b', 85),
      scoresByProfile: { coding: 50, reasoning: 88 },
    };
    const state: PoolState = { ...EmptyPoolState(), entries: [coder, generalist] };

    // No profile → composite order (generalist first).
    expect(poolStateToCandidates(state)).toEqual(['generalist:32b', 'coder:7b']);
    // Coding profile → the coding specialist wins.
    expect(poolStateToCandidates(state, 'coding')).toEqual(['coder:7b', 'generalist:32b']);
    // Reasoning profile → the generalist wins.
    expect(poolStateToCandidates(state, 'reasoning')).toEqual(['generalist:32b', 'coder:7b']);
  });

  it('T15: falls back to currentScore when an entry lacks the requested profile score', () => {
    const withProfile: PoolEntry = {
      ...entry('a:7b', 40),
      scoresByProfile: { coding: 90 },
    };
    const withoutProfile = entry('b:7b', 70); // no scoresByProfile → uses 70
    const state: PoolState = { ...EmptyPoolState(), entries: [withProfile, withoutProfile] };

    // For coding: a=90 (profile) vs b=70 (fallback currentScore) → a first.
    expect(poolStateToCandidates(state, 'coding')).toEqual(['a:7b', 'b:7b']);
  });
});

describe('poolStateToCandidates — requireToolCalling filter (agentic build gate)', () => {
  const withTool = (name: string, score: number, toolCalling?: boolean): PoolEntry => ({
    ...entry(name, score),
    ...(toolCalling !== undefined ? { toolCalling } : {}),
  });

  it('excludes entries KNOWN not to tool-call (toolCalling === false)', () => {
    const state: PoolState = {
      ...EmptyPoolState(),
      entries: [withTool('coder:7b', 90, false), withTool('qwen3:32b', 50, true)],
    };
    // coder:7b outranks 32b by score but can't tool-call → dropped for a build.
    expect(poolStateToCandidates(state, undefined, { requireToolCalling: true })).toEqual([
      'qwen3:32b',
    ]);
  });

  it('KEEPS entries with unknown capability (toolCalling === undefined) — fail-open', () => {
    const state: PoolState = {
      ...EmptyPoolState(),
      entries: [withTool('unprobed:8b', 80), withTool('qwen3:32b', 50, true)],
    };
    expect(poolStateToCandidates(state, undefined, { requireToolCalling: true })).toEqual([
      'unprobed:8b',
      'qwen3:32b',
    ]);
  });

  it('does NOT filter when requireToolCalling is absent/false (byte-identical to before)', () => {
    const state: PoolState = {
      ...EmptyPoolState(),
      entries: [withTool('coder:7b', 90, false), withTool('qwen3:32b', 50, true)],
    };
    expect(poolStateToCandidates(state)).toEqual(['coder:7b', 'qwen3:32b']);
    expect(poolStateToCandidates(state, undefined, { requireToolCalling: false })).toEqual([
      'coder:7b',
      'qwen3:32b',
    ]);
  });

  it('preserves score ordering among the survivors', () => {
    const state: PoolState = {
      ...EmptyPoolState(),
      entries: [
        withTool('a:8b', 30, true),
        withTool('dud:7b', 99, false),
        withTool('b:32b', 60, true),
      ],
    };
    expect(poolStateToCandidates(state, undefined, { requireToolCalling: true })).toEqual([
      'b:32b',
      'a:8b',
    ]);
  });

  it('round-trips toolCalling through PoolStateStore persist/load (additive field)', async () => {
    const fs = new Map<string, string>();
    const backend = {
      readFile: async (p: string) => {
        const v = fs.get(p);
        if (v === undefined) throw Object.assign(new Error('nf'), { code: 'ENOENT' });
        return v;
      },
      writeFile: async (p: string, c: string) => void fs.set(p, c),
      rename: async (from: string, to: string) => {
        fs.set(to, fs.get(from)!);
        fs.delete(from);
      },
      mkdir: async () => undefined,
    };
    const store = new PoolStateStore({ path: '/pool.json', fs: backend });
    await store.load();
    store.update((s) => ({ ...s, entries: [withTool('qwen3:32b', 50, true)] }));
    await store.persist();

    const reloaded = new PoolStateStore({ path: '/pool.json', fs: backend });
    await reloaded.load();
    expect(reloaded.snapshot().entries[0]?.toolCalling).toBe(true);
  });
});

describe('PoolStateProvider structural conformance', () => {
  it('PoolStateStore satisfies PoolStateProvider', () => {
    const provider: PoolStateProvider = new PoolStateStore();
    expect(typeof provider.snapshot).toBe('function');
  });

  it('PoolManager satisfies PoolStateProvider', () => {
    const provider: PoolStateProvider = new PoolManager({
      store: new PoolStateStore(),
      // Null-ish installer stand-in is acceptable — snapshot() never touches it.
      installer: {} as never,
    });
    expect(typeof provider.snapshot).toBe('function');
  });
});
