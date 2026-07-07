import { describe, it, expect } from 'vitest';
import { runRefreshTick, type RefreshTickDeps } from '../../src/scheduler/refresh.js';
import { PoolManager } from '../../src/pool/manager.js';
import { PoolStateStore, type PoolFilesystem } from '../../src/pool/state.js';
import type { PoolState } from '../../src/pool/types.js';
import type { RankedModel } from '../../src/ranker/types.js';
import type { HardwareProfile } from '../../src/hardware/types.js';
import type { RemoteModelInfo } from '../../src/installer/index.js';
import type { RecommendResult } from '../../src/recommender/native.js';

const HARDWARE: HardwareProfile = {
  platform: 'macos',
  vramGb: 48,
  ramGb: 64,
  bandwidthGbps: 400,
  cpuName: 'Apple M4 Max',
  detectedAt: '2026-07-07T00:00:00.000Z',
};

function rankedModel(o: Partial<RankedModel>): RankedModel {
  return {
    hfRepoId: 'Org/Default',
    ollamaName: 'default:latest',
    sizeB: 14,
    quant: 'Q4_K_M',
    fitsHardware: true,
    evidence: 'direct',
    benchmarkSnapshot: '2026-05-21',
    estimatedVramGb: 20,
    score: 0,
    ...o,
  } as unknown as RankedModel;
}

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

async function seededPool(state: PoolState, listResult: RemoteModelInfo[]): Promise<PoolManager> {
  const path = '/tmp/lmlm-sched/pool.json';
  const fs = memFs();
  await fs.writeFile(path, JSON.stringify({ version: 1, state }, null, 2));
  const store = new PoolStateStore({ path, fs });
  await store.load();
  const installer = {
    async install({ name }: { name: string }) {
      return { status: 'success' as const, name };
    },
    async evict({ name }: { name: string }) {
      return { status: 'success' as const, name };
    },
    async list() {
      return listResult;
    },
    async inspect({ name }: { name: string }) {
      return { ollamaName: name, sizeOnDiskGb: 10 };
    },
  };
  return new PoolManager({ store, installer: installer as never });
}

function baseState(): PoolState {
  return {
    diskBudgetGb: 200,
    diskUsedGb: 20,
    entries: [
      {
        ollamaName: 'old:8b',
        hfRepoId: 'Qwen/Qwen3-8B-GGUF',
        sizeOnDiskGb: 20,
        installedAt: '2026-01-01T00:00:00.000Z',
        lastUsedAt: null,
        currentScore: 60,
      },
    ],
    allowedOrgs: ['Qwen'],
    allowedFamilies: [],
    lastRefreshAt: null,
  };
}

function recommendResult(ranked: RankedModel[]): RecommendResult {
  return { ranked, snapshotLoaded: true, hfReachable: true, warnings: [] };
}

describe('runRefreshTick (reconcile → rank → diff → emit)', () => {
  it('reconciles before diffing, emits one proposal per diff, updates scores, returns metrics', async () => {
    const pool = await seededPool(baseState(), [{ ollamaName: 'old:8b', sizeOnDiskGb: 20 }]);
    const order: string[] = [];
    const origReconcile = pool.reconcile.bind(pool);
    pool.reconcile = async (r) => {
      order.push('reconcile');
      return origReconcile(r);
    };

    const ranked = [
      rankedModel({ ollamaName: 'new:32b', hfRepoId: 'Qwen/Qwen3-32B-GGUF', sizeB: 32, score: 85 }),
      rankedModel({ ollamaName: 'old:8b', hfRepoId: 'Qwen/Qwen3-8B-GGUF', sizeB: 8, score: 62 }),
    ];
    const emitted: string[] = [];

    const deps: RefreshTickDeps = {
      detectHardware: async () => HARDWARE,
      recommend: async () => recommendResult(ranked),
      poolManager: pool,
      dedupSource: async () => ({ pending: [], rejected: [] }),
      emitProposal: async (c) => {
        order.push('emit');
        emitted.push(c.target.ollamaName);
      },
      proposalThreshold: 5,
    };

    const result = await runRefreshTick(deps);

    // (a) reconcile ran before any diff proposal emit
    expect(order[0]).toBe('reconcile');
    expect(order.indexOf('reconcile')).toBeLessThan(order.indexOf('emit'));
    // (b) one proposal per diff — new:32b swaps in for old:8b
    expect(emitted).toEqual(['new:32b']);
    expect(result.proposalsEmitted).toBe(1);
    // (c) updateScores rewrote the pooled entry's score from the re-rank
    expect(pool.snapshot().entries.find((e) => e.ollamaName === 'old:8b')?.currentScore).toBe(62);
    // (d) metrics
    expect(result.candidatesEvaluated).toBe(2);
    expect(result.reconciledRemoved).toEqual([]);
    expect(result.errors).toEqual([]);
  });

  it('collects per-stage errors without aborting the tick (emit failure is isolated)', async () => {
    const pool = await seededPool(baseState(), [{ ollamaName: 'old:8b', sizeOnDiskGb: 20 }]);
    const ranked = [
      rankedModel({ ollamaName: 'new:32b', hfRepoId: 'Qwen/Qwen3-32B-GGUF', sizeB: 32, score: 85 }),
    ];
    const deps: RefreshTickDeps = {
      detectHardware: async () => HARDWARE,
      recommend: async () => recommendResult(ranked),
      poolManager: pool,
      dedupSource: async () => ({ pending: [], rejected: [] }),
      emitProposal: async () => {
        throw new Error('persist boom');
      },
      proposalThreshold: 5,
    };

    const result = await runRefreshTick(deps);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some((e) => /persist boom/.test(e))).toBe(true);
  });
});
