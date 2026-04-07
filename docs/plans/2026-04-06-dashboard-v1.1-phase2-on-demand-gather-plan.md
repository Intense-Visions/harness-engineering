# Plan: On-Demand Gather Infrastructure (Dashboard v1.1, Phase 2)

**Date:** 2026-04-06
**Spec:** docs/changes/harness-dashboard-v1.1/proposal.md
**Estimated tasks:** 6
**Estimated time:** 25 minutes

## Goal

Add a GatherCache layer that runs expensive gatherers (security, perf, arch, anomalies) once on first SSE tick, caches their results with timestamps, and supports explicit refresh via a POST endpoint that re-runs gatherers and broadcasts updated results to all SSE clients.

## Observable Truths (Acceptance Criteria)

1. When `GatherCache.run(key, gatherFn)` is called for the first time, the system shall execute `gatherFn`, store the result, and return it. (Event-driven)
2. When `GatherCache.run(key, gatherFn)` is called after a previous run, the system shall return the cached result without re-executing `gatherFn`. (State-driven)
3. When `GatherCache.refresh(key, gatherFn)` is called, the system shall re-execute `gatherFn`, update the cache, and return the fresh result. (Event-driven)
4. The system shall expose `hasRun(key)` and `lastRunTime(key)` for cache introspection.
5. `ServerContext` interface shall include a `gatherCache: GatherCache` field, and `buildContext()` shall construct one by default.
6. When the SSE manager performs its first tick, the system shall run security, perf, arch, and anomalies gatherers via `GatherCache.run()` and broadcast a `checks` event. (Event-driven)
7. While the SSE manager performs subsequent ticks, the system shall not re-run expensive gatherers -- only roadmap, health, and graph. (State-driven)
8. When `POST /api/actions/refresh-checks` is called, the system shall re-run all expensive gatherers via `GatherCache.refresh()`, broadcast the updated `checks` event via SSE, and return a JSON summary. (Event-driven)
9. The `SSEEvent` type shall include a `checks` variant carrying security, perf, arch, and anomalies results.
10. `npx vitest run` in the dashboard package shall pass with all existing and new tests green.

## File Map

```
CREATE  packages/dashboard/src/server/gather-cache.ts
CREATE  packages/dashboard/tests/server/gather-cache.test.ts
MODIFY  packages/dashboard/src/shared/types.ts (add ChecksData type, extend SSEEvent union)
MODIFY  packages/dashboard/src/server/context.ts (add gatherCache to ServerContext)
MODIFY  packages/dashboard/src/server/sse.ts (first-tick logic for expensive gatherers, broadcast checks event)
CREATE  packages/dashboard/tests/server/sse-manager-checks.test.ts
MODIFY  packages/dashboard/src/server/routes/actions.ts (add refresh-checks handler)
CREATE  packages/dashboard/tests/server/routes/actions-refresh.test.ts
```

_Skeleton not produced -- task count (6) below threshold (8)._

## Tasks

### Task 1: Add ChecksData type and extend SSEEvent union

**Depends on:** none
**Files:** `packages/dashboard/src/shared/types.ts`

1. Open `packages/dashboard/src/shared/types.ts`.
2. After the `BlastRadiusResult` type alias (line 292), add:

```typescript
// --- Checks aggregate (on-demand gather) ---

/** Combined result of all expensive gatherers for SSE broadcast */
export interface ChecksData {
  security: SecurityResult;
  perf: PerfResult;
  arch: ArchResult;
  anomalies: AnomalyResult;
  lastRun: string;
}
```

3. Extend the `SSEEvent` type union (currently lines 148-152) to add the `checks` variant:

```typescript
export type SSEEvent =
  | { type: 'roadmap'; data: RoadmapResult; timestamp: string }
  | { type: 'health'; data: HealthResult; timestamp: string }
  | { type: 'graph'; data: GraphResult; timestamp: string }
  | { type: 'overview'; data: OverviewData; timestamp: string }
  | { type: 'checks'; data: ChecksData; timestamp: string };
```

4. Run: `cd packages/dashboard && npx tsc --noEmit`
5. Run: `npx harness validate`
6. Commit: `feat(dashboard): add ChecksData type and checks SSE event variant`

---

### Task 2: Create GatherCache with TDD

**Depends on:** none
**Files:** `packages/dashboard/src/server/gather-cache.ts`, `packages/dashboard/tests/server/gather-cache.test.ts`

1. Create test file `packages/dashboard/tests/server/gather-cache.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GatherCache } from '../../src/server/gather-cache';

describe('GatherCache', () => {
  let cache: GatherCache;

  beforeEach(() => {
    vi.useFakeTimers();
    cache = new GatherCache();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('hasRun returns false for unknown key', () => {
    expect(cache.hasRun('security')).toBe(false);
  });

  it('lastRunTime returns null for unknown key', () => {
    expect(cache.lastRunTime('security')).toBeNull();
  });

  it('run executes the gather function and caches the result', async () => {
    const gatherFn = vi.fn().mockResolvedValue({ valid: true });
    const result = await cache.run('security', gatherFn);
    expect(result).toEqual({ valid: true });
    expect(gatherFn).toHaveBeenCalledTimes(1);
    expect(cache.hasRun('security')).toBe(true);
    expect(cache.lastRunTime('security')).toBeTypeOf('number');
  });

  it('run returns cached result on second call without re-executing', async () => {
    const gatherFn = vi.fn().mockResolvedValue({ valid: true });
    await cache.run('security', gatherFn);
    const result = await cache.run('security', gatherFn);
    expect(result).toEqual({ valid: true });
    expect(gatherFn).toHaveBeenCalledTimes(1);
  });

  it('refresh re-executes and updates the cache', async () => {
    const gatherFn1 = vi.fn().mockResolvedValue({ valid: true });
    const gatherFn2 = vi.fn().mockResolvedValue({ valid: false });
    await cache.run('security', gatherFn1);
    vi.advanceTimersByTime(5000);
    const result = await cache.refresh('security', gatherFn2);
    expect(result).toEqual({ valid: false });
    expect(gatherFn2).toHaveBeenCalledTimes(1);
  });

  it('refresh works on a key that has never been run', async () => {
    const gatherFn = vi.fn().mockResolvedValue({ data: 'fresh' });
    const result = await cache.refresh('perf', gatherFn);
    expect(result).toEqual({ data: 'fresh' });
    expect(cache.hasRun('perf')).toBe(true);
  });

  it('get returns null for unknown key', () => {
    expect(cache.get('missing')).toBeNull();
  });

  it('get returns cached data after run', async () => {
    const gatherFn = vi.fn().mockResolvedValue({ valid: true });
    await cache.run('security', gatherFn);
    expect(cache.get('security')).toEqual({ valid: true });
  });

  it('lastRunTime updates after refresh', async () => {
    const gatherFn = vi.fn().mockResolvedValue({ valid: true });
    await cache.run('security', gatherFn);
    const firstTime = cache.lastRunTime('security');
    vi.advanceTimersByTime(10_000);
    await cache.refresh('security', gatherFn);
    const secondTime = cache.lastRunTime('security');
    expect(secondTime).toBeGreaterThan(firstTime!);
  });
});
```

2. Run test: `cd packages/dashboard && npx vitest run tests/server/gather-cache.test.ts` -- observe failure (module not found).

3. Create implementation `packages/dashboard/src/server/gather-cache.ts`:

```typescript
/**
 * Cache for expensive gather operations.
 * Tracks per-key last-run timestamps and supports explicit refresh.
 * Unlike DataCache (TTL-based), GatherCache entries never expire --
 * they persist until explicitly refreshed or the server restarts.
 */
export class GatherCache {
  private store = new Map<string, { data: unknown; lastRun: number }>();

  /** Check whether a gatherer has been run at least once. */
  hasRun(key: string): boolean {
    return this.store.has(key);
  }

  /** Get the timestamp (ms since epoch) of the last run, or null if never run. */
  lastRunTime(key: string): number | null {
    return this.store.get(key)?.lastRun ?? null;
  }

  /** Get the cached result, or null if never run. */
  get<T>(key: string): T | null {
    const entry = this.store.get(key);
    return entry ? (entry.data as T) : null;
  }

  /**
   * Run a gather function if this key has not been run before.
   * Returns the cached result on subsequent calls.
   */
  async run<T>(key: string, gatherFn: () => Promise<T>): Promise<T> {
    const existing = this.store.get(key);
    if (existing) {
      return existing.data as T;
    }
    return this.refresh(key, gatherFn);
  }

  /**
   * Force re-run a gather function and update the cache.
   * Always executes the function regardless of cache state.
   */
  async refresh<T>(key: string, gatherFn: () => Promise<T>): Promise<T> {
    const data = await gatherFn();
    this.store.set(key, { data, lastRun: Date.now() });
    return data;
  }
}
```

4. Run test: `cd packages/dashboard && npx vitest run tests/server/gather-cache.test.ts` -- observe all pass.
5. Run: `npx harness validate`
6. Commit: `feat(dashboard): add GatherCache for on-demand gather operations`

---

### Task 3: Wire GatherCache into ServerContext

**Depends on:** Task 2
**Files:** `packages/dashboard/src/server/context.ts`

1. Modify `packages/dashboard/src/server/context.ts`:
   - Add import for `GatherCache`:
     ```typescript
     import { GatherCache } from './gather-cache';
     ```
   - Add `gatherCache` field to the `ServerContext` interface:
     ```typescript
     /** Cache for expensive on-demand gatherers */
     gatherCache: GatherCache;
     ```
   - Add `gatherCache` initialization in `buildContext()` return object:
     ```typescript
     gatherCache: overrides?.gatherCache ?? new GatherCache(),
     ```

2. Update `packages/dashboard/tests/server/sse-manager.test.ts` `makeContext()` helper to include `gatherCache`:
   - Add import: `import { GatherCache } from '../../src/server/gather-cache';`
   - Add to the return object: `gatherCache: new GatherCache(),`

3. Run: `cd packages/dashboard && npx vitest run tests/server/sse-manager.test.ts tests/server/gather-cache.test.ts`
4. Run: `cd packages/dashboard && npx tsc --noEmit`
5. Run: `npx harness validate`
6. Commit: `feat(dashboard): wire GatherCache into ServerContext`

---

### Task 4: Update SSE manager to run expensive gatherers on first tick only

**Depends on:** Task 1, Task 3
**Files:** `packages/dashboard/src/server/sse.ts`, `packages/dashboard/tests/server/sse-manager-checks.test.ts`

1. Create test file `packages/dashboard/tests/server/sse-manager-checks.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SSEManager } from '../../src/server/sse';
import type { ServerContext } from '../../src/server/context';
import { DataCache } from '../../src/server/cache';
import { GatherCache } from '../../src/server/gather-cache';

vi.mock('../../src/server/gather/roadmap', () => ({
  gatherRoadmap: vi.fn().mockResolvedValue({ error: 'skipped' }),
}));
vi.mock('../../src/server/gather/health', () => ({
  gatherHealth: vi.fn().mockResolvedValue({ error: 'skipped' }),
}));
vi.mock('../../src/server/gather/graph', () => ({
  gatherGraph: vi.fn().mockResolvedValue({ available: false, reason: 'skipped' }),
}));
vi.mock('../../src/server/gather/security', () => ({
  gatherSecurity: vi.fn().mockResolvedValue({
    valid: true,
    findings: [],
    stats: { filesScanned: 0, errorCount: 0, warningCount: 0, infoCount: 0 },
  }),
}));
vi.mock('../../src/server/gather/perf', () => ({
  gatherPerf: vi.fn().mockResolvedValue({
    valid: true,
    violations: [],
    stats: { filesAnalyzed: 0, violationCount: 0 },
  }),
}));
vi.mock('../../src/server/gather/arch', () => ({
  gatherArch: vi
    .fn()
    .mockResolvedValue({ passed: true, totalViolations: 0, regressions: [], newViolations: [] }),
}));
vi.mock('../../src/server/gather/anomalies', () => ({
  gatherAnomalies: vi
    .fn()
    .mockResolvedValue({ outliers: [], articulationPoints: [], overlapCount: 0 }),
}));

function makeStream() {
  return {
    aborted: false,
    closed: false,
    _abortListeners: [] as (() => void)[],
    onAbort(fn: () => void) {
      this._abortListeners.push(fn);
    },
    writeSSE: vi.fn().mockResolvedValue(undefined),
    simulateAbort() {
      this.aborted = true;
      for (const fn of this._abortListeners) fn();
    },
  };
}

function makeContext(): ServerContext {
  return {
    projectPath: '/fake',
    roadmapPath: '/fake/docs/roadmap.md',
    chartsPath: '/fake/docs/roadmap-charts.md',
    cache: new DataCache(60_000),
    pollIntervalMs: 100,
    sseManager: undefined!,
    gatherCache: new GatherCache(),
  };
}

describe('SSEManager on-demand gather', () => {
  let manager: SSEManager;

  beforeEach(() => {
    vi.useFakeTimers();
    manager = new SSEManager();
  });

  afterEach(() => {
    manager.stop();
    vi.useRealTimers();
  });

  it('runs expensive gatherers on first tick and emits checks event', async () => {
    const stream = makeStream();
    const ctx = makeContext();
    manager.addConnection(stream as never, ctx);

    await vi.advanceTimersByTimeAsync(150);

    // Should have two writeSSE calls: overview + checks
    expect(stream.writeSSE).toHaveBeenCalledTimes(2);
    const calls = stream.writeSSE.mock.calls;
    const events = calls.map((c: unknown[]) => JSON.parse((c[0] as { data: string }).data));
    const types = events.map((e: { type: string }) => e.type);
    expect(types).toContain('overview');
    expect(types).toContain('checks');
  });

  it('does not re-run expensive gatherers on second tick', async () => {
    const { gatherSecurity } = await import('../../src/server/gather/security');
    const stream = makeStream();
    const ctx = makeContext();
    manager.addConnection(stream as never, ctx);

    // First tick
    await vi.advanceTimersByTimeAsync(150);
    const callsAfterFirst = (gatherSecurity as ReturnType<typeof vi.fn>).mock.calls.length;

    // Reset writeSSE to track second tick only
    stream.writeSSE.mockClear();

    // Second tick
    await vi.advanceTimersByTimeAsync(150);

    // gatherSecurity should NOT have been called again
    expect((gatherSecurity as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsAfterFirst);

    // Second tick should only emit overview, not checks
    const calls = stream.writeSSE.mock.calls;
    const events = calls.map((c: unknown[]) => JSON.parse((c[0] as { data: string }).data));
    const types = events.map((e: { type: string }) => e.type);
    expect(types).toContain('overview');
    expect(types).not.toContain('checks');
  });
});
```

2. Run test: `cd packages/dashboard && npx vitest run tests/server/sse-manager-checks.test.ts` -- observe failure.

3. Modify `packages/dashboard/src/server/sse.ts`:
   - Add imports for the new gatherers and ChecksData:
     ```typescript
     import { gatherSecurity } from './gather/security';
     import { gatherPerf } from './gather/perf';
     import { gatherArch } from './gather/arch';
     import { gatherAnomalies } from './gather/anomalies';
     import type { OverviewData, ChecksData, SSEEvent } from '../shared/types';
     ```
   - Replace the existing `_tick` method with:

     ```typescript
     private async _tick(ctx: ServerContext): Promise<void> {
       const [roadmap, health, graph] = await Promise.all([
         gatherRoadmap(ctx.roadmapPath),
         gatherHealth(ctx.projectPath),
         gatherGraph(ctx.projectPath),
       ]);

       const overview: OverviewData = { roadmap, health, graph };
       const overviewEvent: SSEEvent = {
         type: 'overview',
         data: overview,
         timestamp: new Date().toISOString(),
       };

       // Run expensive gatherers only on first tick (via GatherCache.run)
       const isFirstRun = !ctx.gatherCache.hasRun('security');

       if (isFirstRun) {
         const [security, perf, arch, anomalies] = await Promise.all([
           ctx.gatherCache.run('security', () => gatherSecurity(ctx.projectPath)),
           ctx.gatherCache.run('perf', () => gatherPerf(ctx.projectPath)),
           ctx.gatherCache.run('arch', () => gatherArch(ctx.projectPath)),
           ctx.gatherCache.run('anomalies', () => gatherAnomalies(ctx.projectPath)),
         ]);

         const checksData: ChecksData = {
           security,
           perf,
           arch,
           anomalies,
           lastRun: new Date().toISOString(),
         };

         const checksEvent: SSEEvent = {
           type: 'checks',
           data: checksData,
           timestamp: new Date().toISOString(),
         };

         await this.broadcast(overviewEvent);
         await this.broadcast(checksEvent);
       } else {
         await this.broadcast(overviewEvent);
       }
     }
     ```

   - Extract a `broadcast` helper method:

     ```typescript
     /** Broadcast an SSE event to all connected streams, pruning dead connections. */
     async broadcast(event: SSEEvent): Promise<void> {
       const dead: SSEStreamingApi[] = [];

       for (const [stream] of this.connections) {
         if (stream.aborted || this.isStreamClosed(stream)) {
           dead.push(stream);
           continue;
         }
         try {
           await stream.writeSSE({
             event: event.type,
             data: JSON.stringify(event),
           });
         } catch {
           dead.push(stream);
         }
       }

       for (const stream of dead) {
         this.connections.delete(stream);
       }
       if (this.connections.size === 0) {
         this.stop();
       }
     }
     ```

4. Run test: `cd packages/dashboard && npx vitest run tests/server/sse-manager-checks.test.ts` -- observe pass.
5. Run all SSE tests: `cd packages/dashboard && npx vitest run tests/server/sse-manager.test.ts tests/server/sse-manager-checks.test.ts`
6. Run: `npx harness validate`
7. Commit: `feat(dashboard): run expensive gatherers on first SSE tick only via GatherCache`

---

### Task 5: Add POST /api/actions/refresh-checks endpoint

**Depends on:** Task 4
**Files:** `packages/dashboard/src/server/routes/actions.ts`, `packages/dashboard/tests/server/routes/actions-refresh.test.ts`

1. Create test file `packages/dashboard/tests/server/routes/actions-refresh.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { buildActionsRouter } from '../../../src/server/routes/actions';
import type { ServerContext } from '../../../src/server/context';
import { DataCache } from '../../../src/server/cache';
import { GatherCache } from '../../../src/server/gather-cache';
import { SSEManager } from '../../../src/server/sse';

vi.mock('../../../src/server/gather/security', () => ({
  gatherSecurity: vi.fn().mockResolvedValue({
    valid: true,
    findings: [],
    stats: { filesScanned: 10, errorCount: 0, warningCount: 0, infoCount: 0 },
  }),
}));
vi.mock('../../../src/server/gather/perf', () => ({
  gatherPerf: vi.fn().mockResolvedValue({
    valid: true,
    violations: [],
    stats: { filesAnalyzed: 10, violationCount: 0 },
  }),
}));
vi.mock('../../../src/server/gather/arch', () => ({
  gatherArch: vi.fn().mockResolvedValue({
    passed: true,
    totalViolations: 0,
    regressions: [],
    newViolations: [],
  }),
}));
vi.mock('../../../src/server/gather/anomalies', () => ({
  gatherAnomalies: vi.fn().mockResolvedValue({
    outliers: [],
    articulationPoints: [],
    overlapCount: 0,
  }),
}));

function makeContext(): ServerContext {
  const sseManager = new SSEManager();
  vi.spyOn(sseManager, 'broadcast').mockResolvedValue(undefined);
  return {
    projectPath: '/fake',
    roadmapPath: '/fake/docs/roadmap.md',
    chartsPath: '/fake/docs/roadmap-charts.md',
    cache: new DataCache(60_000),
    pollIntervalMs: 30_000,
    sseManager,
    gatherCache: new GatherCache(),
  };
}

describe('POST /actions/refresh-checks', () => {
  let app: Hono;
  let ctx: ServerContext;

  beforeEach(() => {
    ctx = makeContext();
    app = new Hono();
    app.route('/api', buildActionsRouter(ctx));
  });

  it('returns 200 with checks data', async () => {
    const res = await app.request('/api/actions/refresh-checks', { method: 'POST' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.checks).toBeDefined();
    expect(body.checks.security).toBeDefined();
    expect(body.checks.perf).toBeDefined();
    expect(body.checks.arch).toBeDefined();
    expect(body.checks.anomalies).toBeDefined();
    expect(body.checks.lastRun).toBeTruthy();
  });

  it('broadcasts checks event via SSE manager', async () => {
    await app.request('/api/actions/refresh-checks', { method: 'POST' });
    expect(ctx.sseManager.broadcast).toHaveBeenCalledTimes(1);
    const broadcastCall = (ctx.sseManager.broadcast as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(broadcastCall.type).toBe('checks');
  });

  it('updates gatherCache entries', async () => {
    await app.request('/api/actions/refresh-checks', { method: 'POST' });
    expect(ctx.gatherCache.hasRun('security')).toBe(true);
    expect(ctx.gatherCache.hasRun('perf')).toBe(true);
    expect(ctx.gatherCache.hasRun('arch')).toBe(true);
    expect(ctx.gatherCache.hasRun('anomalies')).toBe(true);
  });
});
```

2. Run test: `cd packages/dashboard && npx vitest run tests/server/routes/actions-refresh.test.ts` -- observe failure.

3. Modify `packages/dashboard/src/server/routes/actions.ts`:
   - Add imports at the top:
     ```typescript
     import { gatherSecurity } from '../gather/security';
     import { gatherPerf } from '../gather/perf';
     import { gatherArch } from '../gather/arch';
     import { gatherAnomalies } from '../gather/anomalies';
     import type { ChecksData, SSEEvent } from '../../shared/types';
     ```
   - Add handler function before `buildActionsRouter`:

     ```typescript
     async function handleRefreshChecks(c: Context, ctx: ServerContext): Promise<Response> {
       const [security, perf, arch, anomalies] = await Promise.all([
         ctx.gatherCache.refresh('security', () => gatherSecurity(ctx.projectPath)),
         ctx.gatherCache.refresh('perf', () => gatherPerf(ctx.projectPath)),
         ctx.gatherCache.refresh('arch', () => gatherArch(ctx.projectPath)),
         ctx.gatherCache.refresh('anomalies', () => gatherAnomalies(ctx.projectPath)),
       ]);

       const checksData: ChecksData = {
         security,
         perf,
         arch,
         anomalies,
         lastRun: new Date().toISOString(),
       };

       const checksEvent: SSEEvent = {
         type: 'checks',
         data: checksData,
         timestamp: new Date().toISOString(),
       };

       await ctx.sseManager.broadcast(checksEvent);

       return c.json({ ok: true, checks: checksData });
     }
     ```

   - Add the route to `buildActionsRouter`:
     ```typescript
     router.post('/actions/refresh-checks', (c) => handleRefreshChecks(c, ctx));
     ```

4. Run test: `cd packages/dashboard && npx vitest run tests/server/routes/actions-refresh.test.ts` -- observe pass.
5. Run: `npx harness validate`
6. Commit: `feat(dashboard): add POST /api/actions/refresh-checks endpoint`

---

### Task 6: Full integration verification

**Depends on:** Task 1-5
**Files:** none (verification only)

[checkpoint:human-verify]

1. Run all dashboard tests: `cd packages/dashboard && npx vitest run`
2. Verify all tests pass (existing + new).
3. Run: `cd packages/dashboard && npx tsc --noEmit`
4. Run: `npx harness validate`
5. Verify the following are true:
   - `GatherCache` class exists at `packages/dashboard/src/server/gather-cache.ts`
   - `ServerContext` includes `gatherCache` field in `packages/dashboard/src/server/context.ts`
   - `SSEEvent` type includes `checks` variant in `packages/dashboard/src/shared/types.ts`
   - `SSEManager._tick` runs expensive gatherers on first tick only via `GatherCache.run` in `packages/dashboard/src/server/sse.ts`
   - `SSEManager.broadcast` is a public method on the class
   - `POST /api/actions/refresh-checks` is registered in `packages/dashboard/src/server/routes/actions.ts`
   - 3 new test files exist and pass:
     - `tests/server/gather-cache.test.ts`
     - `tests/server/sse-manager-checks.test.ts`
     - `tests/server/routes/actions-refresh.test.ts`
6. Commit: `test(dashboard): verify on-demand gather infrastructure integration`

## Dependency Graph

```
Task 1 (types) ─────────────────────────┐
Task 2 (GatherCache) ──→ Task 3 (context) ──→ Task 4 (SSE) ──→ Task 5 (actions route) ──→ Task 6 (verify)
                                          └────────────────────┘
Task 1 ────────────────────────────────────────→ Task 4
```

Tasks 1 and 2 are independent and can run in parallel.
