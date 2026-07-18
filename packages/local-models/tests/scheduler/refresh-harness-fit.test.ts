import { describe, it, expect } from 'vitest';
import {
  runRefreshTick,
  type RefreshTickDeps,
  type HarnessFitProbeDeps,
} from '../../src/scheduler/refresh.js';
import { PoolManager } from '../../src/pool/manager.js';
import { PoolStateStore, type PoolFilesystem } from '../../src/pool/state.js';
import type { PoolState } from '../../src/pool/types.js';
import type { RankedModel } from '../../src/ranker/types.js';
import type { HardwareProfile } from '../../src/hardware/types.js';
import type { RemoteModelInfo } from '../../src/installer/index.js';
import type { RecommendResult } from '../../src/recommender/native.js';
import {
  probeCacheKey,
  type HarnessFitCacheEntry,
  type HarnessFitCacheStore,
} from '../../src/capability/probe-policy.js';
import type { HarnessFitResult, HarnessFitProbeTask } from '../../src/capability/harness-fit.js';

/**
 * Phase 3 / Task 1 — the SCHEDULER wiring of the harness-fit probe pass (D5/SC4).
 * Every test runs against an injected FAKE runner + fake cache/clock — NO real
 * Ollama, NO real disk. Proves:
 *   - cadence not-due ⇒ no probe;
 *   - probe-enabled + due ⇒ top-N probed, results cached, buildQuality re-ranked;
 *   - a fresh-cached candidate is skipped;
 *   - a runner that THROWS ⇒ refresh still completes, buildQuality undefined, no
 *     ranking effect (fail-open, D6);
 *   - probe absent ⇒ tick behaves exactly as before (no re-rank).
 */

const NOW = 1_700_000_000_000;

const HARDWARE: HardwareProfile = {
  platform: 'macos',
  vramGb: 48,
  ramGb: 64,
  bandwidthGbps: 400,
  cpuName: 'Apple M4 Max',
  detectedAt: '2026-07-07T00:00:00.000Z',
};

const TASK: HarnessFitProbeTask = {
  id: 'pure-fn',
  prompt: 'implement add',
  files: { 'add.js': '// TODO' },
  acceptanceCommand: 'node --test add.test.js',
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

async function emptyPool(): Promise<PoolManager> {
  const path = '/tmp/lmlm-hf/pool.json';
  const fs = memFs();
  const state: PoolState = {
    diskBudgetGb: 200,
    diskUsedGb: 0,
    entries: [],
    allowedOrgs: ['Org'],
    allowedFamilies: [],
    lastRefreshAt: null,
  };
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
    async list(): Promise<RemoteModelInfo[]> {
      return [];
    },
    async inspect({ name }: { name: string }) {
      return { ollamaName: name, sizeOnDiskGb: 10 };
    },
  };
  return new PoolManager({ store, installer: installer as never });
}

function memCache(seed: Record<string, HarnessFitCacheEntry> = {}): HarnessFitCacheStore {
  const map = new Map<string, HarnessFitCacheEntry>(Object.entries(seed));
  return {
    get: (key) => map.get(key),
    set: (key, entry) => {
      map.set(key, entry);
    },
  };
}

/** A convergence-result: converged ⇒ HIGH buildQuality. */
const CONVERGED: HarnessFitResult = { converged: true, toolCalls: 4, filesTouched: 1, retries: 0 };
/** A narrate-result: no artifact, ≤1 call ⇒ LOW buildQuality. */
const NARRATED: HarnessFitResult = { converged: false, toolCalls: 1, filesTouched: 0, retries: 0 };

function recommendResult(ranked: RankedModel[]): RecommendResult {
  return { ranked, snapshotLoaded: true, hfReachable: true, warnings: [] };
}

/** Base deps (no harness-fit) — a bare tick over the given ranking. */
function baseDeps(pool: PoolManager, ranked: RankedModel[]): RefreshTickDeps {
  return {
    detectHardware: async () => HARDWARE,
    recommend: async () => recommendResult(ranked),
    poolManager: pool,
    dedupSource: async () => ({ pending: [], rejected: [] }),
    emitProposal: async () => {},
    proposalThreshold: 5,
  };
}

describe('runRefreshTick — harness-fit probe pass', () => {
  it('does NOT probe when the probe is absent (byte-identical prior behaviour)', async () => {
    const pool = await emptyPool();
    const ranked = [rankedModel({ ollamaName: 'a:1', hfRepoId: 'Org/A', score: 80 })];
    const result = await runRefreshTick(baseDeps(pool, ranked));
    expect(result.errors).toEqual([]);
    expect(result.candidatesEvaluated).toBe(1);
  });

  it('does NOT probe when the cadence is not due', async () => {
    const pool = await emptyPool();
    const ranked = [rankedModel({ ollamaName: 'a:1', hfRepoId: 'Org/A', score: 80 })];
    const probed: string[] = [];
    const hf: HarnessFitProbeDeps = {
      enabled: true,
      topN: 3,
      intervalMs: 86_400_000,
      cacheTtlMs: 604_800_000,
      runner: {
        async runProbe(model) {
          probed.push(model);
          return CONVERGED;
        },
      },
      cache: memCache(),
      // Last probe was 1ms ago → NOT due.
      getLastProbeAt: async () => NOW - 1,
      setLastProbeAt: async () => {},
      reRankWithBuildQuality: async () => recommendResult(ranked),
      now: () => NOW,
    };
    const result = await runRefreshTick({ ...baseDeps(pool, ranked), harnessFit: hf });
    expect(probed).toEqual([]); // never dispatched
    expect(result.errors).toEqual([]);
  });

  it('probes the top-N when enabled + due, caches results, and re-ranks with buildQuality', async () => {
    const pool = await emptyPool();
    // Two candidates at EQUAL benchmark score; one narrates, one converges.
    const ranked = [
      rankedModel({ ollamaName: 'narrator:1', hfRepoId: 'Org/Narrator', score: 80 }),
      rankedModel({ ollamaName: 'builder:1', hfRepoId: 'Org/Builder', score: 80 }),
    ];
    const probed: string[] = [];
    const cache = memCache();
    let reRankArg: ReadonlyMap<string, number> | undefined;
    let savedLastProbeAt: number | undefined;

    const hf: HarnessFitProbeDeps = {
      enabled: true,
      topN: 3,
      intervalMs: 86_400_000,
      cacheTtlMs: 604_800_000,
      runner: {
        async runProbe(model) {
          probed.push(model);
          return model === 'builder:1' ? CONVERGED : NARRATED;
        },
      },
      cache,
      getLastProbeAt: async () => undefined, // never run ⇒ due
      setLastProbeAt: async (at) => {
        savedLastProbeAt = at;
      },
      reRankWithBuildQuality: async (_hw, byKey) => {
        reRankArg = byKey;
        // Simulate the ranker folding buildQuality in: builder now sorts first.
        return recommendResult([ranked[1] as RankedModel, ranked[0] as RankedModel]);
      },
      tasks: [TASK],
      now: () => NOW,
    };

    const result = await runRefreshTick({ ...baseDeps(pool, ranked), harnessFit: hf });

    // Both top-N candidates probed.
    expect(probed.sort()).toEqual(['builder:1', 'narrator:1']);
    // Cadence stamped.
    expect(savedLastProbeAt).toBe(NOW);
    // Both buildQualities cached by model+version.
    const builderKey = probeCacheKey({
      hfRepoId: 'Org/Builder',
      ollamaName: 'builder:1',
      quant: 'Q4_K_M',
    });
    const narratorKey = probeCacheKey({
      hfRepoId: 'Org/Narrator',
      ollamaName: 'narrator:1',
      quant: 'Q4_K_M',
    });
    expect(cache.get(builderKey)?.buildQuality).toBeGreaterThan(0.8); // HIGH
    expect(cache.get(narratorKey)?.buildQuality).toBeLessThan(0.2); // LOW
    // The re-rank got both scored keys threaded in.
    expect(reRankArg?.get(builderKey)).toBeGreaterThan(0.8);
    expect(reRankArg?.get(narratorKey)).toBeLessThan(0.2);
    expect(result.errors).toEqual([]);
    // The tick ran on the RE-RANKED shortlist (builder first now).
    expect(result.candidatesEvaluated).toBe(2);
  });

  it('skips a candidate whose buildQuality is cached FRESH', async () => {
    const pool = await emptyPool();
    const ranked = [
      rankedModel({ ollamaName: 'cached:1', hfRepoId: 'Org/Cached', score: 80 }),
      rankedModel({ ollamaName: 'fresh:1', hfRepoId: 'Org/Fresh', score: 79 }),
    ];
    const cachedKey = probeCacheKey({
      hfRepoId: 'Org/Cached',
      ollamaName: 'cached:1',
      quant: 'Q4_K_M',
    });
    const cache = memCache({ [cachedKey]: { buildQuality: 0.95, probedAt: NOW - 1000 } });
    const probed: string[] = [];
    const hf: HarnessFitProbeDeps = {
      enabled: true,
      topN: 3,
      intervalMs: 86_400_000,
      cacheTtlMs: 604_800_000,
      runner: {
        async runProbe(model) {
          probed.push(model);
          return CONVERGED;
        },
      },
      cache,
      getLastProbeAt: async () => undefined,
      setLastProbeAt: async () => {},
      reRankWithBuildQuality: async () => recommendResult(ranked),
      tasks: [TASK],
      now: () => NOW,
    };
    await runRefreshTick({ ...baseDeps(pool, ranked), harnessFit: hf });
    // Only the un-cached candidate is probed.
    expect(probed).toEqual(['fresh:1']);
  });

  it('is FAIL-OPEN: a throwing runner leaves buildQuality undefined and the refresh completes', async () => {
    const pool = await emptyPool();
    const ranked = [rankedModel({ ollamaName: 'boom:1', hfRepoId: 'Org/Boom', score: 80 })];
    const cache = memCache();
    let reRankCalled = false;
    const hf: HarnessFitProbeDeps = {
      enabled: true,
      topN: 3,
      intervalMs: 86_400_000,
      cacheTtlMs: 604_800_000,
      runner: {
        async runProbe() {
          throw new Error('ollama unreachable');
        },
      },
      cache,
      getLastProbeAt: async () => undefined,
      setLastProbeAt: async () => {},
      reRankWithBuildQuality: async () => {
        reRankCalled = true;
        return recommendResult(ranked);
      },
      tasks: [TASK],
      now: () => NOW,
    };
    const result = await runRefreshTick({ ...baseDeps(pool, ranked), harnessFit: hf });
    // Refresh completed cleanly.
    expect(result.errors).toEqual([]);
    expect(result.candidatesEvaluated).toBe(1);
    // buildQuality cached as undefined (fail-open, no effect).
    const key = probeCacheKey({ hfRepoId: 'Org/Boom', ollamaName: 'boom:1', quant: 'Q4_K_M' });
    expect(cache.get(key)?.buildQuality).toBeUndefined();
    // Nothing scored ⇒ no re-rank (pre-probe ranking stands).
    expect(reRankCalled).toBe(false);
  });

  it('never probes the full discovered set — only the top-N', async () => {
    const pool = await emptyPool();
    const ranked = Array.from({ length: 20 }, (_, i) =>
      rankedModel({ ollamaName: `m${i}:1`, hfRepoId: `Org/M${i}`, score: 90 - i })
    );
    const probed: string[] = [];
    const hf: HarnessFitProbeDeps = {
      enabled: true,
      topN: 3,
      intervalMs: 86_400_000,
      cacheTtlMs: 604_800_000,
      runner: {
        async runProbe(model) {
          probed.push(model);
          return CONVERGED;
        },
      },
      cache: memCache(),
      getLastProbeAt: async () => undefined,
      setLastProbeAt: async () => {},
      reRankWithBuildQuality: async () => recommendResult(ranked),
      tasks: [TASK],
      now: () => NOW,
    };
    await runRefreshTick({ ...baseDeps(pool, ranked), harnessFit: hf });
    expect(probed).toEqual(['m0:1', 'm1:1', 'm2:1']); // top-3 only
    expect(probed.length).toBeLessThan(ranked.length);
  });
});
