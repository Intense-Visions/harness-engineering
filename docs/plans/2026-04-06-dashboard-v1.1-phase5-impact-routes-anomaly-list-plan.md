# Plan: Dashboard v1.1 Phase 5 -- Impact Routes + Anomaly List

**Date:** 2026-04-06
**Spec:** docs/changes/harness-dashboard-v1.1/proposal.md
**Estimated tasks:** 7
**Estimated time:** ~30 minutes

## Goal

Add the Impact page to the dashboard: two API routes (GET anomalies, POST blast-radius), a two-panel Impact.tsx page with anomaly list, search box, depth selector, and a placeholder right panel for Phase 6 visualization.

## Observable Truths (Acceptance Criteria)

1. When a GET request is made to `/api/impact/anomalies` and anomaly data is cached in GatherCache, the system shall return 200 with `{ data: AnomalyData, timestamp: string }`.
2. When a GET request is made to `/api/impact/anomalies` and anomaly data is NOT cached, the system shall return 200 with `{ data: { outliers: [], articulationPoints: [], overlapCount: 0 }, timestamp: string }`.
3. When a POST request is made to `/api/impact/blast-radius` with `{ nodeId: "x", maxDepth: 2 }`, the system shall call `gatherBlastRadius(projectPath, "x", 2)` and return the result wrapped in `{ data: BlastRadiusResult, timestamp: string }`.
4. When a POST request is made to `/api/impact/blast-radius` without a `nodeId`, the system shall return 400 with `{ error: "nodeId is required", timestamp: string }`.
5. The Impact page shall be accessible at `/impact` in the browser and appear as "Impact" in the navigation bar after "CI".
6. When the Impact page loads, the system shall fetch `/api/impact/anomalies` and display articulation points sorted by `dependentCount` (descending) and outliers sorted by `zScore` (descending) in the left panel.
7. When a user clicks an anomaly row, the system shall POST to `/api/impact/blast-radius` with the clicked node's `nodeId` and the current depth selector value, and display the result in the right panel.
8. When a user types a node name in the search box and submits, the system shall POST to `/api/impact/blast-radius` with the search text as `nodeId` and the current depth value.
9. The depth selector shall offer values 1-5 with default 3.
10. While no node is selected, the right panel shall display "Select a node or search to view blast radius".
11. `npx vitest run tests/server/routes/impact.test.ts` passes.
12. `harness validate` passes.

## File Map

```
CREATE packages/dashboard/src/server/routes/impact.ts
CREATE packages/dashboard/tests/server/routes/impact.test.ts
CREATE packages/dashboard/src/client/pages/Impact.tsx
MODIFY packages/dashboard/src/server/index.ts (register impact router)
MODIFY packages/dashboard/src/client/App.tsx (add Impact route)
MODIFY packages/dashboard/src/client/components/Layout.tsx (add Impact nav item)
MODIFY packages/dashboard/src/client/utils/typeGuards.ts (add isAnomalyData guard)
```

_Skeleton not produced -- task count (7) below threshold (8)._

## Tasks

### Task 1: Add isAnomalyData type guard

**Depends on:** none
**Files:** `packages/dashboard/src/client/utils/typeGuards.ts`

1. Open `packages/dashboard/src/client/utils/typeGuards.ts`
2. Add import for `AnomalyData` and `BlastRadiusData`:
   ```typescript
   import type {
     RoadmapData,
     HealthData,
     GraphData,
     SecurityData,
     PerfData,
     ArchData,
     AnomalyData,
     BlastRadiusData,
   } from '@shared/types';
   ```
3. Add two new type guard functions at the end of the file:

   ```typescript
   export function isAnomalyData(a: unknown): a is AnomalyData {
     return typeof a === 'object' && a !== null && 'outliers' in a && 'articulationPoints' in a;
   }

   export function isBlastRadiusData(b: unknown): b is BlastRadiusData {
     return typeof b === 'object' && b !== null && 'sourceNodeId' in b && 'layers' in b;
   }
   ```

4. Run: `harness validate`
5. Commit: `feat(dashboard): add isAnomalyData and isBlastRadiusData type guards`

---

### Task 2: Create impact route (GET anomalies + POST blast-radius)

**Depends on:** none
**Files:** `packages/dashboard/src/server/routes/impact.ts`

1. Create `packages/dashboard/src/server/routes/impact.ts`:

   ```typescript
   import { Hono } from 'hono';
   import type { ServerContext } from '../context';
   import { gatherBlastRadius } from '../gather/blast-radius';
   import type {
     ApiResponse,
     ApiErrorResponse,
     AnomalyResult,
     AnomalyData,
     BlastRadiusResult,
   } from '../../shared/types';

   const EMPTY_ANOMALIES: AnomalyData = {
     outliers: [],
     articulationPoints: [],
     overlapCount: 0,
   };

   function isAnomalyData(r: AnomalyResult): r is AnomalyData {
     return 'outliers' in r;
   }

   export function buildImpactRouter(ctx: ServerContext): Hono {
     const router = new Hono();

     router.get('/impact/anomalies', (c) => {
       const cached = ctx.gatherCache.get<AnomalyResult>('anomalies');
       const data: AnomalyData = cached && isAnomalyData(cached) ? cached : EMPTY_ANOMALIES;

       const response: ApiResponse<AnomalyData> = {
         data,
         timestamp: new Date().toISOString(),
       };
       return c.json(response);
     });

     router.post('/impact/blast-radius', async (c) => {
       let body: { nodeId?: string; maxDepth?: number };
       try {
         body = await c.req.json();
       } catch {
         const err: ApiErrorResponse = {
           error: 'Invalid JSON body',
           timestamp: new Date().toISOString(),
         };
         return c.json(err, 400);
       }

       if (!body.nodeId || typeof body.nodeId !== 'string') {
         const err: ApiErrorResponse = {
           error: 'nodeId is required',
           timestamp: new Date().toISOString(),
         };
         return c.json(err, 400);
       }

       const maxDepth =
         typeof body.maxDepth === 'number' && body.maxDepth >= 1 && body.maxDepth <= 5
           ? body.maxDepth
           : undefined;

       const data: BlastRadiusResult = await gatherBlastRadius(
         ctx.projectPath,
         body.nodeId,
         maxDepth
       );

       const response: ApiResponse<BlastRadiusResult> = {
         data,
         timestamp: new Date().toISOString(),
       };
       return c.json(response);
     });

     return router;
   }
   ```

2. Run: `harness validate`
3. Commit: `feat(dashboard): add impact routes for anomalies and blast radius`

---

### Task 3: Write impact route tests

**Depends on:** Task 2
**Files:** `packages/dashboard/tests/server/routes/impact.test.ts`

1. Create `packages/dashboard/tests/server/routes/impact.test.ts`:

   ```typescript
   import { describe, it, expect, beforeEach, vi } from 'vitest';
   import { Hono } from 'hono';
   import type { ServerContext } from '../../../src/server/context';
   import { DataCache } from '../../../src/server/cache';
   import { GatherCache } from '../../../src/server/gather-cache';
   import type { AnomalyData } from '../../../src/shared/types';

   // Mock blast-radius gatherer
   vi.mock('../../../src/server/gather/blast-radius', () => ({
     gatherBlastRadius: vi.fn().mockResolvedValue({
       sourceNodeId: 'node-1',
       sourceName: 'index.ts',
       layers: [
         {
           depth: 1,
           nodes: [
             {
               nodeId: 'node-2',
               name: 'utils.ts',
               type: 'file',
               probability: 0.8,
               parentId: 'node-1',
             },
           ],
         },
       ],
       summary: {
         totalAffected: 1,
         maxDepth: 1,
         highRisk: 0,
         mediumRisk: 1,
         lowRisk: 0,
       },
     }),
   }));

   function makeCtx(): ServerContext {
     return {
       projectPath: '/fake',
       roadmapPath: '/fake/docs/roadmap.md',
       chartsPath: '/fake/docs/roadmap-charts.md',
       cache: new DataCache(60_000),
       pollIntervalMs: 30_000,
       sseManager: undefined!,
       gatherCache: new GatherCache(),
     };
   }

   describe('GET /api/impact/anomalies', () => {
     let app: Hono;
     let ctx: ServerContext;

     beforeEach(async () => {
       ctx = makeCtx();
       const { buildImpactRouter } = await import('../../../src/server/routes/impact');
       app = new Hono();
       app.route('/api', buildImpactRouter(ctx));
     });

     it('returns empty anomalies when cache has no data', async () => {
       const res = await app.request('/api/impact/anomalies');
       expect(res.status).toBe(200);
       const body = (await res.json()) as {
         data: { outliers: unknown[]; articulationPoints: unknown[]; overlapCount: number };
         timestamp: string;
       };
       expect(body.data.outliers).toEqual([]);
       expect(body.data.articulationPoints).toEqual([]);
       expect(body.data.overlapCount).toBe(0);
       expect(body.timestamp).toBeTypeOf('string');
     });

     it('returns cached anomaly data when available', async () => {
       const anomalyData: AnomalyData = {
         outliers: [
           {
             nodeId: 'n1',
             name: 'big.ts',
             type: 'file',
             metric: 'inDegree',
             value: 42,
             zScore: 3.5,
           },
         ],
         articulationPoints: [
           { nodeId: 'n2', name: 'core.ts', componentsIfRemoved: 3, dependentCount: 15 },
         ],
         overlapCount: 1,
       };
       await ctx.gatherCache.run('anomalies', async () => anomalyData);

       const res = await app.request('/api/impact/anomalies');
       expect(res.status).toBe(200);
       const body = (await res.json()) as { data: AnomalyData };
       expect(body.data.outliers).toHaveLength(1);
       expect(body.data.outliers[0].nodeId).toBe('n1');
       expect(body.data.articulationPoints).toHaveLength(1);
       expect(body.data.articulationPoints[0].dependentCount).toBe(15);
     });

     it('returns empty data when cache has unavailable result', async () => {
       await ctx.gatherCache.run('anomalies', async () => ({
         available: false,
         reason: 'Graph not found',
       }));

       const res = await app.request('/api/impact/anomalies');
       expect(res.status).toBe(200);
       const body = (await res.json()) as { data: AnomalyData };
       expect(body.data.outliers).toEqual([]);
     });
   });

   describe('POST /api/impact/blast-radius', () => {
     let app: Hono;
     let ctx: ServerContext;

     beforeEach(async () => {
       ctx = makeCtx();
       const { buildImpactRouter } = await import('../../../src/server/routes/impact');
       app = new Hono();
       app.route('/api', buildImpactRouter(ctx));
     });

     it('returns 400 when nodeId is missing', async () => {
       const res = await app.request('/api/impact/blast-radius', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({}),
       });
       expect(res.status).toBe(400);
       const body = (await res.json()) as { error: string };
       expect(body.error).toBe('nodeId is required');
     });

     it('returns 400 for invalid JSON', async () => {
       const res = await app.request('/api/impact/blast-radius', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: 'not-json',
       });
       expect(res.status).toBe(400);
       const body = (await res.json()) as { error: string };
       expect(body.error).toBe('Invalid JSON body');
     });

     it('returns blast radius data for valid nodeId', async () => {
       const res = await app.request('/api/impact/blast-radius', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ nodeId: 'node-1', maxDepth: 2 }),
       });
       expect(res.status).toBe(200);
       const body = (await res.json()) as {
         data: { sourceNodeId: string; layers: unknown[]; summary: { totalAffected: number } };
       };
       expect(body.data.sourceNodeId).toBe('node-1');
       expect(body.data.layers).toHaveLength(1);
       expect(body.data.summary.totalAffected).toBe(1);
     });

     it('calls gatherBlastRadius with correct arguments', async () => {
       const { gatherBlastRadius } = await import('../../../src/server/gather/blast-radius');

       await app.request('/api/impact/blast-radius', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ nodeId: 'test-node', maxDepth: 4 }),
       });

       expect(gatherBlastRadius).toHaveBeenCalledWith('/fake', 'test-node', 4);
     });
   });
   ```

2. Run: `npx vitest run tests/server/routes/impact.test.ts`
3. Observe: all 7 tests pass
4. Run: `harness validate`
5. Commit: `test(dashboard): add impact route tests`

---

### Task 4: Register impact router in server index

**Depends on:** Task 2
**Files:** `packages/dashboard/src/server/index.ts`

1. Open `packages/dashboard/src/server/index.ts`
2. Add import after the `buildCIRouter` import:
   ```typescript
   import { buildImpactRouter } from './routes/impact';
   ```
3. Add route registration after `app.route('/api', buildCIRouter(ctx));`:
   ```typescript
   app.route('/api', buildImpactRouter(ctx));
   ```
4. Run: `harness validate`
5. Commit: `feat(dashboard): register impact router`

---

### Task 5: Create Impact.tsx page

**Depends on:** Task 1
**Files:** `packages/dashboard/src/client/pages/Impact.tsx`

1. Create `packages/dashboard/src/client/pages/Impact.tsx`:

   ```typescript
   import { useState, useEffect, useCallback } from 'react';
   import { useApi } from '../hooks/useApi';
   import type {
     AnomalyData,
     AnomalyArticulationPoint,
     AnomalyOutlier,
     BlastRadiusResult,
   } from '@shared/types';
   import { isBlastRadiusData } from '../utils/typeGuards';

   const DEPTH_OPTIONS = [1, 2, 3, 4, 5] as const;
   const DEFAULT_DEPTH = 3;

   export function Impact() {
     const [anomalies, setAnomalies] = useState<AnomalyData | null>(null);
     const [loading, setLoading] = useState(true);
     const [fetchError, setFetchError] = useState<string | null>(null);
     const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
     const [searchText, setSearchText] = useState('');
     const [depth, setDepth] = useState(DEFAULT_DEPTH);

     const blastRadius = useApi<{ data: BlastRadiusResult }>('/api/impact/blast-radius');

     // Fetch anomalies on mount
     const fetchAnomalies = useCallback(async () => {
       try {
         const res = await fetch('/api/impact/anomalies');
         if (!res.ok) {
           setFetchError(`HTTP ${res.status}`);
           return;
         }
         const body = (await res.json()) as { data: AnomalyData };
         setAnomalies(body.data);
         setFetchError(null);
       } catch (e) {
         setFetchError(e instanceof Error ? e.message : 'Network error');
       } finally {
         setLoading(false);
       }
     }, []);

     useEffect(() => {
       void fetchAnomalies();
     }, [fetchAnomalies]);

     const queryBlastRadius = useCallback(
       (nodeId: string) => {
         setSelectedNodeId(nodeId);
         void blastRadius.run({ nodeId, maxDepth: depth });
       },
       [blastRadius, depth]
     );

     const handleSearch = useCallback(
       (e: React.FormEvent) => {
         e.preventDefault();
         const trimmed = searchText.trim();
         if (trimmed) {
           queryBlastRadius(trimmed);
         }
       },
       [searchText, queryBlastRadius]
     );

     const handleAnomalyClick = useCallback(
       (nodeId: string) => {
         setSearchText('');
         queryBlastRadius(nodeId);
       },
       [queryBlastRadius]
     );

     // Sort anomalies for display
     const sortedAPs = anomalies
       ? [...anomalies.articulationPoints].sort(
           (a, b) => b.dependentCount - a.dependentCount
         )
       : [];
     const sortedOutliers = anomalies
       ? [...anomalies.outliers].sort((a, b) => b.zScore - a.zScore)
       : [];

     const brData = blastRadius.data?.data;
     const brIsData = brData && isBlastRadiusData(brData);

     return (
       <div>
         <h1 className="mb-6 text-2xl font-bold">Impact Explorer</h1>

         {/* Top bar: search + depth */}
         <div className="mb-6 flex items-center gap-4">
           <form onSubmit={handleSearch} className="flex flex-1 gap-2">
             <input
               type="text"
               value={searchText}
               onChange={(e) => setSearchText(e.target.value)}
               placeholder="Search node by name or path..."
               className="flex-1 rounded border border-gray-700 bg-gray-900 px-3 py-1.5 text-sm text-gray-200 placeholder-gray-500 focus:border-gray-500 focus:outline-none"
             />
             <button
               type="submit"
               className="rounded bg-gray-800 px-3 py-1.5 text-xs font-medium text-gray-200 hover:bg-gray-700"
             >
               Search
             </button>
           </form>
           <label className="flex items-center gap-2 text-sm text-gray-400">
             Depth
             <select
               value={depth}
               onChange={(e) => setDepth(Number(e.target.value))}
               className="rounded border border-gray-700 bg-gray-900 px-2 py-1.5 text-sm text-gray-200"
             >
               {DEPTH_OPTIONS.map((d) => (
                 <option key={d} value={d}>
                   {d}
                 </option>
               ))}
             </select>
           </label>
         </div>

         <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
           {/* Left panel: anomaly list */}
           <div className="lg:col-span-1">
             {loading && !anomalies && (
               <p className="text-sm text-gray-500">Loading anomalies...</p>
             )}
             {fetchError && <p className="text-sm text-red-400">{fetchError}</p>}

             {anomalies &&
               sortedAPs.length === 0 &&
               sortedOutliers.length === 0 && (
                 <div className="rounded-lg border border-gray-800 bg-gray-900 p-6">
                   <p className="text-base font-medium text-gray-300">
                     No anomalies detected
                   </p>
                   <p className="mt-2 text-sm text-gray-500">
                     Run &quot;harness graph scan&quot; to build the knowledge graph, then
                     restart the dashboard.
                   </p>
                 </div>
               )}

             {/* Articulation points */}
             {sortedAPs.length > 0 && (
               <section className="mb-6">
                 <h2 className="mb-2 text-xs font-semibold uppercase tracking-widest text-gray-500">
                   Articulation Points
                 </h2>
                 <div className="space-y-1">
                   {sortedAPs.map((ap: AnomalyArticulationPoint) => (
                     <button
                       key={ap.nodeId}
                       onClick={() => handleAnomalyClick(ap.nodeId)}
                       className={[
                         'w-full rounded border px-3 py-2 text-left text-sm transition-colors',
                         selectedNodeId === ap.nodeId
                           ? 'border-blue-700 bg-blue-950'
                           : 'border-gray-800 bg-gray-900 hover:bg-gray-800',
                       ].join(' ')}
                     >
                       <div className="flex items-center justify-between">
                         <span className="truncate font-medium text-gray-200">
                           {ap.name}
                         </span>
                         <span className="ml-2 text-xs tabular-nums text-gray-500">
                           {ap.dependentCount} deps
                         </span>
                       </div>
                       <p className="mt-0.5 text-xs text-gray-500">
                         {ap.componentsIfRemoved} components if removed
                       </p>
                     </button>
                   ))}
                 </div>
               </section>
             )}

             {/* Outliers */}
             {sortedOutliers.length > 0 && (
               <section>
                 <h2 className="mb-2 text-xs font-semibold uppercase tracking-widest text-gray-500">
                   Statistical Outliers
                 </h2>
                 <div className="space-y-1">
                   {sortedOutliers.map((o: AnomalyOutlier) => (
                     <button
                       key={o.nodeId}
                       onClick={() => handleAnomalyClick(o.nodeId)}
                       className={[
                         'w-full rounded border px-3 py-2 text-left text-sm transition-colors',
                         selectedNodeId === o.nodeId
                           ? 'border-blue-700 bg-blue-950'
                           : 'border-gray-800 bg-gray-900 hover:bg-gray-800',
                       ].join(' ')}
                     >
                       <div className="flex items-center justify-between">
                         <span className="truncate font-medium text-gray-200">
                           {o.name}
                         </span>
                         <span className="ml-2 text-xs tabular-nums text-gray-500">
                           z={o.zScore.toFixed(1)}
                         </span>
                       </div>
                       <p className="mt-0.5 text-xs text-gray-500">
                         {o.metric}: {o.value} ({o.type})
                       </p>
                     </button>
                   ))}
                 </div>
               </section>
             )}
           </div>

           {/* Right panel: blast radius placeholder */}
           <div className="lg:col-span-2">
             {!selectedNodeId && blastRadius.state === 'idle' && (
               <div className="flex h-64 items-center justify-center rounded-lg border border-gray-800 bg-gray-900">
                 <p className="text-sm text-gray-500">
                   Select a node or search to view blast radius
                 </p>
               </div>
             )}

             {blastRadius.state === 'loading' && (
               <div className="flex h-64 items-center justify-center rounded-lg border border-gray-800 bg-gray-900">
                 <p className="text-sm text-gray-500">Computing blast radius...</p>
               </div>
             )}

             {blastRadius.state === 'error' && blastRadius.error && (
               <div className="rounded-lg border border-red-800 bg-gray-900 p-6">
                 <p className="text-sm text-red-400">{blastRadius.error}</p>
               </div>
             )}

             {blastRadius.state === 'success' && brData && !brIsData && (
               <div className="rounded-lg border border-gray-800 bg-gray-900 p-6">
                 <p className="text-sm text-gray-400">
                   {'error' in brData
                     ? (brData as { error: string }).error
                     : 'No blast radius data'}
                 </p>
               </div>
             )}

             {blastRadius.state === 'success' && brIsData && (
               <div className="rounded-lg border border-gray-800 bg-gray-900 p-6">
                 <h3 className="mb-3 text-sm font-semibold text-gray-200">
                   Blast Radius: {brData.sourceName}
                 </h3>
                 <div className="mb-4 grid grid-cols-4 gap-3">
                   <div className="rounded bg-gray-950 p-3 text-center">
                     <p className="text-lg font-bold tabular-nums text-gray-200">
                       {brData.summary.totalAffected}
                     </p>
                     <p className="text-xs text-gray-500">Total Affected</p>
                   </div>
                   <div className="rounded bg-gray-950 p-3 text-center">
                     <p className="text-lg font-bold tabular-nums text-red-400">
                       {brData.summary.highRisk}
                     </p>
                     <p className="text-xs text-gray-500">High Risk</p>
                   </div>
                   <div className="rounded bg-gray-950 p-3 text-center">
                     <p className="text-lg font-bold tabular-nums text-yellow-400">
                       {brData.summary.mediumRisk}
                     </p>
                     <p className="text-xs text-gray-500">Medium Risk</p>
                   </div>
                   <div className="rounded bg-gray-950 p-3 text-center">
                     <p className="text-lg font-bold tabular-nums text-emerald-400">
                       {brData.summary.lowRisk}
                     </p>
                     <p className="text-xs text-gray-500">Low Risk</p>
                   </div>
                 </div>

                 {/* Placeholder: Phase 6 will replace this with SVG visualization */}
                 <div className="rounded border border-gray-700 bg-gray-950 p-4">
                   <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-gray-500">
                     Propagation Layers (depth: {brData.summary.maxDepth})
                   </p>
                   <pre className="max-h-80 overflow-auto text-xs text-gray-400">
                     {JSON.stringify(brData.layers, null, 2)}
                   </pre>
                 </div>
               </div>
             )}
           </div>
         </div>
       </div>
     );
   }
   ```

2. Run: `harness validate`
3. Commit: `feat(dashboard): add Impact page with anomaly list and blast radius query`

---

### Task 6: Add Impact route to App.tsx and nav to Layout.tsx

**Depends on:** Task 5
**Files:** `packages/dashboard/src/client/App.tsx`, `packages/dashboard/src/client/components/Layout.tsx`

1. Open `packages/dashboard/src/client/App.tsx`
2. Add import after the CI import:
   ```typescript
   import { Impact } from './pages/Impact';
   ```
3. Add route after the CI route:
   ```typescript
   <Route path="/impact" element={<Impact />} />
   ```
4. Open `packages/dashboard/src/client/components/Layout.tsx`
5. Add `{ to: '/impact', label: 'Impact' }` as the last entry in `NAV_ITEMS`:
   ```typescript
   const NAV_ITEMS = [
     { to: '/', label: 'Overview' },
     { to: '/roadmap', label: 'Roadmap' },
     { to: '/health', label: 'Health' },
     { to: '/graph', label: 'Graph' },
     { to: '/ci', label: 'CI' },
     { to: '/impact', label: 'Impact' },
   ] as const;
   ```
6. Run: `harness validate`
7. Commit: `feat(dashboard): add Impact to routing and navigation`

---

### Task 7: Run all tests and final validation

[checkpoint:human-verify]

**Depends on:** Tasks 1-6
**Files:** none (verification only)

1. Run: `npx vitest run tests/server/routes/impact.test.ts`
2. Observe: all 7 tests pass
3. Run: `npx vitest run` (full test suite)
4. Observe: no regressions
5. Run: `harness validate`
6. Observe: validation passes
7. Verify in browser: navigate to `/impact`, confirm:
   - "Impact" appears in nav bar after "CI"
   - Left panel shows anomaly list (or "No anomalies detected" if no graph)
   - Search box and depth selector are present
   - Right panel shows "Select a node or search to view blast radius"
   - Clicking an anomaly or searching shows blast radius data
