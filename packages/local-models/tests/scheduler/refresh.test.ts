import { describe, it, expect } from 'vitest';
import {
  runRefreshTick,
  RefreshScheduler,
  MIN_INTERVAL_MS,
  isTickHardFailure,
  type RefreshTickDeps,
  type TickResult,
} from '../../src/scheduler/refresh.js';
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

describe('runRefreshTick (reconcile → rescore → diff → emit)', () => {
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

  it('re-scores the pool BEFORE diffing → no phantom swap against a freshly-installed member scoring 0', async () => {
    // Regression: a just-installed/swapped-in member enters the pool at
    // currentScore 0 until its first re-rank. If the diff runs before the
    // score write-back, it sees 0, so ANY candidate over threshold "beats" it →
    // a phantom swap proposal justified as "replace a pool member scoring 0".
    // Writing scores back first makes the diff use the member's real score.
    const fresh: PoolState = {
      ...baseState(),
      entries: [
        {
          ollamaName: 'fresh:32b',
          hfRepoId: 'Qwen/Qwen3-32B-GGUF',
          sizeOnDiskGb: 20,
          installedAt: '2026-07-08T00:00:00.000Z',
          lastUsedAt: null,
          currentScore: 0, // never re-ranked yet
        },
      ],
    };
    const pool = await seededPool(fresh, [{ ollamaName: 'fresh:32b', sizeOnDiskGb: 20 }]);
    // This tick's ranking scores fresh:32b at 80. A rival scores 83 — enough to
    // "beat" a stale 0 by the threshold (5), but only +3 over the real 80, so NO
    // swap should be proposed once the real score is used.
    const ranked = [
      rankedModel({
        ollamaName: 'fresh:32b',
        hfRepoId: 'Qwen/Qwen3-32B-GGUF',
        sizeB: 32,
        score: 80,
      }),
      rankedModel({
        ollamaName: 'rival:32b',
        hfRepoId: 'Org/Rival-32B-GGUF',
        sizeB: 32,
        score: 83,
      }),
    ];
    const emitted: string[] = [];
    const deps: RefreshTickDeps = {
      detectHardware: async () => HARDWARE,
      recommend: async () => recommendResult(ranked),
      poolManager: pool,
      dedupSource: async () => ({ pending: [], rejected: [] }),
      emitProposal: async (c) => {
        emitted.push(c.target.ollamaName);
      },
      proposalThreshold: 5,
    };

    const result = await runRefreshTick(deps);

    // No phantom swap: rival (83) does not beat the member's REAL score (80) by 5.
    expect(emitted).toEqual([]);
    expect(result.proposalsEmitted).toBe(0);
    // The member's score was written back from the re-rank before the diff.
    expect(pool.snapshot().entries.find((e) => e.ollamaName === 'fresh:32b')?.currentScore).toBe(
      80
    );
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

  it('threads snapshotLoaded/hfReachable/warnings from RecommendResult (O4 signal)', async () => {
    const pool = await seededPool(baseState(), [{ ollamaName: 'old:8b', sizeOnDiskGb: 20 }]);
    const deps: RefreshTickDeps = {
      detectHardware: async () => HARDWARE,
      // HF unreachable but the frozen snapshot loaded → soft warning, NOT hard failure.
      recommend: async () => ({
        ranked: [],
        snapshotLoaded: true,
        hfReachable: false,
        warnings: ['HuggingFace popularity probe failed'],
      }),
      poolManager: pool,
      dedupSource: async () => ({ pending: [], rejected: [] }),
      emitProposal: async () => {},
      proposalThreshold: 5,
    };

    const result = await runRefreshTick(deps);
    expect(result.snapshotLoaded).toBe(true);
    expect(result.hfReachable).toBe(false);
    expect(result.warnings).toContain('HuggingFace popularity probe failed');
    // HF down + snapshot up → NOT a hard failure (exit 0 with warnings).
    expect(isTickHardFailure(result)).toBe(false);
  });

  it('reports a hard failure when HF is unreachable AND no snapshot loaded (O4)', async () => {
    const pool = await seededPool(baseState(), [{ ollamaName: 'old:8b', sizeOnDiskGb: 20 }]);
    const deps: RefreshTickDeps = {
      detectHardware: async () => HARDWARE,
      // Snapshot load failed and HF unreachable → hard failure (exit non-zero / 503).
      recommend: async () => ({
        ranked: [],
        snapshotLoaded: false,
        hfReachable: false,
        warnings: ['benchmark snapshot load failed'],
      }),
      poolManager: pool,
      dedupSource: async () => ({ pending: [], rejected: [] }),
      emitProposal: async () => {},
      proposalThreshold: 5,
    };

    const result = await runRefreshTick(deps);
    expect(result.snapshotLoaded).toBe(false);
    expect(result.hfReachable).toBe(false);
    expect(isTickHardFailure(result)).toBe(true);
  });
});

function makeLogger(): {
  logger: { info: (m: string, c?: Record<string, unknown>) => void; warn: () => void };
  infos: Array<[string, Record<string, unknown> | undefined]>;
} {
  const infos: Array<[string, Record<string, unknown> | undefined]> = [];
  return {
    infos,
    logger: {
      info: (m, c) => infos.push([m, c]),
      warn: () => {},
    },
  };
}

function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void } {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function emptyTick(): TickResult {
  return {
    candidatesEvaluated: 0,
    proposalsEmitted: 0,
    reconciledRemoved: [],
    snapshotLoaded: true,
    hfReachable: true,
    warnings: [],
    errors: [],
  };
}

const noopTimer = { setTimer: () => ({ unref() {} }), clearTimer: () => {} };

describe('RefreshScheduler (timer, jitter, overlap guard, O1 logging)', () => {
  it('overlap guard: a second fire while a tick is in flight shares the in-flight promise', async () => {
    const d = deferred<TickResult>();
    let runs = 0;
    const scheduler = new RefreshScheduler({
      runTick: () => {
        runs++;
        return d.promise;
      },
      intervalMs: MIN_INTERVAL_MS,
      jitterMs: 0,
      logger: makeLogger().logger,
      ...noopTimer,
      now: () => 0,
      random: () => 0.5,
    });

    const p1 = scheduler.forceRefresh();
    const p2 = scheduler.forceRefresh();
    expect(runs).toBe(1); // second fire suppressed (probeInFlight parity)

    const tr: TickResult = {
      candidatesEvaluated: 3,
      proposalsEmitted: 1,
      reconciledRemoved: [],
      snapshotLoaded: true,
      hfReachable: true,
      warnings: [],
      errors: [],
    };
    d.resolve(tr);
    expect(await p1).toBe(tr);
    expect(await p2).toBe(tr);
  });

  it('logs one structured O1 line per completed tick', async () => {
    const { logger, infos } = makeLogger();
    let t = 0;
    const scheduler = new RefreshScheduler({
      runTick: async () => ({
        candidatesEvaluated: 5,
        proposalsEmitted: 2,
        reconciledRemoved: ['x'],
        snapshotLoaded: true,
        hfReachable: true,
        warnings: [],
        errors: [],
      }),
      intervalMs: MIN_INTERVAL_MS,
      jitterMs: 0,
      logger,
      ...noopTimer,
      now: () => {
        t += 10;
        return t;
      },
      random: () => 0.5,
    });

    await scheduler.forceRefresh();

    expect(infos).toHaveLength(1);
    const ctx = infos[0]![1]!;
    for (const k of [
      'tick',
      'started',
      'completed',
      'durationMs',
      'candidatesEvaluated',
      'proposalsEmitted',
      'errors',
    ]) {
      expect(ctx).toHaveProperty(k);
    }
    expect(ctx.candidatesEvaluated).toBe(5);
    expect(ctx.proposalsEmitted).toBe(2);
    expect(ctx.durationMs).toBe(10);
  });

  it('clamps the interval to the 1h floor and applies bounded jitter', () => {
    const delays: number[] = [];
    const mk = (random: number): RefreshScheduler =>
      new RefreshScheduler({
        runTick: async () => emptyTick(),
        intervalMs: 1000, // below the 1h floor
        jitterMs: 600_000,
        logger: makeLogger().logger,
        setTimer: (_cb, delay) => {
          delays.push(delay);
          return { unref() {} };
        },
        clearTimer: () => {},
        now: () => 0,
        random: () => random,
      });

    mk(1).start(); // jitter = +jitterMs
    mk(0).start(); // jitter = -jitterMs
    mk(0.5).start(); // jitter = 0

    expect(delays[0]).toBe(MIN_INTERVAL_MS + 600_000);
    expect(delays[1]).toBe(MIN_INTERVAL_MS - 600_000);
    expect(delays[2]).toBe(MIN_INTERVAL_MS);
  });

  it('forceRefresh resolves with the TickResult', async () => {
    const tr = emptyTick();
    const scheduler = new RefreshScheduler({
      runTick: async () => tr,
      intervalMs: MIN_INTERVAL_MS,
      jitterMs: 0,
      logger: makeLogger().logger,
      ...noopTimer,
      now: () => 0,
      random: () => 0.5,
    });
    expect(await scheduler.forceRefresh()).toEqual(tr);
  });

  it('start() is idempotent and stop() clears the timer', () => {
    let scheduled = 0;
    let cleared = 0;
    const scheduler = new RefreshScheduler({
      runTick: async () => emptyTick(),
      intervalMs: MIN_INTERVAL_MS,
      jitterMs: 0,
      logger: makeLogger().logger,
      setTimer: () => {
        scheduled++;
        return { unref() {} };
      },
      clearTimer: () => {
        cleared++;
      },
      now: () => 0,
      random: () => 0.5,
    });
    scheduler.start();
    scheduler.start(); // idempotent — no second schedule
    expect(scheduled).toBe(1);
    scheduler.stop();
    expect(cleared).toBe(1);
  });
});
