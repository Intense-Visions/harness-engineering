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
