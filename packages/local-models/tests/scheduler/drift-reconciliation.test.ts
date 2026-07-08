import { describe, it, expect, vi } from 'vitest';
import { runRefreshTick, type RefreshTickDeps } from '../../src/scheduler/refresh.js';
import { PoolManager } from '../../src/pool/manager.js';
import { PoolStateStore, type PoolFilesystem } from '../../src/pool/state.js';
import type { PoolState } from '../../src/pool/types.js';
import type { HardwareProfile } from '../../src/hardware/types.js';
import type { RemoteModelInfo } from '../../src/installer/index.js';
import type { RecommendResult } from '../../src/recommender/native.js';

/**
 * F10 (Observable Truth #7): install a model, remove it from Ollama, run a tick
 * → the pool entry is removed, its disk budget is freed, TickResult reports the
 * removal, and the drift is surfaced through the pool's log seam (D12 silent
 * reconciliation — the orchestrator maps this onWarn callback to logger.warn).
 */

const HARDWARE: HardwareProfile = {
  platform: 'macos',
  vramGb: 48,
  ramGb: 64,
  bandwidthGbps: 400,
  cpuName: 'Apple M4 Max',
  detectedAt: '2026-07-07T00:00:00.000Z',
};

function memFs(): PoolFilesystem {
  const files: Record<string, string> = {};
  return {
    async readFile(path) {
      if (path in files) return files[path] as string;
      const err = new Error(`ENOENT: ${path}`) as Error & { code: string };
      err.code = 'ENOENT';
      throw err;
    },
    async writeFile(path, contents) {
      files[path] = contents;
    },
    async rename(from, to) {
      files[to] = files[from] as string;
      delete files[from];
    },
    async mkdir() {},
  };
}

const EMPTY_STATE: PoolState = {
  diskBudgetGb: 200,
  diskUsedGb: 0,
  entries: [],
  allowedOrgs: ['Qwen'],
  allowedFamilies: [],
  lastRefreshAt: null,
};

/** A fake installer whose `list()` result is mutable to simulate `ollama rm`. */
function driftInstaller(listRef: { value: RemoteModelInfo[] }) {
  return {
    async install({ name }: { name: string }) {
      return { status: 'success' as const, name };
    },
    async evict({ name }: { name: string }) {
      return { status: 'success' as const, name };
    },
    async list() {
      return listRef.value;
    },
    async inspect({ name }: { name: string }) {
      return { ollamaName: name, sizeOnDiskGb: 20 };
    },
  };
}

function recommendEmpty(): RecommendResult {
  return { ranked: [], snapshotLoaded: true, hfReachable: true, warnings: [] };
}

describe('F10 drift reconciliation', () => {
  it('removes an ollama-rm-ed pool entry, frees its budget, reports + logs the removal', async () => {
    const path = '/tmp/lmlm-drift/pool.json';
    const fs = memFs();
    await fs.writeFile(path, JSON.stringify({ version: 1, state: EMPTY_STATE }, null, 2));
    const store = new PoolStateStore({ path, fs });
    await store.load();

    // list() initially reports the model as present on the installer.
    const listRef = { value: [{ ollamaName: 'qwen3:8b', sizeOnDiskGb: 20 }] as RemoteModelInfo[] };
    const onWarn = vi.fn();
    const manager = new PoolManager({
      store,
      installer: driftInstaller(listRef) as never,
      onWarn,
    });

    // Install qwen3:8b (20 GB) → pool tracks it, budget consumed.
    const installResult = await manager.install({
      hfRepoId: 'Qwen/Qwen3-8B-GGUF',
      ollamaName: 'qwen3:8b',
      sizeOnDiskGb: 20,
    });
    expect(installResult.status).toBe('success');
    expect(manager.snapshot().diskUsedGb).toBe(20);
    expect(manager.snapshot().entries.map((e) => e.ollamaName)).toEqual(['qwen3:8b']);

    // Simulate `ollama rm qwen3:8b`: the installer no longer reports it.
    listRef.value = [];

    const emitProposal = vi.fn(async () => {});
    const deps: RefreshTickDeps = {
      detectHardware: async () => HARDWARE,
      recommend: async () => recommendEmpty(),
      poolManager: manager,
      dedupSource: async () => ({ pending: [], rejected: [] }),
      emitProposal,
      proposalThreshold: 5,
    };

    const result = await runRefreshTick(deps);

    // Pool converges: the drifted entry is gone and its budget is freed.
    expect(manager.snapshot().entries).toEqual([]);
    expect(manager.snapshot().diskUsedGb).toBe(0);
    // TickResult reports the reconciliation.
    expect(result.reconciledRemoved).toContain('qwen3:8b');
    expect(result.errors).toEqual([]);
    // No swap proposals (empty ranking).
    expect(emitProposal).not.toHaveBeenCalled();
    // Drift is surfaced through the pool's log seam (D12).
    expect(onWarn).toHaveBeenCalled();
    const messages = onWarn.mock.calls.map((c) => String(c[0]));
    expect(messages.some((m) => /reconcile removed qwen3:8b/.test(m))).toBe(true);
  });
});
