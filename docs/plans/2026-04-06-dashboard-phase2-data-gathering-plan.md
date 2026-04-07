# Plan: Dashboard Phase 2 -- Shared Types + Data Gathering Layer

**Date:** 2026-04-06
**Spec:** docs/changes/harness-dashboard/proposal.md
**Estimated tasks:** 7
**Estimated time:** 30 minutes

## Goal

Build shared API response types, a server-side cache with TTL, and three data gatherers (roadmap, health, graph) that import directly from `@harness-engineering/core` and `@harness-engineering/graph`, with graceful degradation when dependencies are unavailable, and unit tests for all gatherers.

## Observable Truths (Acceptance Criteria)

1. `packages/dashboard/package.json` lists `@harness-engineering/core: "workspace:*"` and `@harness-engineering/graph: "workspace:*"` in dependencies.
2. `packages/dashboard/src/shared/types.ts` exports API response types for roadmap, health, graph, and overview endpoints, plus the `CacheEntry<T>` type.
3. When the cache stores an entry and TTL has not expired, `cache.get(key)` returns the stored data with a timestamp.
4. When the cache TTL has expired, `cache.get(key)` returns `null`.
5. When `gatherRoadmap()` is called with a valid roadmap file path, it returns a `RoadmapData` object with milestones, features, and per-milestone progress counts.
6. When `gatherRoadmap()` is called with a nonexistent file path, it returns `{ error: string }` instead of throwing.
7. When `gatherHealth()` is called with a valid project path, it returns an `HealthData` object with summary entropy metrics.
8. When `gatherHealth()` fails (e.g., invalid config), it returns `{ error: string }` instead of throwing.
9. When `gatherGraph()` is called and `.harness/graph/` exists with valid data, it returns a `GraphData` object with `available: true`, node count, edge count, and node-type breakdown.
10. When `gatherGraph()` is called and `.harness/graph/` does not exist, it returns `{ available: false, reason: string }`.
11. `npx vitest run` in `packages/dashboard` passes all tests (existing health-check test + new cache and gatherer tests).
12. The `server/` to `shared/` import boundary is respected -- gatherers import from `shared/types.ts` for response shapes but never from `client/`.

## File Map

```
MODIFY packages/dashboard/package.json (add @harness-engineering/core, @harness-engineering/graph workspace deps)
MODIFY packages/dashboard/src/shared/types.ts (expand with full API response types)
CREATE packages/dashboard/src/server/cache.ts
CREATE packages/dashboard/src/server/gather/roadmap.ts
CREATE packages/dashboard/src/server/gather/health.ts
CREATE packages/dashboard/src/server/gather/graph.ts
CREATE packages/dashboard/src/server/gather/index.ts (barrel export)
CREATE packages/dashboard/tests/server/cache.test.ts
CREATE packages/dashboard/tests/server/gather/roadmap.test.ts
CREATE packages/dashboard/tests/server/gather/health.test.ts
CREATE packages/dashboard/tests/server/gather/graph.test.ts
```

_Skeleton not produced -- task count (7) below threshold (8)._

## Tasks

### Task 1: Add workspace dependencies to package.json

**Depends on:** none
**Files:** `packages/dashboard/package.json`

1. Open `packages/dashboard/package.json` and add to `dependencies`:
   ```json
   "@harness-engineering/core": "workspace:*",
   "@harness-engineering/graph": "workspace:*"
   ```
2. Run from monorepo root: `pnpm install`
3. Verify no errors.
4. Run: `harness validate`
5. Commit: `build(dashboard): add core and graph workspace dependencies`

---

### Task 2: Expand shared API response types (TDD)

**Depends on:** Task 1
**Files:** `packages/dashboard/src/shared/types.ts`

1. Replace the contents of `packages/dashboard/src/shared/types.ts` with the full type definitions:

   ```typescript
   import type {
     Roadmap,
     RoadmapMilestone,
     RoadmapFeature,
     FeatureStatus,
   } from '@harness-engineering/core';

   /** Health check response shape */
   export interface HealthCheckResponse {
     status: 'ok' | 'error';
   }

   /** Generic API response wrapper with timestamp */
   export interface ApiResponse<T> {
     data: T;
     timestamp: string;
   }

   /** API error response */
   export interface ApiErrorResponse {
     error: string;
     timestamp: string;
   }

   // --- Cache ---

   /** A cache entry with timestamp and TTL tracking */
   export interface CacheEntry<T> {
     data: T;
     timestamp: number;
     expiresAt: number;
   }

   // --- Roadmap types ---

   /** Per-milestone progress summary */
   export interface MilestoneProgress {
     name: string;
     isBacklog: boolean;
     total: number;
     done: number;
     inProgress: number;
     planned: number;
     blocked: number;
     backlog: number;
   }

   /** Roadmap gatherer result */
   export interface RoadmapData {
     milestones: MilestoneProgress[];
     features: RoadmapFeature[];
     totalFeatures: number;
     totalDone: number;
     totalInProgress: number;
     totalPlanned: number;
     totalBlocked: number;
     totalBacklog: number;
   }

   /** Roadmap gatherer error result */
   export interface RoadmapError {
     error: string;
   }

   export type RoadmapResult = RoadmapData | RoadmapError;

   // --- Health types ---

   /** Codebase health gatherer result */
   export interface HealthData {
     totalIssues: number;
     errors: number;
     warnings: number;
     fixableCount: number;
     suggestionCount: number;
     durationMs: number;
     analysisErrors: string[];
   }

   /** Health gatherer error result */
   export interface HealthError {
     error: string;
   }

   export type HealthResult = HealthData | HealthError;

   // --- Graph types ---

   /** Node type breakdown for graph metrics */
   export interface NodeTypeCount {
     type: string;
     count: number;
   }

   /** Graph gatherer result when available */
   export interface GraphData {
     available: true;
     nodeCount: number;
     edgeCount: number;
     nodesByType: NodeTypeCount[];
   }

   /** Graph gatherer result when unavailable */
   export interface GraphUnavailable {
     available: false;
     reason: string;
   }

   export type GraphResult = GraphData | GraphUnavailable;

   // --- Overview types ---

   /** KPI overview combining all data sources */
   export interface OverviewData {
     roadmap: RoadmapResult;
     health: HealthResult;
     graph: GraphResult;
   }

   // --- SSE event types ---

   export type SSEEventType = 'roadmap' | 'health' | 'graph' | 'overview';

   export interface SSEEvent {
     type: SSEEventType;
     data: unknown;
     timestamp: string;
   }
   ```

2. Run: `pnpm --filter @harness-engineering/dashboard typecheck`
3. Observe: no type errors.
4. Run: `harness validate`
5. Commit: `feat(dashboard): expand shared API response types for all data domains`

---

### Task 3: Create server-side cache with TTL (TDD)

**Depends on:** Task 2
**Files:** `packages/dashboard/src/server/cache.ts`, `packages/dashboard/tests/server/cache.test.ts`

1. Create test file `packages/dashboard/tests/server/cache.test.ts`:

   ```typescript
   import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
   import { DataCache } from '../../src/server/cache';

   describe('DataCache', () => {
     let cache: DataCache;

     beforeEach(() => {
       vi.useFakeTimers();
       cache = new DataCache(60_000); // 60s TTL
     });

     afterEach(() => {
       vi.useRealTimers();
     });

     it('returns null for unknown key', () => {
       expect(cache.get('missing')).toBeNull();
     });

     it('stores and retrieves a value', () => {
       cache.set('key', { foo: 'bar' });
       const entry = cache.get<{ foo: string }>('key');
       expect(entry).not.toBeNull();
       expect(entry!.data).toEqual({ foo: 'bar' });
       expect(entry!.timestamp).toBeTypeOf('number');
     });

     it('returns null for expired entry', () => {
       cache.set('key', { foo: 'bar' });
       vi.advanceTimersByTime(61_000);
       expect(cache.get('key')).toBeNull();
     });

     it('returns entry before TTL expires', () => {
       cache.set('key', { foo: 'bar' });
       vi.advanceTimersByTime(59_000);
       expect(cache.get('key')).not.toBeNull();
     });

     it('invalidates a specific key', () => {
       cache.set('key', { foo: 'bar' });
       cache.invalidate('key');
       expect(cache.get('key')).toBeNull();
     });

     it('clears all entries', () => {
       cache.set('a', 1);
       cache.set('b', 2);
       cache.clear();
       expect(cache.get('a')).toBeNull();
       expect(cache.get('b')).toBeNull();
     });
   });
   ```

2. Run test: `pnpm --filter @harness-engineering/dashboard test -- tests/server/cache.test.ts`
3. Observe failure: `DataCache` is not defined.
4. Create implementation `packages/dashboard/src/server/cache.ts`:

   ```typescript
   import type { CacheEntry } from '../shared/types';

   /**
    * Simple in-memory cache with configurable TTL.
    * Used by gatherers and SSE polling to avoid redundant computation.
    */
   export class DataCache {
     private store = new Map<string, CacheEntry<unknown>>();
     private defaultTtlMs: number;

     constructor(defaultTtlMs: number) {
       this.defaultTtlMs = defaultTtlMs;
     }

     /** Get a cached entry. Returns null if missing or expired. */
     get<T>(key: string): CacheEntry<T> | null {
       const entry = this.store.get(key);
       if (!entry) return null;
       if (Date.now() >= entry.expiresAt) {
         this.store.delete(key);
         return null;
       }
       return entry as CacheEntry<T>;
     }

     /** Store a value with the default TTL. */
     set<T>(key: string, data: T, ttlMs?: number): void {
       const now = Date.now();
       this.store.set(key, {
         data,
         timestamp: now,
         expiresAt: now + (ttlMs ?? this.defaultTtlMs),
       });
     }

     /** Remove a specific key from the cache. */
     invalidate(key: string): void {
       this.store.delete(key);
     }

     /** Remove all entries from the cache. */
     clear(): void {
       this.store.clear();
     }
   }
   ```

5. Run test: `pnpm --filter @harness-engineering/dashboard test -- tests/server/cache.test.ts`
6. Observe: all 6 tests pass.
7. Run: `harness validate`
8. Commit: `feat(dashboard): add DataCache with TTL expiry`

---

### Task 4: Create roadmap gatherer (TDD)

**Depends on:** Task 2
**Files:** `packages/dashboard/src/server/gather/roadmap.ts`, `packages/dashboard/tests/server/gather/roadmap.test.ts`

1. Create test file `packages/dashboard/tests/server/gather/roadmap.test.ts`:

   ```typescript
   import { describe, it, expect, vi, beforeEach } from 'vitest';
   import { gatherRoadmap } from '../../../src/server/gather/roadmap';
   import * as fs from 'node:fs/promises';

   vi.mock('node:fs/promises');

   const VALID_ROADMAP = `---
   project: test-project
   version: 1
   lastSynced: "2026-01-01T00:00:00Z"
   lastManualEdit: "2026-01-01T00:00:00Z"
   ---
   
   # Project Roadmap
   
   ## Milestone: MVP
   
   ### Feature: Auth
   - **Status:** done
   - **Summary:** Authentication system
   - **Spec:** docs/auth.md
   
   ### Feature: Dashboard
   - **Status:** in-progress
   - **Summary:** Project dashboard
   - **Spec:** docs/dashboard.md
   
   ### Feature: API
   - **Status:** planned
   - **Summary:** REST API
   - **Spec:** docs/api.md
   
   ## Milestone: V2
   
   ### Feature: SSO
   - **Status:** blocked
   - **Summary:** Single sign-on
   - **Blocked by:** Auth
   - **Spec:** docs/sso.md
   
   ### Feature: Reports
   - **Status:** backlog
   - **Summary:** Reporting system
   `;

   describe('gatherRoadmap', () => {
     beforeEach(() => {
       vi.resetAllMocks();
     });

     it('returns structured roadmap data for valid file', async () => {
       vi.mocked(fs.readFile).mockResolvedValue(VALID_ROADMAP);
       const result = await gatherRoadmap('/project/docs/roadmap.md');

       expect('error' in result).toBe(false);
       if ('error' in result) return;

       expect(result.totalFeatures).toBe(5);
       expect(result.totalDone).toBe(1);
       expect(result.totalInProgress).toBe(1);
       expect(result.totalPlanned).toBe(1);
       expect(result.totalBlocked).toBe(1);
       expect(result.totalBacklog).toBe(1);
       expect(result.milestones).toHaveLength(2);
       expect(result.milestones[0]!.name).toBe('MVP');
       expect(result.milestones[0]!.total).toBe(3);
       expect(result.milestones[0]!.done).toBe(1);
     });

     it('returns error for nonexistent file', async () => {
       vi.mocked(fs.readFile).mockRejectedValue(
         Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
       );
       const result = await gatherRoadmap('/project/docs/roadmap.md');

       expect('error' in result).toBe(true);
       if (!('error' in result)) return;
       expect(result.error).toContain('ENOENT');
     });

     it('returns error for malformed roadmap', async () => {
       vi.mocked(fs.readFile).mockResolvedValue('not a valid roadmap');
       const result = await gatherRoadmap('/project/docs/roadmap.md');

       expect('error' in result).toBe(true);
     });

     it('returns all features from all milestones', async () => {
       vi.mocked(fs.readFile).mockResolvedValue(VALID_ROADMAP);
       const result = await gatherRoadmap('/project/docs/roadmap.md');

       if ('error' in result) return;
       expect(result.features).toHaveLength(5);
     });
   });
   ```

2. Run test: `pnpm --filter @harness-engineering/dashboard test -- tests/server/gather/roadmap.test.ts`
3. Observe failure: module not found.
4. Create implementation `packages/dashboard/src/server/gather/roadmap.ts`:

   ```typescript
   import { readFile } from 'node:fs/promises';
   import { parseRoadmap } from '@harness-engineering/core';
   import type { FeatureStatus } from '@harness-engineering/core';
   import type { RoadmapResult, MilestoneProgress } from '../../shared/types';

   /**
    * Read and parse the roadmap file, computing per-milestone progress.
    * Returns an error object instead of throwing on failure.
    */
   export async function gatherRoadmap(roadmapPath: string): Promise<RoadmapResult> {
     try {
       const content = await readFile(roadmapPath, 'utf-8');
       const result = parseRoadmap(content);

       if (!result.ok) {
         return { error: result.error.message };
       }

       const roadmap = result.value;
       const allFeatures = roadmap.milestones.flatMap((m) => m.features);

       const milestones: MilestoneProgress[] = roadmap.milestones.map((m) => {
         const counts = countByStatus(m.features.map((f) => f.status));
         return {
           name: m.name,
           isBacklog: m.isBacklog,
           total: m.features.length,
           ...counts,
         };
       });

       const totals = countByStatus(allFeatures.map((f) => f.status));

       return {
         milestones,
         features: allFeatures,
         totalFeatures: allFeatures.length,
         totalDone: totals.done,
         totalInProgress: totals.inProgress,
         totalPlanned: totals.planned,
         totalBlocked: totals.blocked,
         totalBacklog: totals.backlog,
       };
     } catch (err) {
       const message = err instanceof Error ? err.message : String(err);
       return { error: message };
     }
   }

   function countByStatus(statuses: FeatureStatus[]): {
     done: number;
     inProgress: number;
     planned: number;
     blocked: number;
     backlog: number;
   } {
     let done = 0;
     let inProgress = 0;
     let planned = 0;
     let blocked = 0;
     let backlog = 0;

     for (const s of statuses) {
       switch (s) {
         case 'done':
           done++;
           break;
         case 'in-progress':
           inProgress++;
           break;
         case 'planned':
           planned++;
           break;
         case 'blocked':
           blocked++;
           break;
         case 'backlog':
           backlog++;
           break;
       }
     }

     return { done, inProgress, planned, blocked, backlog };
   }
   ```

5. Run test: `pnpm --filter @harness-engineering/dashboard test -- tests/server/gather/roadmap.test.ts`
6. Observe: all 4 tests pass.
7. Run: `harness validate`
8. Commit: `feat(dashboard): add roadmap gatherer with per-milestone progress`

---

### Task 5: Create health gatherer (TDD)

**Depends on:** Task 2
**Files:** `packages/dashboard/src/server/gather/health.ts`, `packages/dashboard/tests/server/gather/health.test.ts`

1. Create test file `packages/dashboard/tests/server/gather/health.test.ts`:

   ```typescript
   import { describe, it, expect, vi, beforeEach } from 'vitest';
   import { gatherHealth } from '../../../src/server/gather/health';

   // Mock the entire core module to avoid file system operations
   vi.mock('@harness-engineering/core', async () => {
     const actual = await vi.importActual<typeof import('@harness-engineering/core')>(
       '@harness-engineering/core'
     );
     return {
       ...actual,
       EntropyAnalyzer: vi.fn(),
     };
   });

   import { EntropyAnalyzer } from '@harness-engineering/core';

   describe('gatherHealth', () => {
     beforeEach(() => {
       vi.resetAllMocks();
     });

     it('returns health data when analysis succeeds', async () => {
       const mockReport = {
         summary: {
           totalIssues: 5,
           errors: 2,
           warnings: 3,
           fixableCount: 1,
           suggestionCount: 4,
         },
         analysisErrors: [],
         duration: 123,
       };

       vi.mocked(EntropyAnalyzer).mockImplementation(
         () =>
           ({
             analyze: vi.fn().mockResolvedValue({ ok: true, value: mockReport }),
           }) as unknown as InstanceType<typeof EntropyAnalyzer>
       );

       const result = await gatherHealth('/project');

       expect('error' in result).toBe(false);
       if ('error' in result) return;

       expect(result.totalIssues).toBe(5);
       expect(result.errors).toBe(2);
       expect(result.warnings).toBe(3);
       expect(result.fixableCount).toBe(1);
       expect(result.suggestionCount).toBe(4);
       expect(result.durationMs).toBe(123);
     });

     it('returns error when analysis fails', async () => {
       vi.mocked(EntropyAnalyzer).mockImplementation(
         () =>
           ({
             analyze: vi
               .fn()
               .mockResolvedValue({ ok: false, error: { message: 'Config invalid' } }),
           }) as unknown as InstanceType<typeof EntropyAnalyzer>
       );

       const result = await gatherHealth('/project');

       expect('error' in result).toBe(true);
       if (!('error' in result)) return;
       expect(result.error).toContain('Config invalid');
     });

     it('returns error when analyzer throws', async () => {
       vi.mocked(EntropyAnalyzer).mockImplementation(
         () =>
           ({
             analyze: vi.fn().mockRejectedValue(new Error('Unexpected crash')),
           }) as unknown as InstanceType<typeof EntropyAnalyzer>
       );

       const result = await gatherHealth('/project');

       expect('error' in result).toBe(true);
       if (!('error' in result)) return;
       expect(result.error).toContain('Unexpected crash');
     });

     it('includes analysis error names in result', async () => {
       const mockReport = {
         summary: {
           totalIssues: 0,
           errors: 0,
           warnings: 0,
           fixableCount: 0,
           suggestionCount: 0,
         },
         analysisErrors: [{ analyzer: 'drift', error: { message: 'drift failed' } }],
         duration: 50,
       };

       vi.mocked(EntropyAnalyzer).mockImplementation(
         () =>
           ({
             analyze: vi.fn().mockResolvedValue({ ok: true, value: mockReport }),
           }) as unknown as InstanceType<typeof EntropyAnalyzer>
       );

       const result = await gatherHealth('/project');

       if ('error' in result) return;
       expect(result.analysisErrors).toEqual(['drift']);
     });
   });
   ```

2. Run test: `pnpm --filter @harness-engineering/dashboard test -- tests/server/gather/health.test.ts`
3. Observe failure: module not found.
4. Create implementation `packages/dashboard/src/server/gather/health.ts`:

   ```typescript
   import { EntropyAnalyzer } from '@harness-engineering/core';
   import type { EntropyConfig } from '@harness-engineering/core';
   import type { HealthResult } from '../../shared/types';

   /**
    * Run entropy analysis on the project and return a health summary.
    * Returns an error object instead of throwing on failure.
    */
   export async function gatherHealth(projectPath: string): Promise<HealthResult> {
     try {
       const config: EntropyConfig = {
         rootDir: projectPath,
         include: ['src/**/*.ts', 'src/**/*.tsx'],
         exclude: ['node_modules/**', 'dist/**', '**/*.test.ts', '**/*.spec.ts'],
       };

       const analyzer = new EntropyAnalyzer(config);
       const result = await analyzer.analyze();

       if (!result.ok) {
         return { error: result.error.message };
       }

       const report = result.value;
       return {
         totalIssues: report.summary.totalIssues,
         errors: report.summary.errors,
         warnings: report.summary.warnings,
         fixableCount: report.summary.fixableCount,
         suggestionCount: report.summary.suggestionCount,
         durationMs: report.duration,
         analysisErrors: report.analysisErrors.map((e) => e.analyzer),
       };
     } catch (err) {
       const message = err instanceof Error ? err.message : String(err);
       return { error: message };
     }
   }
   ```

5. Run test: `pnpm --filter @harness-engineering/dashboard test -- tests/server/gather/health.test.ts`
6. Observe: all 4 tests pass.
7. Run: `harness validate`
8. Commit: `feat(dashboard): add health gatherer wrapping EntropyAnalyzer`

---

### Task 6: Create graph gatherer (TDD)

**Depends on:** Task 2
**Files:** `packages/dashboard/src/server/gather/graph.ts`, `packages/dashboard/tests/server/gather/graph.test.ts`

1. Create test file `packages/dashboard/tests/server/gather/graph.test.ts`:

   ```typescript
   import { describe, it, expect, vi, beforeEach } from 'vitest';
   import { gatherGraph } from '../../../src/server/gather/graph';

   vi.mock('@harness-engineering/graph', async () => {
     const actual = await vi.importActual<typeof import('@harness-engineering/graph')>(
       '@harness-engineering/graph'
     );
     return {
       ...actual,
       GraphStore: vi.fn(),
     };
   });

   import { GraphStore } from '@harness-engineering/graph';

   describe('gatherGraph', () => {
     beforeEach(() => {
       vi.resetAllMocks();
     });

     it('returns graph data when store loads successfully', async () => {
       const mockNodes = [
         { id: '1', type: 'file', name: 'a.ts', path: 'src/a.ts' },
         { id: '2', type: 'file', name: 'b.ts', path: 'src/b.ts' },
         { id: '3', type: 'function', name: 'foo', path: 'src/a.ts' },
       ];

       vi.mocked(GraphStore).mockImplementation(
         () =>
           ({
             load: vi.fn().mockResolvedValue(true),
             get nodeCount() {
               return 3;
             },
             get edgeCount() {
               return 5;
             },
             findNodes: vi.fn().mockImplementation((query: { type?: string }) => {
               if (!query.type) return mockNodes;
               return mockNodes.filter((n) => n.type === query.type);
             }),
           }) as unknown as InstanceType<typeof GraphStore>
       );

       const result = await gatherGraph('/project');

       expect(result.available).toBe(true);
       if (!result.available) return;

       expect(result.nodeCount).toBe(3);
       expect(result.edgeCount).toBe(5);
       expect(result.nodesByType).toContainEqual({ type: 'file', count: 2 });
       expect(result.nodesByType).toContainEqual({ type: 'function', count: 1 });
     });

     it('returns unavailable when store fails to load', async () => {
       vi.mocked(GraphStore).mockImplementation(
         () =>
           ({
             load: vi.fn().mockResolvedValue(false),
           }) as unknown as InstanceType<typeof GraphStore>
       );

       const result = await gatherGraph('/project');

       expect(result.available).toBe(false);
       if (result.available) return;
       expect(result.reason).toBeTruthy();
     });

     it('returns unavailable when store throws', async () => {
       vi.mocked(GraphStore).mockImplementation(
         () =>
           ({
             load: vi.fn().mockRejectedValue(new Error('disk error')),
           }) as unknown as InstanceType<typeof GraphStore>
       );

       const result = await gatherGraph('/project');

       expect(result.available).toBe(false);
       if (result.available) return;
       expect(result.reason).toContain('disk error');
     });
   });
   ```

2. Run test: `pnpm --filter @harness-engineering/dashboard test -- tests/server/gather/graph.test.ts`
3. Observe failure: module not found.
4. Create implementation `packages/dashboard/src/server/gather/graph.ts`:

   ```typescript
   import { join } from 'node:path';
   import { GraphStore, NODE_TYPES } from '@harness-engineering/graph';
   import type { GraphResult, NodeTypeCount } from '../../shared/types';

   const GRAPH_DIR = '.harness/graph';

   /**
    * Load the knowledge graph and return node/edge metrics.
    * Returns { available: false } with a reason when the graph cannot be loaded.
    */
   export async function gatherGraph(projectPath: string): Promise<GraphResult> {
     try {
       const store = new GraphStore();
       const loaded = await store.load(join(projectPath, GRAPH_DIR));

       if (!loaded) {
         return {
           available: false,
           reason: 'Graph data not found. Run "harness graph scan" to build the knowledge graph.',
         };
       }

       // Count nodes by type
       const nodesByType: NodeTypeCount[] = [];
       for (const type of NODE_TYPES) {
         const nodes = store.findNodes({ type });
         if (nodes.length > 0) {
           nodesByType.push({ type, count: nodes.length });
         }
       }

       return {
         available: true,
         nodeCount: store.nodeCount,
         edgeCount: store.edgeCount,
         nodesByType,
       };
     } catch (err) {
       const message = err instanceof Error ? err.message : String(err);
       return {
         available: false,
         reason: `Failed to load graph: ${message}`,
       };
     }
   }
   ```

5. Run test: `pnpm --filter @harness-engineering/dashboard test -- tests/server/gather/graph.test.ts`
6. Observe: all 3 tests pass.
7. Run: `harness validate`
8. Commit: `feat(dashboard): add graph gatherer with graceful degradation`

---

### Task 7: Create barrel export and run full test suite

**Depends on:** Tasks 3, 4, 5, 6
**Files:** `packages/dashboard/src/server/gather/index.ts`

1. Create barrel export `packages/dashboard/src/server/gather/index.ts`:

   ```typescript
   export { gatherRoadmap } from './roadmap';
   export { gatherHealth } from './health';
   export { gatherGraph } from './graph';
   ```

2. Run: `pnpm --filter @harness-engineering/dashboard typecheck`
3. Observe: no type errors.
4. Run full test suite: `pnpm --filter @harness-engineering/dashboard test`
5. Observe: all tests pass (health-check + cache + 3 gatherers = 5 test files).
6. Run: `harness validate`
7. Commit: `feat(dashboard): add gather barrel export, phase 2 complete`

---

## Verification Matrix

| Observable Truth                                    | Delivered by                                                       |
| --------------------------------------------------- | ------------------------------------------------------------------ |
| 1. package.json has core + graph deps               | Task 1                                                             |
| 2. shared/types.ts exports all response types       | Task 2                                                             |
| 3. Cache returns stored data before TTL             | Task 3                                                             |
| 4. Cache returns null after TTL                     | Task 3                                                             |
| 5. Roadmap gatherer returns structured data         | Task 4                                                             |
| 6. Roadmap gatherer returns error for missing file  | Task 4                                                             |
| 7. Health gatherer returns summary metrics          | Task 5                                                             |
| 8. Health gatherer returns error on failure         | Task 5                                                             |
| 9. Graph gatherer returns metrics when available    | Task 6                                                             |
| 10. Graph gatherer returns unavailable when missing | Task 6                                                             |
| 11. All tests pass                                  | Task 7                                                             |
| 12. server/shared boundary respected                | Task 2 (types in shared), Tasks 4-6 (gatherers import from shared) |
