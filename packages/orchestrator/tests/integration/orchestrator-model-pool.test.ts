import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { execSync } from 'node:child_process';
import { Orchestrator } from '../../src/orchestrator';
import { MockBackend } from '../../src/agent/backends/mock';
import {
  PoolManager,
  PoolStateStore,
  RefreshScheduler,
  type EvictRequest,
  type InstallAdapter,
  type InstallRequest,
  type InstallResult,
  type PoolEntry,
  type PoolFilesystem,
  type PoolState,
  type RemoteModelInfo,
} from '@harness-engineering/local-models';
import type {
  WorkflowConfig,
  IssueTrackerClient,
  LocalModelsConfig,
} from '@harness-engineering/types';
import { Ok } from '@harness-engineering/types';
import { noopExecFile } from '../helpers/noop-exec-file';

let tmpDir: string;

function makeMockTracker(): IssueTrackerClient {
  return {
    fetchCandidateIssues: vi.fn().mockResolvedValue(Ok([])),
    fetchIssuesByStates: vi.fn().mockResolvedValue(Ok([])),
    fetchIssueStatesByIds: vi.fn().mockResolvedValue(Ok(new Map())),
    markIssueComplete: vi.fn().mockResolvedValue(Ok(undefined)),
    claimIssue: vi.fn().mockResolvedValue(Ok(undefined)),
    releaseIssue: vi.fn().mockResolvedValue(Ok(undefined)),
  } as unknown as IssueTrackerClient;
}

function localModelsConfig(): LocalModelsConfig {
  return {
    enabled: true,
    pool: { diskBudgetGb: 100, allowedOrgs: ['Qwen'], allowedFamilies: [] },
    refresh: { intervalMs: 86_400_000, proposalThreshold: 5, jitterMs: 600_000 },
    installer: { backend: 'ollama', ollamaEndpoint: 'http://localhost:11434' },
  };
}

function makeConfig(localModels?: LocalModelsConfig): WorkflowConfig {
  const config = {
    tracker: { kind: 'mock', activeStates: ['planned'], terminalStates: ['done'] },
    polling: { intervalMs: 1000 },
    workspace: { root: path.join(tmpDir, '.harness', 'workspaces') },
    hooks: {
      afterCreate: null,
      beforeRun: null,
      afterRun: null,
      beforeRemove: null,
      timeoutMs: 1000,
    },
    agent: {
      backend: 'mock',
      maxConcurrentAgents: 2,
      maxTurns: 3,
      maxRetryBackoffMs: 1000,
      maxRetries: 5,
      maxConcurrentAgentsByState: { planned: 1 },
      turnTimeoutMs: 5000,
      readTimeoutMs: 5000,
      stallTimeoutMs: 5000,
    },
    server: { port: null },
  } as unknown as WorkflowConfig & { localModels?: LocalModelsConfig };
  if (localModels) config.localModels = localModels;
  return config;
}

function makeOrchestrator(config: WorkflowConfig): Orchestrator {
  return new Orchestrator(config, 'Prompt', {
    tracker: makeMockTracker(),
    backend: new MockBackend(),
    execFileFn: noopExecFile,
  });
}

/** Test-only: TypeScript private fields are structurally accessible at runtime. */
function modelPoolOf(orch: Orchestrator): PoolManager | null {
  return (orch as unknown as { modelPool: PoolManager | null }).modelPool;
}

function schedulerOf(orch: Orchestrator): RefreshScheduler | null {
  return (orch as unknown as { refreshScheduler: RefreshScheduler | null }).refreshScheduler;
}

/** Trigger the private lifecycle init that constructs + starts the scheduler. */
function initPipeline(orch: Orchestrator): Promise<void> {
  return (
    orch as unknown as { initLocalModelAndPipeline(): Promise<void> }
  ).initLocalModelAndPipeline();
}

/** No-op timer seam: start() schedules nothing real; forceRefresh drives ticks directly. */
const noopTimer = {
  setTimer: (): { unref(): void } => ({ unref() {} }),
  clearTimer: (): void => {},
};

function localModelsWithHardware(): LocalModelsConfig {
  return {
    ...localModelsConfig(),
    hardware: { override: { platform: 'macos', vramGb: 48, bandwidthGbps: 400 } },
  };
}

// ── Drain-path helpers (Phase 7: P7-SUG-DRAIN-REENTRANCY / -LIVENESS) ──────────
//
// A real `Orchestrator` owns the `draining` guard, `isLocalModelInUse` probe, and
// the `local-models:pool` emit; we drive its PRIVATE `drainDeferredEvictions` /
// `emitWorkerExit` (structurally accessible) against a seeded in-memory pool so
// the guard + tick-piggyback wiring is exercised without a live Ollama.

const DRAIN_POOL_PATH = '/tmp/lmlm-drain-test/pool.json';

const REPLACES: PoolEntry = {
  ollamaName: 'qwen2.5:32b',
  hfRepoId: 'Qwen/Qwen2.5-32B-GGUF',
  sizeOnDiskGb: 20,
  installedAt: '2026-01-01T00:00:00.000Z',
  lastUsedAt: null,
  currentScore: 71,
};

function makeFs(initial: Record<string, string> = {}): PoolFilesystem {
  const files: Record<string, string> = { ...initial };
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

/**
 * Stub installer: `list()` echoes the seeded entries so drift-reconcile keeps
 * them; `evict()` succeeds and records calls, unless `failEvict.value` is set (to
 * simulate a transient installer error that leaves the eviction pending).
 */
function stubInstaller(entries: PoolEntry[]): {
  adapter: InstallAdapter;
  evicts: EvictRequest[];
  failEvict: { value: boolean };
} {
  const evicts: EvictRequest[] = [];
  const failEvict = { value: false };
  const remote: RemoteModelInfo[] = entries.map((e) => ({
    ollamaName: e.ollamaName,
    sizeOnDiskGb: e.sizeOnDiskGb,
  }));
  return {
    evicts,
    failEvict,
    adapter: {
      async install(req: InstallRequest): Promise<InstallResult> {
        return { status: 'success', name: req.name };
      },
      async evict(req: EvictRequest): Promise<InstallResult> {
        if (failEvict.value) {
          return { status: 'error', code: 'installer_unavailable', message: 'transient' };
        }
        evicts.push(req);
        return { status: 'success', name: req.name };
      },
      async list(): Promise<RemoteModelInfo[]> {
        return remote;
      },
      async inspect(): Promise<RemoteModelInfo> {
        throw new Error('inspect not configured');
      },
    },
  };
}

function seededState(entries: PoolEntry[]): PoolState {
  return {
    diskBudgetGb: 100,
    diskUsedGb: entries.reduce((s, e) => s + e.sizeOnDiskGb, 0),
    entries,
    allowedOrgs: ['Qwen'],
    allowedFamilies: [],
    lastRefreshAt: null,
  };
}

async function makeSeededPool(entries: PoolEntry[]): Promise<{
  manager: PoolManager;
  evicts: EvictRequest[];
  failEvict: { value: boolean };
}> {
  const fs = makeFs({
    [DRAIN_POOL_PATH]: JSON.stringify({ version: 1, state: seededState(entries) }, null, 2),
  });
  const store = new PoolStateStore({ path: DRAIN_POOL_PATH, fs });
  await store.load();
  const installer = stubInstaller(entries);
  const manager = new PoolManager({ store, installer: installer.adapter });
  return { manager, evicts: installer.evicts, failEvict: installer.failEvict };
}

/** Structural access to the private `modelPool` setter (test seam). */
function setModelPool(orch: Orchestrator, pool: PoolManager): void {
  (orch as unknown as { modelPool: PoolManager | null }).modelPool = pool;
}

/** Structural access to the private `drainDeferredEvictions`, bound to `orch`. */
function drainOf(orch: Orchestrator): () => Promise<void> {
  return (
    orch as unknown as { drainDeferredEvictions(): Promise<void> }
  ).drainDeferredEvictions.bind(orch);
}

/** Structural access to the private `emitWorkerExit`, bound to `orch`. */
function emitWorkerExitOf(
  orch: Orchestrator
): (issueId: string, reason: 'normal' | 'error', attempt: number | null) => Promise<void> {
  return (
    orch as unknown as {
      emitWorkerExit(id: string, reason: 'normal' | 'error', attempt: number | null): Promise<void>;
    }
  ).emitWorkerExit.bind(orch);
}

/** Let a fire-and-forget drain settle (drainDeferredEvictions is `void`-called). */
function flush(): Promise<void> {
  return new Promise((r) => setTimeout(r, 10));
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-orch-pool-'));
  execSync(
    'git init && git config user.email "test@test" && git config user.name "test" && git commit --allow-empty -m "init"',
    { cwd: tmpDir, stdio: 'ignore' }
  );
  fs.mkdirSync(path.join(tmpDir, '.harness', 'workspaces'), { recursive: true });
});

afterEach(() => {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    /* best-effort cleanup */
  }
});

describe('Orchestrator LMLM Phase 6 — live PoolManager (Task 14)', () => {
  it('constructs a PoolManager reachable via modelPool when localModels.enabled', () => {
    const orch = makeOrchestrator(makeConfig(localModelsConfig()));
    const pool = modelPoolOf(orch);
    expect(pool).not.toBeNull();
    expect(pool).toBeInstanceOf(PoolManager);
  });

  it('leaves modelPool null when localModels is absent (LMLM disabled, N4/N9)', () => {
    const orch = makeOrchestrator(makeConfig());
    expect(modelPoolOf(orch)).toBeNull();
  });

  it('leaves modelPool null when localModels.enabled is false', () => {
    const orch = makeOrchestrator(makeConfig({ ...localModelsConfig(), enabled: false }));
    expect(modelPoolOf(orch)).toBeNull();
  });
});

describe('Orchestrator LMLM Phase 6 — RefreshScheduler lifecycle (Task 15)', () => {
  it('arms a scheduler on lifecycle init; forceRefresh runs a tick calling pool.reconcile', async () => {
    const orch = new Orchestrator(makeConfig(localModelsWithHardware()), 'Prompt', {
      tracker: makeMockTracker(),
      backend: new MockBackend(),
      execFileFn: noopExecFile,
      schedulerTimer: noopTimer,
    });

    await initPipeline(orch);

    const scheduler = schedulerOf(orch);
    expect(scheduler).not.toBeNull();
    expect(scheduler).toBeInstanceOf(RefreshScheduler);

    // Drive one tick out of band; assert it reconciles the live pool (D12/F10).
    const pool = modelPoolOf(orch)!;
    const reconcileSpy = vi.spyOn(pool, 'reconcile').mockResolvedValue({ removed: [] });
    const result = await scheduler!.forceRefresh();

    expect(reconcileSpy).toHaveBeenCalledTimes(1);
    expect(result.errors).toEqual([]);

    await orch.stop();
  });

  it('stop() disarms the scheduler (no further ticks)', async () => {
    const orch = new Orchestrator(makeConfig(localModelsWithHardware()), 'Prompt', {
      tracker: makeMockTracker(),
      backend: new MockBackend(),
      execFileFn: noopExecFile,
      schedulerTimer: noopTimer,
    });

    await initPipeline(orch);
    expect(schedulerOf(orch)).not.toBeNull();

    await orch.stop();
    expect(schedulerOf(orch)).toBeNull();
  });

  it('does not arm a scheduler when LMLM is disabled', async () => {
    const orch = makeOrchestrator(makeConfig());
    await initPipeline(orch);
    expect(schedulerOf(orch)).toBeNull();
    await orch.stop();
  });
});

describe('Orchestrator LMLM Phase 7 — drain re-entrancy guard (P7-SUG-DRAIN-REENTRANCY)', () => {
  it('coalesces two concurrent drains: installer.evict ONCE, one evict_completed frame', async () => {
    const orch = makeOrchestrator(makeConfig(localModelsConfig()));
    const { manager, evicts } = await makeSeededPool([REPLACES]);
    setModelPool(orch, manager);
    // The model is idle (no agent runs) but flagged for a deferred eviction.
    manager.markPendingEviction('qwen2.5:32b');

    const frames: Array<{ phase?: string; evicted?: string[] }> = [];
    orch.on('local-models:pool', (d) => frames.push(d as { phase?: string; evicted?: string[] }));

    // Two overlapping drains (as two run completions would fire) race the guard.
    const drain = drainOf(orch);
    await Promise.all([drain(), drain()]);

    // Guard held: the installer evicted the model exactly once and exactly one
    // evict_completed frame was broadcast (no duplicate WS frame / redundant delete).
    expect(evicts.map((e) => e.name)).toEqual(['qwen2.5:32b']);
    expect(frames.filter((f) => f.phase === 'evict_completed')).toHaveLength(1);
    expect(manager.listPendingEvictions()).toHaveLength(0);

    await orch.stop();
  });

  it('the guard resets: a later drain still processes a newly-pending eviction', async () => {
    const orch = makeOrchestrator(makeConfig(localModelsConfig()));
    const { manager, evicts } = await makeSeededPool([REPLACES]);
    setModelPool(orch, manager);

    // First drain with nothing pending is a clean no-op (guard sets + clears).
    await drainOf(orch)();
    expect(evicts).toHaveLength(0);

    // A subsequent defer is still drained — `finally` reset the guard.
    manager.markPendingEviction('qwen2.5:32b');
    await drainOf(orch)();
    expect(evicts.map((e) => e.name)).toEqual(['qwen2.5:32b']);
    expect(manager.listPendingEvictions()).toHaveLength(0);

    await orch.stop();
  });

  it('completes a deferred eviction via the REAL run-completion path (emitWorkerExit → drain, not a mirror)', async () => {
    // S1 e2e mirror-gap closure: drive the production trigger — a worker exit
    // fires the fire-and-forget drainDeferredEvictions from inside the real
    // Orchestrator.emitWorkerExit — instead of a hand-rolled mirror function.
    const orch = makeOrchestrator(makeConfig(localModelsConfig()));
    const { manager, evicts } = await makeSeededPool([REPLACES]);
    setModelPool(orch, manager);
    manager.markPendingEviction('qwen2.5:32b');

    const frames: Array<{ phase?: string; evicted?: string[] }> = [];
    orch.on('local-models:pool', (d) => frames.push(d as { phase?: string; evicted?: string[] }));

    await emitWorkerExitOf(orch)('issue-unknown', 'normal', null);
    await flush();

    expect(evicts.map((e) => e.name)).toEqual(['qwen2.5:32b']);
    expect(frames.filter((f) => f.phase === 'evict_completed')).toHaveLength(1);
    expect(manager.listPendingEvictions()).toHaveLength(0);

    await orch.stop();
  });
});

/** Structural access to the private `applyConfiguredPoolBounds`, bound to `orch`. */
function applyBoundsOf(orch: Orchestrator): () => Promise<void> {
  return (
    orch as unknown as { applyConfiguredPoolBounds(): Promise<void> }
  ).applyConfiguredPoolBounds.bind(orch);
}

/** A PoolManager over an isolated in-memory fs seeded with the given state. */
async function makePoolWithState(state: PoolState): Promise<PoolManager> {
  const poolPath = '/tmp/lmlm-seed-test/pool.json';
  const fs = makeFs({ [poolPath]: JSON.stringify({ version: 1, state }, null, 2) });
  const store = new PoolStateStore({ path: poolPath, fs });
  await store.load();
  const installer = stubInstaller(state.entries);
  return new PoolManager({ store, installer: installer.adapter });
}

/** Structural access to the private `modelRecommender`. */
function recommenderOf(
  orch: Orchestrator
): ((hw: unknown) => Promise<{ ranked: unknown[] }>) | null {
  return (
    orch as unknown as {
      modelRecommender: ((hw: unknown) => Promise<{ ranked: unknown[] }>) | null;
    }
  ).modelRecommender;
}

/** Structural access to the private `detectLmlmHardware`, bound to `orch`. */
function detectHardwareOf(orch: Orchestrator): () => Promise<unknown> {
  return (orch as unknown as { detectLmlmHardware(): Promise<unknown> }).detectLmlmHardware.bind(
    orch
  );
}

describe('Orchestrator LMLM Phase 2 — recommender candidate sourcing (SC5)', () => {
  it('ranks non-empty candidates for the allow-listed org from the frozen snapshot', async () => {
    // localModelsWithHardware() allow-lists org 'Qwen'; the bundled frozen
    // snapshot ships Qwen candidates, so the recommender must return a ranking.
    const orch = new Orchestrator(makeConfig(localModelsWithHardware()), 'Prompt', {
      tracker: makeMockTracker(),
      backend: new MockBackend(),
      execFileFn: noopExecFile,
      schedulerTimer: noopTimer,
    });
    await initPipeline(orch);

    const recommend = recommenderOf(orch);
    expect(recommend).not.toBeNull();

    const hardware = await detectHardwareOf(orch)();
    const result = await recommend!(hardware);
    expect(result.ranked.length).toBeGreaterThan(0);

    await orch.stop();
  });
});

describe('Orchestrator LMLM Phase 7 — pool bounds seed from config (D1/D2)', () => {
  it('overwrites persisted bounds with configured bounds — config wins (SC2)', async () => {
    const orch = makeOrchestrator(
      makeConfig({
        ...localModelsConfig(),
        pool: {
          diskBudgetGb: 100,
          allowedOrgs: ['Qwen', 'deepseek-ai'],
          allowedFamilies: ['qwen3'],
        },
      })
    );
    // Persisted state disagrees with config: smaller budget, no allowlist.
    const manager = await makePoolWithState({
      diskBudgetGb: 5,
      diskUsedGb: 0,
      entries: [],
      allowedOrgs: [],
      allowedFamilies: [],
      lastRefreshAt: null,
    });
    setModelPool(orch, manager);

    await applyBoundsOf(orch)();

    const snap = manager.snapshot();
    expect(snap.diskBudgetGb).toBe(100);
    expect(snap.allowedOrgs).toEqual(['Qwen', 'deepseek-ai']);
    expect(snap.allowedFamilies).toEqual(['qwen3']);

    await orch.stop();
  });

  it('seeds an empty default store so the pool card leaves "0 / 0 GB" (SC1)', async () => {
    const orch = makeOrchestrator(
      makeConfig({
        ...localModelsConfig(),
        pool: { diskBudgetGb: 100, allowedOrgs: ['Qwen'], allowedFamilies: [] },
      })
    );
    // Fresh default store: diskBudgetGb 0, empty allowlist (the shipped default).
    const manager = await makePoolWithState({
      diskBudgetGb: 0,
      diskUsedGb: 0,
      entries: [],
      allowedOrgs: [],
      allowedFamilies: [],
      lastRefreshAt: null,
    });
    setModelPool(orch, manager);

    await applyBoundsOf(orch)();

    expect(manager.snapshot().diskBudgetGb).toBe(100);
    expect(manager.snapshot().allowedOrgs).toEqual(['Qwen']);

    await orch.stop();
  });

  it('is a no-op when LMLM is disabled (modelPool null) — no throw (SC3)', async () => {
    const orch = makeOrchestrator(makeConfig()); // no localModels → disabled
    expect(modelPoolOf(orch)).toBeNull();
    await expect(applyBoundsOf(orch)()).resolves.toBeUndefined();
    await orch.stop();
  });
});

/** Structural access to the private `buildHarnessFitDeps`, bound to `orch`. */
function buildHarnessFitDepsOf(
  orch: Orchestrator
): (endpoint: string | undefined, apiKey: string | undefined) => unknown {
  return (
    orch as unknown as {
      buildHarnessFitDeps(e: string | undefined, k: string | undefined): unknown;
    }
  ).buildHarnessFitDeps.bind(orch);
}

/** A localModels config with the harness-fit probe explicitly enabled + tuned. */
function localModelsWithHarnessFit(
  overrides: Partial<{
    enabled: boolean;
    topN: number;
    cadenceMs: number;
    cacheTtlMs: number;
    taskIds: string[];
  }> = {}
): LocalModelsConfig {
  return {
    ...localModelsWithHardware(),
    harnessFit: {
      enabled: true,
      topN: 3,
      cadenceMs: 604_800_000,
      cacheTtlMs: 2_592_000_000,
      ...overrides,
    },
  };
}

describe('Orchestrator harness-fit probe — composition-root wiring (D5, Task 3)', () => {
  it('builds + passes a harnessFit deps bundle to the tick when enabled', async () => {
    const orch = new Orchestrator(makeConfig(localModelsWithHarnessFit()), 'Prompt', {
      tracker: makeMockTracker(),
      backend: new MockBackend(),
      execFileFn: noopExecFile,
      schedulerTimer: noopTimer,
    });
    await initPipeline(orch);

    const deps = buildHarnessFitDepsOf(orch)('http://127.0.0.1:11434/v1', undefined) as
      | {
          enabled: boolean;
          topN: number;
          intervalMs: number;
          cacheTtlMs: number;
          runner: unknown;
          cache: unknown;
          getLastProbeAt: () => Promise<number | undefined>;
          setLastProbeAt: (at: number) => Promise<void>;
          reRankWithBuildQuality: unknown;
        }
      | undefined;

    expect(deps).toBeDefined();
    expect(deps!.enabled).toBe(true);
    // config→deps field translation: cadenceMs → intervalMs, topN + cacheTtlMs pass-through.
    expect(deps!.intervalMs).toBe(604_800_000);
    expect(deps!.topN).toBe(3);
    expect(deps!.cacheTtlMs).toBe(2_592_000_000);
    // All three injected seams present.
    expect(deps!.runner).toBeTruthy();
    expect(deps!.cache).toBeTruthy();
    expect(typeof deps!.reRankWithBuildQuality).toBe('function');
    // Cadence persistence round-trips through the injected store.
    expect(await deps!.getLastProbeAt()).toBeUndefined();

    await orch.stop();
  });

  it('passes NO harnessFit deps when the probe is disabled (byte-identical prior behaviour)', async () => {
    const orch = new Orchestrator(
      makeConfig(localModelsWithHarnessFit({ enabled: false })),
      'Prompt',
      {
        tracker: makeMockTracker(),
        backend: new MockBackend(),
        execFileFn: noopExecFile,
        schedulerTimer: noopTimer,
      }
    );
    await initPipeline(orch);
    expect(buildHarnessFitDepsOf(orch)('http://127.0.0.1:11434/v1', undefined)).toBeUndefined();
    await orch.stop();
  });

  it('passes NO harnessFit deps when harnessFit is absent from config', async () => {
    const orch = new Orchestrator(makeConfig(localModelsWithHardware()), 'Prompt', {
      tracker: makeMockTracker(),
      backend: new MockBackend(),
      execFileFn: noopExecFile,
      schedulerTimer: noopTimer,
    });
    await initPipeline(orch);
    expect(buildHarnessFitDepsOf(orch)(undefined, undefined)).toBeUndefined();
    await orch.stop();
  });

  it('translates taskIds → the resolved default task suite', async () => {
    const orch = new Orchestrator(
      makeConfig(localModelsWithHarnessFit({ taskIds: ['bugfix'] })),
      'Prompt',
      {
        tracker: makeMockTracker(),
        backend: new MockBackend(),
        execFileFn: noopExecFile,
        schedulerTimer: noopTimer,
      }
    );
    await initPipeline(orch);
    const deps = buildHarnessFitDepsOf(orch)('http://127.0.0.1:11434/v1', undefined) as {
      tasks?: Array<{ id: string }>;
    };
    expect(deps.tasks?.map((t) => t.id)).toEqual(['bugfix']);
    await orch.stop();
  });
});

describe('Orchestrator LMLM Phase 7 — drain liveness on refresh tick (P7-SUG-DRAIN-LIVENESS)', () => {
  it('evicts a model left pendingEviction (failed drain) on the next scheduler tick', async () => {
    const orch = new Orchestrator(makeConfig(localModelsWithHardware()), 'Prompt', {
      tracker: makeMockTracker(),
      backend: new MockBackend(),
      execFileFn: noopExecFile,
      schedulerTimer: noopTimer,
    });
    const { manager, evicts, failEvict } = await makeSeededPool([REPLACES]);
    // Wire the seeded pool in BEFORE init so the scheduler captures it and the
    // tick-piggybacked drain reads the same manager.
    setModelPool(orch, manager);
    await initPipeline(orch);

    // Simulate the final run's drain failing transiently: the model stays pending
    // and NO further agent run will ever complete to re-fire the completion drain.
    manager.markPendingEviction('qwen2.5:32b');
    failEvict.value = true;
    await drainOf(orch)();
    expect(evicts).toHaveLength(0);
    expect(manager.listPendingEvictions()).toEqual(['qwen2.5:32b']);

    // The periodic refresh tick now drains independently of run completions.
    failEvict.value = false;
    await schedulerOf(orch)!.forceRefresh();
    await flush(); // the tick's drain is fire-and-forget

    expect(evicts.map((e) => e.name)).toEqual(['qwen2.5:32b']);
    expect(manager.listPendingEvictions()).toHaveLength(0);

    await orch.stop();
  });
});
