# Plan: Dashboard Phase 3 — API Routes

**Date:** 2026-04-06
**Spec:** docs/changes/harness-dashboard/proposal.md
**Session:** changes--harness-dashboard--proposal
**Estimated tasks:** 7
**Estimated time:** 30 minutes

## Goal

Hono API routes serve gathered data over REST and SSE, with a single shared polling loop that broadcasts typed SSE events to all connected clients, completing the data-flow path from gatherers through API to browser.

## Observable Truths (Acceptance Criteria)

1. When `GET /api/overview` is called, the system shall return `ApiResponse<OverviewData>` with roadmap totals, health issue counts, and graph availability.
2. When `GET /api/roadmap` is called, the system shall return `ApiResponse<RoadmapResult>`.
3. When `GET /api/roadmap/charts` is called, the system shall return an `ApiResponse` containing `milestones`, `features`, and a `blockerEdges` array shaped for client charting.
4. When `GET /api/health` is called, the system shall return `ApiResponse<HealthResult>`.
5. When `GET /api/graph` is called, the system shall return `ApiResponse<GraphResult>`.
6. When a client opens `GET /api/sse`, the system shall accept the EventSource connection, send an initial `overview` SSE event immediately, and continue sending `overview` SSE events on the 30-second polling interval.
7. While at least one SSE client is connected, the system shall run a single shared polling loop (not one per client). If all clients disconnect, the loop shall stop.
8. When an SSE client disconnects, the system shall remove it from the active connection set within the same tick (via `onAbort` callback).
9. When `src/server/index.ts` is imported, all routes (`/api/overview`, `/api/roadmap`, `/api/roadmap/charts`, `/api/health`, `/api/graph`, `/api/sse`) shall be registered on the Hono app.
10. The system shall use `DataCache` with a 60-second TTL to avoid re-running gatherers on every request.
11. `npx vitest run tests/server/routes/ tests/server/sse-manager.test.ts` shall pass with tests covering each route's happy path and the SSEManager's connection lifecycle.

## File Map

```
CREATE packages/dashboard/src/server/context.ts
CREATE packages/dashboard/src/server/routes/overview.ts
CREATE packages/dashboard/src/server/routes/roadmap.ts
CREATE packages/dashboard/src/server/routes/health.ts
CREATE packages/dashboard/src/server/routes/graph.ts
CREATE packages/dashboard/src/server/routes/sse.ts
CREATE packages/dashboard/src/server/sse.ts
MODIFY packages/dashboard/src/server/index.ts
CREATE packages/dashboard/tests/server/routes/overview.test.ts
CREATE packages/dashboard/tests/server/routes/roadmap.test.ts
CREATE packages/dashboard/tests/server/routes/health.test.ts
CREATE packages/dashboard/tests/server/routes/graph.test.ts
CREATE packages/dashboard/tests/server/sse-manager.test.ts
```

## Tasks

### Task 1: Create server context object

**Depends on:** none
**Files:** `packages/dashboard/src/server/context.ts`

No test file needed — this is a pure configuration object with no logic. Verified by TypeScript compilation in later tasks.

1. Create `packages/dashboard/src/server/context.ts`:

   ```typescript
   import { DataCache } from './cache';
   import { DEFAULT_POLL_INTERVAL_MS } from '../shared/constants';

   export interface ServerContext {
     /** Resolved absolute path to docs/roadmap.md */
     roadmapPath: string;
     /** Resolved absolute path to the project root */
     projectPath: string;
     /** Shared in-memory cache (60s TTL) */
     cache: DataCache;
     /** SSE polling interval in milliseconds */
     pollIntervalMs: number;
   }

   /**
    * Build the server context from environment variables and defaults.
    * roadmapPath and projectPath default to the current working directory.
    */
   export function buildContext(overrides?: Partial<ServerContext>): ServerContext {
     const projectPath = overrides?.projectPath ?? process.cwd();
     const roadmapPath = overrides?.roadmapPath ?? `${projectPath}/docs/roadmap.md`;
     return {
       projectPath,
       roadmapPath,
       cache: overrides?.cache ?? new DataCache(60_000),
       pollIntervalMs: overrides?.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS,
     };
   }
   ```

2. Run: `harness validate`
3. Commit: `feat(dashboard): add ServerContext and buildContext helper`

---

### Task 2: Create SSEManager class

**Depends on:** Task 1
**Files:** `packages/dashboard/src/server/sse.ts`, `packages/dashboard/tests/server/sse-manager.test.ts`

1. Write test file `packages/dashboard/tests/server/sse-manager.test.ts`:

   ```typescript
   import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
   import { SSEManager } from '../../src/server/sse';
   import type { ServerContext } from '../../src/server/context';
   import { DataCache } from '../../src/server/cache';

   // Minimal fake SSEStreamingApi
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
       cache: new DataCache(60_000),
       pollIntervalMs: 100,
     };
   }

   describe('SSEManager', () => {
     let manager: SSEManager;

     beforeEach(() => {
       vi.useFakeTimers();
       manager = new SSEManager();
     });

     afterEach(() => {
       manager.stop();
       vi.useRealTimers();
     });

     it('starts with zero connections', () => {
       expect(manager.connectionCount).toBe(0);
     });

     it('adds a connection and increments count', () => {
       const stream = makeStream() as never;
       const ctx = makeContext();
       manager.addConnection(stream, ctx);
       expect(manager.connectionCount).toBe(1);
     });

     it('removes a connection when stream aborts', () => {
       const stream = makeStream();
       const ctx = makeContext();
       manager.addConnection(stream as never, ctx);
       stream.simulateAbort();
       expect(manager.connectionCount).toBe(0);
     });

     it('stops the polling loop when all clients disconnect', () => {
       const stream = makeStream();
       const ctx = makeContext();
       manager.addConnection(stream as never, ctx);
       expect(manager.isRunning).toBe(true);
       stream.simulateAbort();
       expect(manager.isRunning).toBe(false);
     });

     it('broadcasts to all connected streams on tick', async () => {
       const stream1 = makeStream();
       const stream2 = makeStream();
       const ctx = makeContext();

       // Mock gatherers to avoid real FS calls
       vi.mock('../../src/server/gather/roadmap', () => ({
         gatherRoadmap: vi.fn().mockResolvedValue({ error: 'skipped' }),
       }));
       vi.mock('../../src/server/gather/health', () => ({
         gatherHealth: vi.fn().mockResolvedValue({ error: 'skipped' }),
       }));
       vi.mock('../../src/server/gather/graph', () => ({
         gatherGraph: vi.fn().mockResolvedValue({ available: false, reason: 'skipped' }),
       }));

       manager.addConnection(stream1 as never, ctx);
       manager.addConnection(stream2 as never, ctx);

       // Advance past one poll interval
       await vi.runAllTimersAsync();

       expect(stream1.writeSSE).toHaveBeenCalled();
       expect(stream2.writeSSE).toHaveBeenCalled();
     });
   });
   ```

2. Run: `npx vitest run packages/dashboard/tests/server/sse-manager.test.ts` — observe: `SSEManager is not defined`

3. Create `packages/dashboard/src/server/sse.ts`:

   ```typescript
   import type { SSEStreamingApi } from 'hono/streaming';
   import { gatherRoadmap } from './gather/roadmap';
   import { gatherHealth } from './gather/health';
   import { gatherGraph } from './gather/graph';
   import type { OverviewData, SSEEvent } from '../shared/types';
   import type { ServerContext } from './context';

   /**
    * Manages all active SSE connections and runs a single shared polling loop.
    * When the first client connects the loop starts; when the last disconnects it stops.
    */
   export class SSEManager {
     private connections = new Map<SSEStreamingApi, ServerContext>();
     private timer: ReturnType<typeof setInterval> | null = null;

     get connectionCount(): number {
       return this.connections.size;
     }

     get isRunning(): boolean {
       return this.timer !== null;
     }

     /**
      * Register a new SSE stream. Starts the polling loop if this is the first connection.
      * Automatically removes the stream when it aborts (client disconnects).
      */
     addConnection(stream: SSEStreamingApi, ctx: ServerContext): void {
       this.connections.set(stream, ctx);

       stream.onAbort(() => {
         this.connections.delete(stream);
         if (this.connections.size === 0) {
           this.stop();
         }
       });

       if (!this.isRunning) {
         this.start(ctx);
       }
     }

     /** Stop the polling loop and clear all connections. */
     stop(): void {
       if (this.timer !== null) {
         clearInterval(this.timer);
         this.timer = null;
       }
     }

     private start(ctx: ServerContext): void {
       this.timer = setInterval(() => {
         void this.tick(ctx);
       }, ctx.pollIntervalMs);
     }

     /** Gather all data and broadcast an overview event to all connected streams. */
     async tick(ctx: ServerContext): Promise<void> {
       const [roadmap, health, graph] = await Promise.all([
         gatherRoadmap(ctx.roadmapPath),
         gatherHealth(ctx.projectPath),
         gatherGraph(ctx.projectPath),
       ]);

       const overview: OverviewData = { roadmap, health, graph };
       const event: SSEEvent = {
         type: 'overview',
         data: overview,
         timestamp: new Date().toISOString(),
       };

       const dead: SSEStreamingApi[] = [];

       for (const [stream] of this.connections) {
         if (stream.aborted || stream.closed) {
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
   }
   ```

4. Run: `npx vitest run packages/dashboard/tests/server/sse-manager.test.ts`
5. Observe: all tests pass
6. Run: `harness validate`
7. Commit: `feat(dashboard): add SSEManager with shared polling loop and broadcast`

---

### Task 3: Create data route files — overview, health, graph

**Depends on:** Task 1
**Files:**

- `packages/dashboard/src/server/routes/overview.ts`
- `packages/dashboard/src/server/routes/health.ts`
- `packages/dashboard/src/server/routes/graph.ts`
- `packages/dashboard/tests/server/routes/overview.test.ts`
- `packages/dashboard/tests/server/routes/health.test.ts`
- `packages/dashboard/tests/server/routes/graph.test.ts`

1. Write test file `packages/dashboard/tests/server/routes/overview.test.ts`:

   ```typescript
   import { describe, it, expect, vi, beforeEach } from 'vitest';
   import { Hono } from 'hono';
   import type { ServerContext } from '../../../src/server/context';
   import { DataCache } from '../../../src/server/cache';

   vi.mock('../../../src/server/gather/roadmap', () => ({
     gatherRoadmap: vi.fn().mockResolvedValue({
       milestones: [],
       features: [],
       totalFeatures: 3,
       totalDone: 1,
       totalInProgress: 1,
       totalPlanned: 1,
       totalBlocked: 0,
       totalBacklog: 0,
     }),
   }));
   vi.mock('../../../src/server/gather/health', () => ({
     gatherHealth: vi.fn().mockResolvedValue({
       totalIssues: 2,
       errors: 0,
       warnings: 2,
       fixableCount: 1,
       suggestionCount: 0,
       durationMs: 100,
       analysisErrors: [],
     }),
   }));
   vi.mock('../../../src/server/gather/graph', () => ({
     gatherGraph: vi.fn().mockResolvedValue({ available: false, reason: 'no graph' }),
   }));

   function makeCtx(): ServerContext {
     return {
       projectPath: '/fake',
       roadmapPath: '/fake/docs/roadmap.md',
       cache: new DataCache(60_000),
       pollIntervalMs: 30_000,
     };
   }

   describe('GET /api/overview', () => {
     let app: Hono;

     beforeEach(async () => {
       const { buildOverviewRouter } = await import('../../../src/server/routes/overview');
       app = new Hono();
       app.route('/api', buildOverviewRouter(makeCtx()));
     });

     it('returns 200 with OverviewData', async () => {
       const res = await app.request('/api/overview');
       expect(res.status).toBe(200);
       const body = (await res.json()) as {
         data: { roadmap: unknown; health: unknown; graph: unknown };
         timestamp: string;
       };
       expect(body.data.roadmap).toBeDefined();
       expect(body.data.health).toBeDefined();
       expect(body.data.graph).toBeDefined();
       expect(body.timestamp).toBeTypeOf('string');
     });

     it('uses cached result on second call', async () => {
       const { gatherRoadmap } = await import('../../../src/server/gather/roadmap');
       await app.request('/api/overview');
       await app.request('/api/overview');
       expect(vi.mocked(gatherRoadmap)).toHaveBeenCalledTimes(1);
     });
   });
   ```

2. Write test file `packages/dashboard/tests/server/routes/health.test.ts`:

   ```typescript
   import { describe, it, expect, vi, beforeEach } from 'vitest';
   import { Hono } from 'hono';
   import type { ServerContext } from '../../../src/server/context';
   import { DataCache } from '../../../src/server/cache';

   vi.mock('../../../src/server/gather/health', () => ({
     gatherHealth: vi.fn().mockResolvedValue({
       totalIssues: 5,
       errors: 1,
       warnings: 4,
       fixableCount: 2,
       suggestionCount: 0,
       durationMs: 200,
       analysisErrors: [],
     }),
   }));

   function makeCtx(): ServerContext {
     return {
       projectPath: '/fake',
       roadmapPath: '/fake/docs/roadmap.md',
       cache: new DataCache(60_000),
       pollIntervalMs: 30_000,
     };
   }

   describe('GET /api/health', () => {
     let app: Hono;

     beforeEach(async () => {
       const { buildHealthRouter } = await import('../../../src/server/routes/health');
       app = new Hono();
       app.route('/api', buildHealthRouter(makeCtx()));
     });

     it('returns 200 with HealthResult', async () => {
       const res = await app.request('/api/health');
       expect(res.status).toBe(200);
       const body = (await res.json()) as { data: { totalIssues: number }; timestamp: string };
       expect(body.data.totalIssues).toBe(5);
       expect(body.timestamp).toBeTypeOf('string');
     });
   });
   ```

3. Write test file `packages/dashboard/tests/server/routes/graph.test.ts`:

   ```typescript
   import { describe, it, expect, vi, beforeEach } from 'vitest';
   import { Hono } from 'hono';
   import type { ServerContext } from '../../../src/server/context';
   import { DataCache } from '../../../src/server/cache';

   vi.mock('../../../src/server/gather/graph', () => ({
     gatherGraph: vi.fn().mockResolvedValue({ available: false, reason: 'not connected' }),
   }));

   function makeCtx(): ServerContext {
     return {
       projectPath: '/fake',
       roadmapPath: '/fake/docs/roadmap.md',
       cache: new DataCache(60_000),
       pollIntervalMs: 30_000,
     };
   }

   describe('GET /api/graph', () => {
     let app: Hono;

     beforeEach(async () => {
       const { buildGraphRouter } = await import('../../../src/server/routes/graph');
       app = new Hono();
       app.route('/api', buildGraphRouter(makeCtx()));
     });

     it('returns 200 with GraphResult', async () => {
       const res = await app.request('/api/graph');
       expect(res.status).toBe(200);
       const body = (await res.json()) as { data: { available: boolean }; timestamp: string };
       expect(body.data.available).toBe(false);
       expect(body.timestamp).toBeTypeOf('string');
     });
   });
   ```

4. Run: `npx vitest run packages/dashboard/tests/server/routes/overview.test.ts packages/dashboard/tests/server/routes/health.test.ts packages/dashboard/tests/server/routes/graph.test.ts` — observe failures (modules not defined)

5. Create `packages/dashboard/src/server/routes/overview.ts`:

   ```typescript
   import { Hono } from 'hono';
   import { gatherRoadmap } from '../gather/roadmap';
   import { gatherHealth } from '../gather/health';
   import { gatherGraph } from '../gather/graph';
   import type { ApiResponse, OverviewData } from '../../shared/types';
   import type { ServerContext } from '../context';

   const CACHE_KEY = 'overview';

   export function buildOverviewRouter(ctx: ServerContext): Hono {
     const router = new Hono();

     router.get('/overview', async (c) => {
       const cached = ctx.cache.get<OverviewData>(CACHE_KEY);
       if (cached) {
         const response: ApiResponse<OverviewData> = {
           data: cached.data,
           timestamp: new Date(cached.timestamp).toISOString(),
         };
         return c.json(response);
       }

       const [roadmap, health, graph] = await Promise.all([
         gatherRoadmap(ctx.roadmapPath),
         gatherHealth(ctx.projectPath),
         gatherGraph(ctx.projectPath),
       ]);

       const data: OverviewData = { roadmap, health, graph };
       ctx.cache.set(CACHE_KEY, data);

       const entry = ctx.cache.get<OverviewData>(CACHE_KEY)!;
       const response: ApiResponse<OverviewData> = {
         data: entry.data,
         timestamp: new Date(entry.timestamp).toISOString(),
       };
       return c.json(response);
     });

     return router;
   }
   ```

6. Create `packages/dashboard/src/server/routes/health.ts`:

   ```typescript
   import { Hono } from 'hono';
   import { gatherHealth } from '../gather/health';
   import type { ApiResponse, HealthResult } from '../../shared/types';
   import type { ServerContext } from '../context';

   const CACHE_KEY = 'health';

   export function buildHealthRouter(ctx: ServerContext): Hono {
     const router = new Hono();

     router.get('/health', async (c) => {
       const cached = ctx.cache.get<HealthResult>(CACHE_KEY);
       if (cached) {
         const response: ApiResponse<HealthResult> = {
           data: cached.data,
           timestamp: new Date(cached.timestamp).toISOString(),
         };
         return c.json(response);
       }

       const data = await gatherHealth(ctx.projectPath);
       ctx.cache.set(CACHE_KEY, data);

       const entry = ctx.cache.get<HealthResult>(CACHE_KEY)!;
       const response: ApiResponse<HealthResult> = {
         data: entry.data,
         timestamp: new Date(entry.timestamp).toISOString(),
       };
       return c.json(response);
     });

     return router;
   }
   ```

7. Create `packages/dashboard/src/server/routes/graph.ts`:

   ```typescript
   import { Hono } from 'hono';
   import { gatherGraph } from '../gather/graph';
   import type { ApiResponse, GraphResult } from '../../shared/types';
   import type { ServerContext } from '../context';

   const CACHE_KEY = 'graph';

   export function buildGraphRouter(ctx: ServerContext): Hono {
     const router = new Hono();

     router.get('/graph', async (c) => {
       const cached = ctx.cache.get<GraphResult>(CACHE_KEY);
       if (cached) {
         const response: ApiResponse<GraphResult> = {
           data: cached.data,
           timestamp: new Date(cached.timestamp).toISOString(),
         };
         return c.json(response);
       }

       const data = await gatherGraph(ctx.projectPath);
       ctx.cache.set(CACHE_KEY, data);

       const entry = ctx.cache.get<GraphResult>(CACHE_KEY)!;
       const response: ApiResponse<GraphResult> = {
         data: entry.data,
         timestamp: new Date(entry.timestamp).toISOString(),
       };
       return c.json(response);
     });

     return router;
   }
   ```

8. Run: `npx vitest run packages/dashboard/tests/server/routes/overview.test.ts packages/dashboard/tests/server/routes/health.test.ts packages/dashboard/tests/server/routes/graph.test.ts`
9. Observe: all tests pass
10. Run: `harness validate`
11. Commit: `feat(dashboard): add overview, health, and graph API route handlers`

---

### Task 4: Create roadmap route (GET /api/roadmap and GET /api/roadmap/charts)

**Depends on:** Task 1
**Files:** `packages/dashboard/src/server/routes/roadmap.ts`, `packages/dashboard/tests/server/routes/roadmap.test.ts`

1. Write test file `packages/dashboard/tests/server/routes/roadmap.test.ts`:

   ```typescript
   import { describe, it, expect, vi, beforeEach } from 'vitest';
   import { Hono } from 'hono';
   import type { ServerContext } from '../../../src/server/context';
   import { DataCache } from '../../../src/server/cache';

   const FAKE_ROADMAP_DATA = {
     milestones: [
       {
         name: 'M1',
         isBacklog: false,
         total: 2,
         done: 1,
         inProgress: 0,
         planned: 1,
         blocked: 0,
         backlog: 0,
       },
     ],
     features: [
       {
         name: 'feat-a',
         status: 'done',
         summary: 'first',
         milestone: 'M1',
         blockedBy: [],
         assignee: null,
         priority: null,
       },
       {
         name: 'feat-b',
         status: 'planned',
         summary: 'second',
         milestone: 'M1',
         blockedBy: ['feat-a'],
         assignee: null,
         priority: null,
       },
     ],
     totalFeatures: 2,
     totalDone: 1,
     totalInProgress: 0,
     totalPlanned: 1,
     totalBlocked: 0,
     totalBacklog: 0,
   };

   vi.mock('../../../src/server/gather/roadmap', () => ({
     gatherRoadmap: vi.fn().mockResolvedValue(FAKE_ROADMAP_DATA),
   }));

   function makeCtx(): ServerContext {
     return {
       projectPath: '/fake',
       roadmapPath: '/fake/docs/roadmap.md',
       cache: new DataCache(60_000),
       pollIntervalMs: 30_000,
     };
   }

   describe('GET /api/roadmap', () => {
     let app: Hono;

     beforeEach(async () => {
       const { buildRoadmapRouter } = await import('../../../src/server/routes/roadmap');
       app = new Hono();
       app.route('/api', buildRoadmapRouter(makeCtx()));
     });

     it('returns 200 with RoadmapResult', async () => {
       const res = await app.request('/api/roadmap');
       expect(res.status).toBe(200);
       const body = (await res.json()) as { data: typeof FAKE_ROADMAP_DATA; timestamp: string };
       expect(body.data.totalFeatures).toBe(2);
       expect(body.data.milestones).toHaveLength(1);
       expect(body.timestamp).toBeTypeOf('string');
     });
   });

   describe('GET /api/roadmap/charts', () => {
     let app: Hono;

     beforeEach(async () => {
       const { buildRoadmapRouter } = await import('../../../src/server/routes/roadmap');
       app = new Hono();
       app.route('/api', buildRoadmapRouter(makeCtx()));
     });

     it('returns 200 with chart-shaped data', async () => {
       const res = await app.request('/api/roadmap/charts');
       expect(res.status).toBe(200);
       const body = (await res.json()) as {
         data: {
           milestones: unknown[];
           features: unknown[];
           blockerEdges: unknown[];
         };
         timestamp: string;
       };
       expect(body.data.milestones).toBeDefined();
       expect(body.data.features).toBeDefined();
       expect(Array.isArray(body.data.blockerEdges)).toBe(true);
     });

     it('derives blocker edges from features with blockedBy', async () => {
       const res = await app.request('/api/roadmap/charts');
       const body = (await res.json()) as {
         data: { blockerEdges: { from: string; to: string }[] };
       };
       expect(body.data.blockerEdges).toEqual([{ from: 'feat-a', to: 'feat-b' }]);
     });

     it('returns empty blockerEdges when no blockers exist', async () => {
       const { gatherRoadmap } = await import('../../../src/server/gather/roadmap');
       vi.mocked(gatherRoadmap).mockResolvedValueOnce({
         ...FAKE_ROADMAP_DATA,
         features: [{ ...FAKE_ROADMAP_DATA.features[0], blockedBy: [] }],
       });
       const res = await app.request('/api/roadmap/charts');
       const body = (await res.json()) as { data: { blockerEdges: unknown[] } };
       expect(body.data.blockerEdges).toHaveLength(0);
     });
   });
   ```

2. Run: `npx vitest run packages/dashboard/tests/server/routes/roadmap.test.ts` — observe failures

3. Create `packages/dashboard/src/server/routes/roadmap.ts`:

   ```typescript
   import { Hono } from 'hono';
   import { gatherRoadmap } from '../gather/roadmap';
   import type { ApiResponse, RoadmapResult, RoadmapData } from '../../shared/types';
   import type { ServerContext } from '../context';

   export interface BlockerEdge {
     from: string;
     to: string;
   }

   export interface RoadmapChartsData {
     milestones: RoadmapData['milestones'];
     features: RoadmapData['features'];
     blockerEdges: BlockerEdge[];
   }

   const CACHE_KEY = 'roadmap';

   async function getOrFetch(ctx: ServerContext): Promise<RoadmapResult> {
     const cached = ctx.cache.get<RoadmapResult>(CACHE_KEY);
     if (cached) return cached.data;
     const data = await gatherRoadmap(ctx.roadmapPath);
     ctx.cache.set(CACHE_KEY, data);
     return data;
   }

   function buildBlockerEdges(data: RoadmapData): BlockerEdge[] {
     const edges: BlockerEdge[] = [];
     for (const feature of data.features) {
       for (const blocker of feature.blockedBy) {
         edges.push({ from: blocker, to: feature.name });
       }
     }
     return edges;
   }

   export function buildRoadmapRouter(ctx: ServerContext): Hono {
     const router = new Hono();

     router.get('/roadmap', async (c) => {
       const data = await getOrFetch(ctx);
       const entry = ctx.cache.get<RoadmapResult>(CACHE_KEY);
       const timestamp = entry ? new Date(entry.timestamp).toISOString() : new Date().toISOString();
       const response: ApiResponse<RoadmapResult> = { data, timestamp };
       return c.json(response);
     });

     router.get('/roadmap/charts', async (c) => {
       const data = await getOrFetch(ctx);
       const entry = ctx.cache.get<RoadmapResult>(CACHE_KEY);
       const timestamp = entry ? new Date(entry.timestamp).toISOString() : new Date().toISOString();

       // If the gatherer failed, return the error directly
       if ('error' in data) {
         const response: ApiResponse<RoadmapResult> = { data, timestamp };
         return c.json(response);
       }

       const chartsData: RoadmapChartsData = {
         milestones: data.milestones,
         features: data.features,
         blockerEdges: buildBlockerEdges(data),
       };
       const response: ApiResponse<RoadmapChartsData> = { data: chartsData, timestamp };
       return c.json(response);
     });

     return router;
   }
   ```

4. Run: `npx vitest run packages/dashboard/tests/server/routes/roadmap.test.ts`
5. Observe: all tests pass
6. Run: `harness validate`
7. Commit: `feat(dashboard): add roadmap and roadmap/charts API route handlers`

---

### Task 5: Create SSE route handler

**Depends on:** Tasks 1, 2
**Files:** `packages/dashboard/src/server/routes/sse.ts`

No isolated unit test for the route handler itself — SSE streaming is difficult to unit test through `app.request()`. The SSEManager is already tested in Task 2. The route wiring is verified by integration in Task 6.

1. Create `packages/dashboard/src/server/routes/sse.ts`:

   ```typescript
   import { Hono } from 'hono';
   import { streamSSE } from 'hono/streaming';
   import { SSEManager } from '../sse';
   import type { ServerContext } from '../context';

   // Single shared manager instance for the process lifetime.
   // Tests that need isolation should import and instantiate SSEManager directly.
   let sharedManager: SSEManager | null = null;

   function getManager(): SSEManager {
     if (!sharedManager) {
       sharedManager = new SSEManager();
     }
     return sharedManager;
   }

   /** Reset the shared manager (test helper — not exported to client code). */
   export function resetManager(): void {
     sharedManager?.stop();
     sharedManager = null;
   }

   export function buildSseRouter(ctx: ServerContext): Hono {
     const router = new Hono();

     router.get('/sse', (c) => {
       return streamSSE(c, async (stream) => {
         const manager = getManager();

         // Register the connection — manager handles polling and broadcast
         manager.addConnection(stream, ctx);

         // Send an immediate snapshot so the client doesn't wait 30s for first data
         await manager.tick(ctx);

         // Hold the connection open until the client disconnects (stream.aborted becomes true)
         await new Promise<void>((resolve) => {
           stream.onAbort(resolve);
         });
       });
     });

     return router;
   }
   ```

2. Run: `harness validate`
3. Commit: `feat(dashboard): add SSE route handler using shared SSEManager`

---

### Task 6: Wire all routes into src/server/index.ts

**Depends on:** Tasks 3, 4, 5
**Files:** `packages/dashboard/src/server/index.ts`

1. Read the current content of `packages/dashboard/src/server/index.ts` (already read at plan-time — lines 1–21, reproduced for reference):

   ```typescript
   import { Hono } from 'hono';
   import { logger } from 'hono/logger';
   import { cors } from 'hono/cors';
   import { healthCheck } from './routes/health-check';
   import { DASHBOARD_PORT } from '../shared/constants';

   const app = new Hono();

   app.use('*', logger());
   app.use('*', cors({ origin: [...] }));
   app.route('/api', healthCheck);
   export { app };
   ```

2. Modify `packages/dashboard/src/server/index.ts` to add all new routes:

   ```typescript
   import { Hono } from 'hono';
   import { logger } from 'hono/logger';
   import { cors } from 'hono/cors';
   import { healthCheck } from './routes/health-check';
   import { buildOverviewRouter } from './routes/overview';
   import { buildRoadmapRouter } from './routes/roadmap';
   import { buildHealthRouter } from './routes/health';
   import { buildGraphRouter } from './routes/graph';
   import { buildSseRouter } from './routes/sse';
   import { buildContext } from './context';
   import { DASHBOARD_PORT } from '../shared/constants';

   const ctx = buildContext();
   const app = new Hono();

   // Middleware
   app.use('*', logger());
   app.use(
     '*',
     cors({
       origin: [`http://localhost:${DASHBOARD_PORT}`, `http://127.0.0.1:${DASHBOARD_PORT}`],
     })
   );

   // API routes
   app.route('/api', healthCheck);
   app.route('/api', buildOverviewRouter(ctx));
   app.route('/api', buildRoadmapRouter(ctx));
   app.route('/api', buildHealthRouter(ctx));
   app.route('/api', buildGraphRouter(ctx));
   app.route('/api', buildSseRouter(ctx));

   export { app };
   ```

3. Run: `npx vitest run packages/dashboard/tests/server/health-check.test.ts` — verify the existing health-check test still passes after the rewrite
4. Run: `npx vitest run packages/dashboard/tests/server/` — all server tests pass
5. Run: `harness validate`
6. Commit: `feat(dashboard): wire all API routes into Hono app`

---

### Task 7: Full test suite pass and architecture baseline update

**Depends on:** Task 6
**Files:** none new (arch baseline update only if required)

[checkpoint:human-verify] — Run the server manually to verify data flows to browser before this task.

1. Run the full test suite: `npx vitest run packages/dashboard/`
2. Observe: all tests pass (expected: ~25+ tests across cache, gatherers, routes, and SSEManager)
3. If `harness validate` reports a module-size or arch baseline regression (as noted in Phase 2 learnings), update the baseline:
   ```
   harness check-arch --update-baseline
   ```
4. Run: `harness validate` — must pass cleanly
5. Commit: `test(dashboard): verify full phase 3 test suite passes`

---

## Learnings from Prior Phases (apply during execution)

- `parseRoadmap` frontmatter uses snake_case keys (`last_synced`, `last_manual_edit`) — not camelCase
- `EntropyConfig` requires an `analyze` object — it is NOT optional
- Constructor mocking in vitest 4: use a class mock inside `vi.mock()` factory, not `vi.mocked(Class).mockImplementation`
- After adding new files, run `harness check-arch --update-baseline` if arch baseline regresses

## Observable Truth Traceability

| Observable Truth                                           | Delivered By        |
| ---------------------------------------------------------- | ------------------- |
| 1. GET /api/overview returns OverviewData                  | Task 3              |
| 2. GET /api/roadmap returns RoadmapResult                  | Task 4              |
| 3. GET /api/roadmap/charts returns chart-shaped data       | Task 4              |
| 4. GET /api/health returns HealthResult                    | Task 3              |
| 5. GET /api/graph returns GraphResult                      | Task 3              |
| 6. GET /api/sse sends immediate + periodic overview events | Task 5              |
| 7. Single shared polling loop                              | Task 2 (SSEManager) |
| 8. Disconnected clients removed via onAbort                | Task 2 (SSEManager) |
| 9. All routes registered on Hono app                       | Task 6              |
| 10. DataCache used to avoid redundant gatherer calls       | Tasks 3, 4          |
| 11. Tests pass for all routes and SSEManager               | Tasks 2, 3, 4, 7    |
