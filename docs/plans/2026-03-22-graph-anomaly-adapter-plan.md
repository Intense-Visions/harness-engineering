# Plan: GraphAnomalyAdapter (Phase 1)

**Date:** 2026-03-22
**Spec:** docs/changes/graph-anomaly-detection/proposal.md
**Estimated tasks:** 4
**Estimated time:** 16 minutes

## Goal

Implement `GraphAnomalyAdapter` in the graph package that performs Z-score statistical outlier detection across five curated metrics and Tarjan's articulation point detection on the import graph, producing a unified `AnomalyReport` with overlap cross-referencing.

## Observable Truths (Acceptance Criteria)

1. When a synthetic graph has function nodes with `cyclomaticComplexity` Z-scores exceeding 2.0, `detect()` returns those nodes in `statisticalOutliers` with correct `zScore`, `mean`, and `stdDev` values.
2. When all nodes have identical metric values (stdDev is 0), `detect()` skips that metric and returns no outliers for it, without error.
3. When the graph has fewer than 3 nodes of a given type, `detect()` returns empty results for that type without error.
4. When a node is a true articulation point on the `imports` graph (removal disconnects the graph), `detect()` returns it in `articulationPoints` with correct `componentsIfRemoved` and `dependentCount`.
5. When a node appears in both `statisticalOutliers` and `articulationPoints`, its ID appears in the `overlapping` array.
6. The system shall sort `statisticalOutliers` by `zScore` descending and `articulationPoints` by `dependentCount` descending.
7. When custom `threshold` and `metrics` parameters are provided, `detect()` uses those values instead of defaults.
8. When the `metrics` parameter contains an unrecognized metric name, `detect()` skips that metric and includes it in `summary.warnings`.
9. When the `threshold` parameter is zero or negative, `detect()` clamps it to 2.0.
10. When the graph store is empty, `detect()` returns an empty `AnomalyReport` with `totalNodesAnalyzed: 0`.
11. `npx vitest run packages/graph/tests/entropy/GraphAnomalyAdapter.test.ts` passes with all tests green.
12. `harness validate` passes after all tasks are complete.

## File Map

- CREATE `packages/graph/src/entropy/GraphAnomalyAdapter.ts`
- CREATE `packages/graph/tests/entropy/GraphAnomalyAdapter.test.ts`

## Tasks

### Task 1: Define interfaces and adapter skeleton with empty detect() method

**Depends on:** none
**Files:** `packages/graph/src/entropy/GraphAnomalyAdapter.ts`, `packages/graph/tests/entropy/GraphAnomalyAdapter.test.ts`

1. Create test file `packages/graph/tests/entropy/GraphAnomalyAdapter.test.ts`:

   ```typescript
   import { describe, it, expect } from 'vitest';
   import { GraphStore } from '../../src/store/GraphStore.js';
   import { GraphAnomalyAdapter } from '../../src/entropy/GraphAnomalyAdapter.js';

   describe('GraphAnomalyAdapter', () => {
     it('returns empty report for empty graph', () => {
       const store = new GraphStore();
       const adapter = new GraphAnomalyAdapter(store);
       const report = adapter.detect();

       expect(report.statisticalOutliers).toEqual([]);
       expect(report.articulationPoints).toEqual([]);
       expect(report.overlapping).toEqual([]);
       expect(report.summary.totalNodesAnalyzed).toBe(0);
       expect(report.summary.outlierCount).toBe(0);
       expect(report.summary.articulationPointCount).toBe(0);
       expect(report.summary.overlapCount).toBe(0);
       expect(report.summary.metricsAnalyzed).toEqual([
         'cyclomaticComplexity',
         'fanIn',
         'fanOut',
         'hotspotScore',
         'transitiveDepth',
       ]);
       expect(report.summary.warnings).toEqual([]);
       expect(report.summary.threshold).toBe(2.0);
     });

     it('clamps zero threshold to 2.0', () => {
       const store = new GraphStore();
       const adapter = new GraphAnomalyAdapter(store);
       const report = adapter.detect({ threshold: 0 });
       expect(report.summary.threshold).toBe(2.0);
     });

     it('clamps negative threshold to 2.0', () => {
       const store = new GraphStore();
       const adapter = new GraphAnomalyAdapter(store);
       const report = adapter.detect({ threshold: -5 });
       expect(report.summary.threshold).toBe(2.0);
     });

     it('uses custom threshold when positive', () => {
       const store = new GraphStore();
       const adapter = new GraphAnomalyAdapter(store);
       const report = adapter.detect({ threshold: 3.0 });
       expect(report.summary.threshold).toBe(3.0);
     });

     it('warns on unrecognized metric names', () => {
       const store = new GraphStore();
       const adapter = new GraphAnomalyAdapter(store);
       const report = adapter.detect({ metrics: ['cyclomaticComplexity', 'bogusMetric'] });
       expect(report.summary.warnings).toContain('bogusMetric');
       expect(report.summary.metricsAnalyzed).toEqual(['cyclomaticComplexity']);
     });
   });
   ```

2. Run test: `npx vitest run packages/graph/tests/entropy/GraphAnomalyAdapter.test.ts`
3. Observe failure: `GraphAnomalyAdapter` is not defined.

4. Create implementation `packages/graph/src/entropy/GraphAnomalyAdapter.ts`:

   ```typescript
   import type { GraphStore } from '../store/GraphStore.js';
   import { GraphCouplingAdapter } from './GraphCouplingAdapter.js';
   import { GraphComplexityAdapter } from './GraphComplexityAdapter.js';

   export interface AnomalyDetectionOptions {
     threshold?: number;
     metrics?: string[];
   }

   export interface StatisticalOutlier {
     nodeId: string;
     nodeName: string;
     nodePath?: string;
     nodeType: string;
     metric: string;
     value: number;
     zScore: number;
     mean: number;
     stdDev: number;
   }

   export interface ArticulationPoint {
     nodeId: string;
     nodeName: string;
     nodePath?: string;
     componentsIfRemoved: number;
     dependentCount: number;
   }

   export interface AnomalyReport {
     statisticalOutliers: StatisticalOutlier[];
     articulationPoints: ArticulationPoint[];
     overlapping: string[];
     summary: {
       totalNodesAnalyzed: number;
       outlierCount: number;
       articulationPointCount: number;
       overlapCount: number;
       metricsAnalyzed: string[];
       warnings: string[];
       threshold: number;
     };
   }

   const DEFAULT_THRESHOLD = 2.0;
   const DEFAULT_METRICS = [
     'cyclomaticComplexity',
     'fanIn',
     'fanOut',
     'hotspotScore',
     'transitiveDepth',
   ] as const;

   const RECOGNIZED_METRICS = new Set<string>(DEFAULT_METRICS);

   export class GraphAnomalyAdapter {
     constructor(private readonly store: GraphStore) {}

     detect(options?: AnomalyDetectionOptions): AnomalyReport {
       const threshold =
         options?.threshold != null && options.threshold > 0
           ? options.threshold
           : DEFAULT_THRESHOLD;

       const requestedMetrics = options?.metrics ?? [...DEFAULT_METRICS];
       const warnings: string[] = [];
       const metricsToAnalyze: string[] = [];

       for (const m of requestedMetrics) {
         if (RECOGNIZED_METRICS.has(m)) {
           metricsToAnalyze.push(m);
         } else {
           warnings.push(m);
         }
       }

       return {
         statisticalOutliers: [],
         articulationPoints: [],
         overlapping: [],
         summary: {
           totalNodesAnalyzed: 0,
           outlierCount: 0,
           articulationPointCount: 0,
           overlapCount: 0,
           metricsAnalyzed: metricsToAnalyze,
           warnings,
           threshold,
         },
       };
     }
   }
   ```

5. Run test: `npx vitest run packages/graph/tests/entropy/GraphAnomalyAdapter.test.ts`
6. Observe: all 5 tests pass.
7. Run: `harness validate`
8. Commit: `feat(graph): add GraphAnomalyAdapter skeleton with interfaces and option handling`

---

### Task 2: Implement Z-score statistical outlier detection with TDD

**Depends on:** Task 1
**Files:** `packages/graph/src/entropy/GraphAnomalyAdapter.ts`, `packages/graph/tests/entropy/GraphAnomalyAdapter.test.ts`

1. Add tests to the test file (append inside the `describe` block):

   ```typescript
   describe('Z-score statistical outlier detection', () => {
     it('detects cyclomaticComplexity outliers via Z-score', () => {
       const store = new GraphStore();

       // Create 10 files each with one function.
       // 9 functions have complexity=5, 1 function has complexity=50 (outlier).
       for (let i = 0; i < 10; i++) {
         const filePath = `src/file${i}.ts`;
         const fileId = `file:${filePath}`;
         const fnId = `function:${filePath}:fn${i}`;
         const complexity = i === 9 ? 50 : 5;

         store.addNode({
           id: fileId,
           type: 'file',
           name: `file${i}.ts`,
           path: filePath,
           metadata: {},
         });
         store.addNode({
           id: fnId,
           type: 'function',
           name: `fn${i}`,
           path: filePath,
           metadata: { cyclomaticComplexity: complexity },
         });
         store.addEdge({ from: fileId, to: fnId, type: 'contains' });
       }

       const adapter = new GraphAnomalyAdapter(store);
       const report = adapter.detect({ metrics: ['cyclomaticComplexity'] });

       // Only fn9 should be an outlier (complexity=50 vs mean~9.5)
       expect(report.statisticalOutliers.length).toBeGreaterThanOrEqual(1);
       const outlier = report.statisticalOutliers.find((o) => o.nodeName === 'fn9');
       expect(outlier).toBeDefined();
       expect(outlier!.metric).toBe('cyclomaticComplexity');
       expect(outlier!.value).toBe(50);
       expect(outlier!.zScore).toBeGreaterThan(2.0);
       expect(outlier!.mean).toBeCloseTo(9.5, 1);
       expect(outlier!.stdDev).toBeGreaterThan(0);

       // Non-outlier functions should NOT appear
       const nonOutlier = report.statisticalOutliers.find((o) => o.nodeName === 'fn0');
       expect(nonOutlier).toBeUndefined();
     });

     it('detects fanIn outliers from coupling data', () => {
       const store = new GraphStore();

       // Create 6 files. File "hub" is imported by all others.
       store.addNode({
         id: 'file:hub.ts',
         type: 'file',
         name: 'hub.ts',
         path: 'src/hub.ts',
         metadata: {},
       });
       for (let i = 0; i < 5; i++) {
         const fileId = `file:f${i}.ts`;
         store.addNode({
           id: fileId,
           type: 'file',
           name: `f${i}.ts`,
           path: `src/f${i}.ts`,
           metadata: {},
         });
         store.addEdge({ from: fileId, to: 'file:hub.ts', type: 'imports' });
       }

       const adapter = new GraphAnomalyAdapter(store);
       const report = adapter.detect({ metrics: ['fanIn'] });

       // hub.ts has fanIn=5, all others have fanIn=0 -> hub is outlier
       const hubOutlier = report.statisticalOutliers.find((o) => o.nodeName === 'hub.ts');
       expect(hubOutlier).toBeDefined();
       expect(hubOutlier!.metric).toBe('fanIn');
       expect(hubOutlier!.value).toBe(5);
       expect(hubOutlier!.zScore).toBeGreaterThan(2.0);
     });

     it('detects fanOut outliers from coupling data', () => {
       const store = new GraphStore();

       // Create 6 files. File "importer" imports all others.
       store.addNode({
         id: 'file:importer.ts',
         type: 'file',
         name: 'importer.ts',
         path: 'src/importer.ts',
         metadata: {},
       });
       for (let i = 0; i < 5; i++) {
         const fileId = `file:dep${i}.ts`;
         store.addNode({
           id: fileId,
           type: 'file',
           name: `dep${i}.ts`,
           path: `src/dep${i}.ts`,
           metadata: {},
         });
         store.addEdge({ from: 'file:importer.ts', to: fileId, type: 'imports' });
       }

       const adapter = new GraphAnomalyAdapter(store);
       const report = adapter.detect({ metrics: ['fanOut'] });

       const importerOutlier = report.statisticalOutliers.find((o) => o.nodeName === 'importer.ts');
       expect(importerOutlier).toBeDefined();
       expect(importerOutlier!.metric).toBe('fanOut');
       expect(importerOutlier!.value).toBe(5);
     });

     it('skips metrics with zero stdDev', () => {
       const store = new GraphStore();

       // All functions have identical complexity=5
       for (let i = 0; i < 5; i++) {
         const filePath = `src/file${i}.ts`;
         const fileId = `file:${filePath}`;
         const fnId = `function:${filePath}:fn${i}`;
         store.addNode({
           id: fileId,
           type: 'file',
           name: `file${i}.ts`,
           path: filePath,
           metadata: {},
         });
         store.addNode({
           id: fnId,
           type: 'function',
           name: `fn${i}`,
           path: filePath,
           metadata: { cyclomaticComplexity: 5 },
         });
         store.addEdge({ from: fileId, to: fnId, type: 'contains' });
       }

       const adapter = new GraphAnomalyAdapter(store);
       const report = adapter.detect({ metrics: ['cyclomaticComplexity'] });

       expect(report.statisticalOutliers).toEqual([]);
     });

     it('sorts statisticalOutliers by zScore descending', () => {
       const store = new GraphStore();

       // Create 10 functions with complexities: 1,1,1,1,1,1,1,1,20,30
       const complexities = [1, 1, 1, 1, 1, 1, 1, 1, 20, 30];
       for (let i = 0; i < 10; i++) {
         const filePath = `src/file${i}.ts`;
         const fileId = `file:${filePath}`;
         const fnId = `function:${filePath}:fn${i}`;
         store.addNode({
           id: fileId,
           type: 'file',
           name: `file${i}.ts`,
           path: filePath,
           metadata: {},
         });
         store.addNode({
           id: fnId,
           type: 'function',
           name: `fn${i}`,
           path: filePath,
           metadata: { cyclomaticComplexity: complexities[i] },
         });
         store.addEdge({ from: fileId, to: fnId, type: 'contains' });
       }

       const adapter = new GraphAnomalyAdapter(store);
       const report = adapter.detect({ metrics: ['cyclomaticComplexity'] });

       expect(report.statisticalOutliers.length).toBeGreaterThanOrEqual(2);
       // fn9 (complexity=30) should have higher zScore than fn8 (complexity=20)
       const fn9 = report.statisticalOutliers.find((o) => o.nodeName === 'fn9');
       const fn8 = report.statisticalOutliers.find((o) => o.nodeName === 'fn8');
       expect(fn9).toBeDefined();
       expect(fn8).toBeDefined();

       const fn9Idx = report.statisticalOutliers.indexOf(fn9!);
       const fn8Idx = report.statisticalOutliers.indexOf(fn8!);
       expect(fn9Idx).toBeLessThan(fn8Idx); // higher zScore comes first
     });

     it('a node can appear multiple times for different metrics', () => {
       const store = new GraphStore();

       // Create a hub file that imports many others AND has a high-complexity function
       store.addNode({
         id: 'file:hub.ts',
         type: 'file',
         name: 'hub.ts',
         path: 'src/hub.ts',
         metadata: {},
       });
       store.addNode({
         id: 'function:hub.ts:main',
         type: 'function',
         name: 'main',
         path: 'src/hub.ts',
         metadata: { cyclomaticComplexity: 50 },
       });
       store.addEdge({ from: 'file:hub.ts', to: 'function:hub.ts:main', type: 'contains' });

       for (let i = 0; i < 8; i++) {
         const fileId = `file:dep${i}.ts`;
         store.addNode({
           id: fileId,
           type: 'file',
           name: `dep${i}.ts`,
           path: `src/dep${i}.ts`,
           metadata: {},
         });
         store.addNode({
           id: `function:dep${i}.ts:fn${i}`,
           type: 'function',
           name: `fn${i}`,
           path: `src/dep${i}.ts`,
           metadata: { cyclomaticComplexity: 2 },
         });
         store.addEdge({ from: fileId, to: `function:dep${i}.ts:fn${i}`, type: 'contains' });
         store.addEdge({ from: 'file:hub.ts', to: fileId, type: 'imports' });
       }

       const adapter = new GraphAnomalyAdapter(store);
       const report = adapter.detect({ metrics: ['cyclomaticComplexity', 'fanOut'] });

       // hub should appear as outlier for both cyclomaticComplexity (via its function) and fanOut (via its file)
       const ccOutliers = report.statisticalOutliers.filter(
         (o) => o.metric === 'cyclomaticComplexity'
       );
       const foOutliers = report.statisticalOutliers.filter((o) => o.metric === 'fanOut');
       expect(ccOutliers.find((o) => o.nodeName === 'main')).toBeDefined();
       expect(foOutliers.find((o) => o.nodeName === 'hub.ts')).toBeDefined();
     });

     it('reports totalNodesAnalyzed correctly', () => {
       const store = new GraphStore();

       for (let i = 0; i < 5; i++) {
         const filePath = `src/file${i}.ts`;
         const fileId = `file:${filePath}`;
         const fnId = `function:${filePath}:fn${i}`;
         store.addNode({
           id: fileId,
           type: 'file',
           name: `file${i}.ts`,
           path: filePath,
           metadata: {},
         });
         store.addNode({
           id: fnId,
           type: 'function',
           name: `fn${i}`,
           path: filePath,
           metadata: { cyclomaticComplexity: i + 1 },
         });
         store.addEdge({ from: fileId, to: fnId, type: 'contains' });
       }

       const adapter = new GraphAnomalyAdapter(store);
       const report = adapter.detect({ metrics: ['cyclomaticComplexity'] });

       // 5 function nodes analyzed for cyclomaticComplexity
       expect(report.summary.totalNodesAnalyzed).toBeGreaterThanOrEqual(5);
     });
   });
   ```

2. Run test: `npx vitest run packages/graph/tests/entropy/GraphAnomalyAdapter.test.ts`
3. Observe failures: Z-score detection not implemented (returns empty arrays).

4. Implement Z-score detection in `GraphAnomalyAdapter.ts`. Replace the `detect()` method body with the full implementation. The key changes:
   - Add a private `collectMetricValues()` method that gathers per-metric data:
     - `cyclomaticComplexity`: iterate function/method nodes, read `metadata.cyclomaticComplexity`
     - `fanIn`, `fanOut`, `transitiveDepth`: call `new GraphCouplingAdapter(this.store).computeCouplingData()`, map to file nodes
     - `hotspotScore`: call `new GraphComplexityAdapter(this.store).computeComplexityHotspots()`, map to function nodes
   - Add a private `computeZScoreOutliers()` method that:
     - Computes mean and stdDev for the value array
     - Skips if stdDev === 0
     - Flags entries where `Math.abs(value - mean) / stdDev > threshold`
     - Returns `StatisticalOutlier[]`
   - Update `detect()` to:
     - Call `collectMetricValues()` for each metric in `metricsToAnalyze`
     - Call `computeZScoreOutliers()` for each
     - Concatenate results, sort by zScore desc
     - Track `totalNodesAnalyzed` as the count of unique node IDs across all metrics
     - Set `outlierCount` from the result array length

   Exact implementation for the detect method and helpers:

   ```typescript
   detect(options?: AnomalyDetectionOptions): AnomalyReport {
     const threshold =
       options?.threshold != null && options.threshold > 0
         ? options.threshold
         : DEFAULT_THRESHOLD;

     const requestedMetrics = options?.metrics ?? [...DEFAULT_METRICS];
     const warnings: string[] = [];
     const metricsToAnalyze: string[] = [];

     for (const m of requestedMetrics) {
       if (RECOGNIZED_METRICS.has(m)) {
         metricsToAnalyze.push(m);
       } else {
         warnings.push(m);
       }
     }

     const allOutliers: StatisticalOutlier[] = [];
     const analyzedNodeIds = new Set<string>();

     for (const metric of metricsToAnalyze) {
       const entries = this.collectMetricValues(metric);
       for (const e of entries) {
         analyzedNodeIds.add(e.nodeId);
       }
       const outliers = this.computeZScoreOutliers(entries, metric, threshold);
       allOutliers.push(...outliers);
     }

     // Sort by zScore descending
     allOutliers.sort((a, b) => b.zScore - a.zScore);

     return {
       statisticalOutliers: allOutliers,
       articulationPoints: [],
       overlapping: [],
       summary: {
         totalNodesAnalyzed: analyzedNodeIds.size,
         outlierCount: allOutliers.length,
         articulationPointCount: 0,
         overlapCount: 0,
         metricsAnalyzed: metricsToAnalyze,
         warnings,
         threshold,
       },
     };
   }

   private collectMetricValues(
     metric: string,
   ): Array<{ nodeId: string; nodeName: string; nodePath?: string; nodeType: string; value: number }> {
     const entries: Array<{
       nodeId: string;
       nodeName: string;
       nodePath?: string;
       nodeType: string;
       value: number;
     }> = [];

     if (metric === 'cyclomaticComplexity') {
       const functionNodes = [
         ...this.store.findNodes({ type: 'function' }),
         ...this.store.findNodes({ type: 'method' }),
       ];
       for (const node of functionNodes) {
         const cc = node.metadata?.cyclomaticComplexity;
         if (typeof cc === 'number') {
           entries.push({
             nodeId: node.id,
             nodeName: node.name,
             nodePath: node.path,
             nodeType: node.type,
             value: cc,
           });
         }
       }
     } else if (metric === 'fanIn' || metric === 'fanOut' || metric === 'transitiveDepth') {
       const couplingAdapter = new GraphCouplingAdapter(this.store);
       const couplingData = couplingAdapter.computeCouplingData();
       for (const fileData of couplingData.files) {
         // Find the file node to get its ID
         const fileNodes = this.store.findNodes({ type: 'file' });
         const fileNode = fileNodes.find((n) => (n.path ?? n.name) === fileData.file);
         if (!fileNode) continue;
         entries.push({
           nodeId: fileNode.id,
           nodeName: fileNode.name,
           nodePath: fileNode.path,
           nodeType: 'file',
           value: fileData[metric],
         });
       }
     } else if (metric === 'hotspotScore') {
       const complexityAdapter = new GraphComplexityAdapter(this.store);
       const hotspots = complexityAdapter.computeComplexityHotspots();
       for (const h of hotspots.hotspots) {
         // Find the function node by name and path
         const functionNodes = [
           ...this.store.findNodes({ type: 'function' }),
           ...this.store.findNodes({ type: 'method' }),
         ];
         const fnNode = functionNodes.find(
           (n) => n.name === h.function && (n.path ?? '') === (h.file ?? ''),
         );
         if (!fnNode) continue;
         entries.push({
           nodeId: fnNode.id,
           nodeName: fnNode.name,
           nodePath: fnNode.path,
           nodeType: fnNode.type,
           value: h.hotspotScore,
         });
       }
     }

     return entries;
   }

   private computeZScoreOutliers(
     entries: Array<{ nodeId: string; nodeName: string; nodePath?: string; nodeType: string; value: number }>,
     metric: string,
     threshold: number,
   ): StatisticalOutlier[] {
     if (entries.length === 0) return [];

     const values = entries.map((e) => e.value);
     const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
     const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
     const stdDev = Math.sqrt(variance);

     if (stdDev === 0) return [];

     const outliers: StatisticalOutlier[] = [];
     for (const entry of entries) {
       const zScore = Math.abs(entry.value - mean) / stdDev;
       if (zScore > threshold) {
         outliers.push({
           nodeId: entry.nodeId,
           nodeName: entry.nodeName,
           nodePath: entry.nodePath,
           nodeType: entry.nodeType,
           metric,
           value: entry.value,
           zScore,
           mean,
           stdDev,
         });
       }
     }

     return outliers;
   }
   ```

5. Run test: `npx vitest run packages/graph/tests/entropy/GraphAnomalyAdapter.test.ts`
6. Observe: all tests pass (5 skeleton + 7 Z-score = 12 tests).
7. Run: `harness validate`
8. Commit: `feat(graph): implement Z-score statistical outlier detection in GraphAnomalyAdapter`

---

### Task 3: Implement Tarjan's articulation point detection with TDD

**Depends on:** Task 1
**Files:** `packages/graph/src/entropy/GraphAnomalyAdapter.ts`, `packages/graph/tests/entropy/GraphAnomalyAdapter.test.ts`

Note: This task can run in parallel with Task 2 if using parallel agents, since the articulation point code is in separate private methods. However, if running sequentially, it depends on Task 2 being committed first (since both modify the same files).

1. Add tests to the test file (append inside the `describe` block):

   ```typescript
   describe('Articulation point detection', () => {
     it('detects a bridge node in a linear chain', () => {
       const store = new GraphStore();

       // Chain: A -> B -> C (B is articulation point)
       store.addNode({
         id: 'file:a.ts',
         type: 'file',
         name: 'a.ts',
         path: 'src/a.ts',
         metadata: {},
       });
       store.addNode({
         id: 'file:b.ts',
         type: 'file',
         name: 'b.ts',
         path: 'src/b.ts',
         metadata: {},
       });
       store.addNode({
         id: 'file:c.ts',
         type: 'file',
         name: 'c.ts',
         path: 'src/c.ts',
         metadata: {},
       });

       store.addEdge({ from: 'file:a.ts', to: 'file:b.ts', type: 'imports' });
       store.addEdge({ from: 'file:b.ts', to: 'file:c.ts', type: 'imports' });

       const adapter = new GraphAnomalyAdapter(store);
       const report = adapter.detect({ metrics: [] }); // skip Z-score, only test articulation

       expect(report.articulationPoints).toHaveLength(1);
       expect(report.articulationPoints[0]!.nodeId).toBe('file:b.ts');
       expect(report.articulationPoints[0]!.componentsIfRemoved).toBe(2);
       // dependentCount = nodes in smaller component(s)
       expect(report.articulationPoints[0]!.dependentCount).toBe(1);
     });

     it('detects no articulation points in a fully connected triangle', () => {
       const store = new GraphStore();

       store.addNode({
         id: 'file:a.ts',
         type: 'file',
         name: 'a.ts',
         path: 'src/a.ts',
         metadata: {},
       });
       store.addNode({
         id: 'file:b.ts',
         type: 'file',
         name: 'b.ts',
         path: 'src/b.ts',
         metadata: {},
       });
       store.addNode({
         id: 'file:c.ts',
         type: 'file',
         name: 'c.ts',
         path: 'src/c.ts',
         metadata: {},
       });

       store.addEdge({ from: 'file:a.ts', to: 'file:b.ts', type: 'imports' });
       store.addEdge({ from: 'file:b.ts', to: 'file:c.ts', type: 'imports' });
       store.addEdge({ from: 'file:c.ts', to: 'file:a.ts', type: 'imports' });

       const adapter = new GraphAnomalyAdapter(store);
       const report = adapter.detect({ metrics: [] });

       expect(report.articulationPoints).toHaveLength(0);
     });

     it('detects root as articulation point with 2+ DFS children', () => {
       const store = new GraphStore();

       // Star topology: center connects to A and B but A and B have no path between them
       // center -> A, center -> B (center is articulation point)
       store.addNode({
         id: 'file:center.ts',
         type: 'file',
         name: 'center.ts',
         path: 'src/center.ts',
         metadata: {},
       });
       store.addNode({
         id: 'file:a.ts',
         type: 'file',
         name: 'a.ts',
         path: 'src/a.ts',
         metadata: {},
       });
       store.addNode({
         id: 'file:b.ts',
         type: 'file',
         name: 'b.ts',
         path: 'src/b.ts',
         metadata: {},
       });

       store.addEdge({ from: 'file:center.ts', to: 'file:a.ts', type: 'imports' });
       store.addEdge({ from: 'file:center.ts', to: 'file:b.ts', type: 'imports' });

       const adapter = new GraphAnomalyAdapter(store);
       const report = adapter.detect({ metrics: [] });

       expect(report.articulationPoints).toHaveLength(1);
       expect(report.articulationPoints[0]!.nodeId).toBe('file:center.ts');
       expect(report.articulationPoints[0]!.componentsIfRemoved).toBe(2);
     });

     it('computes dependentCount as nodes in smaller components', () => {
       const store = new GraphStore();

       // A -> B -> C -> D -> E
       // B is articulation point. Removing B: {A} and {C,D,E}
       // dependentCount for B = 1 (the smaller component has 1 node: A)
       const files = ['a', 'b', 'c', 'd', 'e'];
       for (const f of files) {
         store.addNode({
           id: `file:${f}.ts`,
           type: 'file',
           name: `${f}.ts`,
           path: `src/${f}.ts`,
           metadata: {},
         });
       }
       store.addEdge({ from: 'file:a.ts', to: 'file:b.ts', type: 'imports' });
       store.addEdge({ from: 'file:b.ts', to: 'file:c.ts', type: 'imports' });
       store.addEdge({ from: 'file:c.ts', to: 'file:d.ts', type: 'imports' });
       store.addEdge({ from: 'file:d.ts', to: 'file:e.ts', type: 'imports' });

       const adapter = new GraphAnomalyAdapter(store);
       const report = adapter.detect({ metrics: [] });

       // Multiple articulation points: b, c, d
       expect(report.articulationPoints.length).toBeGreaterThanOrEqual(3);
     });

     it('sorts articulationPoints by dependentCount descending', () => {
       const store = new GraphStore();

       // A -> B -> C -> D (chain of 4)
       // B: removing splits into {A} and {C,D} -> dependentCount=1
       // C: removing splits into {A,B} and {D} -> dependentCount=1
       // Actually in a 4-chain, B and C are both AP but let's use a more distinguishing graph:
       // Hub topology: center is AP connecting a cluster of 3 on one side and 1 on another
       store.addNode({
         id: 'file:center.ts',
         type: 'file',
         name: 'center.ts',
         path: 'src/center.ts',
         metadata: {},
       });
       store.addNode({
         id: 'file:left.ts',
         type: 'file',
         name: 'left.ts',
         path: 'src/left.ts',
         metadata: {},
       });
       store.addNode({
         id: 'file:r1.ts',
         type: 'file',
         name: 'r1.ts',
         path: 'src/r1.ts',
         metadata: {},
       });
       store.addNode({
         id: 'file:r2.ts',
         type: 'file',
         name: 'r2.ts',
         path: 'src/r2.ts',
         metadata: {},
       });
       store.addNode({
         id: 'file:r3.ts',
         type: 'file',
         name: 'r3.ts',
         path: 'src/r3.ts',
         metadata: {},
       });
       store.addNode({
         id: 'file:bridge.ts',
         type: 'file',
         name: 'bridge.ts',
         path: 'src/bridge.ts',
         metadata: {},
       });

       // left -> center -> bridge -> r1, bridge -> r2, bridge -> r3
       store.addEdge({ from: 'file:left.ts', to: 'file:center.ts', type: 'imports' });
       store.addEdge({ from: 'file:center.ts', to: 'file:bridge.ts', type: 'imports' });
       store.addEdge({ from: 'file:bridge.ts', to: 'file:r1.ts', type: 'imports' });
       store.addEdge({ from: 'file:bridge.ts', to: 'file:r2.ts', type: 'imports' });
       store.addEdge({ from: 'file:bridge.ts', to: 'file:r3.ts', type: 'imports' });

       const adapter = new GraphAnomalyAdapter(store);
       const report = adapter.detect({ metrics: [] });

       // Both center and bridge are APs. bridge has higher dependentCount.
       expect(report.articulationPoints.length).toBeGreaterThanOrEqual(2);
       // Sorted by dependentCount desc
       for (let i = 1; i < report.articulationPoints.length; i++) {
         expect(report.articulationPoints[i - 1]!.dependentCount).toBeGreaterThanOrEqual(
           report.articulationPoints[i]!.dependentCount
         );
       }
     });

     it('only considers imports edges for articulation detection', () => {
       const store = new GraphStore();

       // A -> B -> C with imports edges (B is AP)
       // A -> C with 'calls' edge (should NOT create alternate path)
       store.addNode({
         id: 'file:a.ts',
         type: 'file',
         name: 'a.ts',
         path: 'src/a.ts',
         metadata: {},
       });
       store.addNode({
         id: 'file:b.ts',
         type: 'file',
         name: 'b.ts',
         path: 'src/b.ts',
         metadata: {},
       });
       store.addNode({
         id: 'file:c.ts',
         type: 'file',
         name: 'c.ts',
         path: 'src/c.ts',
         metadata: {},
       });

       store.addEdge({ from: 'file:a.ts', to: 'file:b.ts', type: 'imports' });
       store.addEdge({ from: 'file:b.ts', to: 'file:c.ts', type: 'imports' });
       store.addEdge({ from: 'file:a.ts', to: 'file:c.ts', type: 'calls' }); // NOT imports

       const adapter = new GraphAnomalyAdapter(store);
       const report = adapter.detect({ metrics: [] });

       // B should still be an articulation point (calls edge doesn't count)
       expect(report.articulationPoints).toHaveLength(1);
       expect(report.articulationPoints[0]!.nodeId).toBe('file:b.ts');
     });

     it('handles disconnected graph components', () => {
       const store = new GraphStore();

       // Two separate components: {A, B} and {C, D}
       store.addNode({
         id: 'file:a.ts',
         type: 'file',
         name: 'a.ts',
         path: 'src/a.ts',
         metadata: {},
       });
       store.addNode({
         id: 'file:b.ts',
         type: 'file',
         name: 'b.ts',
         path: 'src/b.ts',
         metadata: {},
       });
       store.addNode({
         id: 'file:c.ts',
         type: 'file',
         name: 'c.ts',
         path: 'src/c.ts',
         metadata: {},
       });
       store.addNode({
         id: 'file:d.ts',
         type: 'file',
         name: 'd.ts',
         path: 'src/d.ts',
         metadata: {},
       });

       store.addEdge({ from: 'file:a.ts', to: 'file:b.ts', type: 'imports' });
       store.addEdge({ from: 'file:c.ts', to: 'file:d.ts', type: 'imports' });

       const adapter = new GraphAnomalyAdapter(store);
       const report = adapter.detect({ metrics: [] });

       // No articulation points (removing any node doesn't increase component count)
       // Actually: removing A from {A,B} leaves {B} — still 2 components total (was already 2)
       // The algorithm should find 0 articulation points
       expect(report.articulationPoints).toHaveLength(0);
     });
   });
   ```

2. Run test: `npx vitest run packages/graph/tests/entropy/GraphAnomalyAdapter.test.ts`
3. Observe failures: articulation point tests fail (returns empty arrays).

4. Implement articulation point detection. Add these private methods to `GraphAnomalyAdapter`:

   ```typescript
   private findArticulationPoints(): ArticulationPoint[] {
     // Build undirected adjacency list from imports edges (file nodes only)
     const fileNodes = this.store.findNodes({ type: 'file' });
     if (fileNodes.length === 0) return [];

     const nodeMap = new Map<string, { name: string; path?: string }>();
     const adj = new Map<string, Set<string>>();

     for (const node of fileNodes) {
       nodeMap.set(node.id, { name: node.name, path: node.path });
       adj.set(node.id, new Set());
     }

     // Build undirected adjacency from imports edges
     const importEdges = this.store.getEdges({ type: 'imports' });
     for (const edge of importEdges) {
       if (adj.has(edge.from) && adj.has(edge.to)) {
         adj.get(edge.from)!.add(edge.to);
         adj.get(edge.to)!.add(edge.from);
       }
     }

     // Tarjan's algorithm for articulation points
     const disc = new Map<string, number>();
     const low = new Map<string, number>();
     const parent = new Map<string, string | null>();
     const apSet = new Set<string>();
     let timer = 0;

     const dfs = (u: string): void => {
       disc.set(u, timer);
       low.set(u, timer);
       timer++;
       let children = 0;

       for (const v of adj.get(u)!) {
         if (!disc.has(v)) {
           children++;
           parent.set(v, u);
           dfs(v);

           low.set(u, Math.min(low.get(u)!, low.get(v)!));

           // u is AP if:
           // 1) u is root and has 2+ children
           if (parent.get(u) === null && children > 1) {
             apSet.add(u);
           }
           // 2) u is not root and low[v] >= disc[u]
           if (parent.get(u) !== null && low.get(v)! >= disc.get(u)!) {
             apSet.add(u);
           }
         } else if (v !== parent.get(u)) {
           low.set(u, Math.min(low.get(u)!, disc.get(v)!));
         }
       }
     };

     // Handle disconnected components
     for (const nodeId of adj.keys()) {
       if (!disc.has(nodeId)) {
         parent.set(nodeId, null);
         dfs(nodeId);
       }
     }

     // For each AP, compute componentsIfRemoved and dependentCount
     const results: ArticulationPoint[] = [];

     for (const apId of apSet) {
       const { components, dependentCount } = this.computeRemovalImpact(apId, adj);
       const info = nodeMap.get(apId)!;
       results.push({
         nodeId: apId,
         nodeName: info.name,
         nodePath: info.path,
         componentsIfRemoved: components,
         dependentCount,
       });
     }

     // Sort by dependentCount descending
     results.sort((a, b) => b.dependentCount - a.dependentCount);

     return results;
   }

   private computeRemovalImpact(
     removedId: string,
     adj: Map<string, Set<string>>,
   ): { components: number; dependentCount: number } {
     // BFS on graph with removedId deleted, count connected components
     const visited = new Set<string>();
     visited.add(removedId); // treat as removed

     const componentSizes: number[] = [];

     for (const nodeId of adj.keys()) {
       if (visited.has(nodeId)) continue;

       // BFS from this node
       const queue: string[] = [nodeId];
       visited.add(nodeId);
       let size = 0;
       let head = 0;

       while (head < queue.length) {
         const current = queue[head++]!;
         size++;
         for (const neighbor of adj.get(current)!) {
           if (!visited.has(neighbor)) {
             visited.add(neighbor);
             queue.push(neighbor);
           }
         }
       }

       componentSizes.push(size);
     }

     const components = componentSizes.length;
     // dependentCount = total nodes in all components except the largest
     if (componentSizes.length <= 1) {
       return { components, dependentCount: 0 };
     }

     const maxSize = Math.max(...componentSizes);
     const dependentCount = componentSizes.reduce((sum, s) => sum + s, 0) - maxSize;

     return { components, dependentCount };
   }
   ```

5. Update `detect()` to call `findArticulationPoints()` and wire the results into the report:

   ```typescript
   // After Z-score computation, before building the return value:
   const articulationPoints = this.findArticulationPoints();
   ```

   Update the return object to use `articulationPoints` and set `articulationPointCount`.

6. Run test: `npx vitest run packages/graph/tests/entropy/GraphAnomalyAdapter.test.ts`
7. Observe: all tests pass (skeleton + Z-score + articulation = ~19 tests).
8. Run: `harness validate`
9. Commit: `feat(graph): implement Tarjan's articulation point detection in GraphAnomalyAdapter`

---

### Task 4: Implement overlap computation and final integration tests

**Depends on:** Task 2, Task 3
**Files:** `packages/graph/src/entropy/GraphAnomalyAdapter.ts`, `packages/graph/tests/entropy/GraphAnomalyAdapter.test.ts`

[checkpoint:human-verify] -- verify Tasks 2-3 output before continuing

1. Add tests to the test file (append inside the `describe` block):

   ```typescript
   describe('Overlap computation', () => {
     it('identifies nodes that are both statistical outliers and articulation points', () => {
       const store = new GraphStore();

       // Create a hub that is BOTH an articulation point AND a fanOut outlier.
       // hub imports left1, left2, left3 and also imports right (right imports nothing else).
       // hub is the only connection between left-group and right.
       store.addNode({
         id: 'file:hub.ts',
         type: 'file',
         name: 'hub.ts',
         path: 'src/hub.ts',
         metadata: {},
       });
       store.addNode({
         id: 'file:left1.ts',
         type: 'file',
         name: 'left1.ts',
         path: 'src/left1.ts',
         metadata: {},
       });
       store.addNode({
         id: 'file:left2.ts',
         type: 'file',
         name: 'left2.ts',
         path: 'src/left2.ts',
         metadata: {},
       });
       store.addNode({
         id: 'file:left3.ts',
         type: 'file',
         name: 'left3.ts',
         path: 'src/left3.ts',
         metadata: {},
       });
       store.addNode({
         id: 'file:right.ts',
         type: 'file',
         name: 'right.ts',
         path: 'src/right.ts',
         metadata: {},
       });
       // Extra isolated nodes to make fanOut stats work
       for (let i = 0; i < 5; i++) {
         store.addNode({
           id: `file:iso${i}.ts`,
           type: 'file',
           name: `iso${i}.ts`,
           path: `src/iso${i}.ts`,
           metadata: {},
         });
       }

       store.addEdge({ from: 'file:hub.ts', to: 'file:left1.ts', type: 'imports' });
       store.addEdge({ from: 'file:hub.ts', to: 'file:left2.ts', type: 'imports' });
       store.addEdge({ from: 'file:hub.ts', to: 'file:left3.ts', type: 'imports' });
       store.addEdge({ from: 'file:hub.ts', to: 'file:right.ts', type: 'imports' });

       const adapter = new GraphAnomalyAdapter(store);
       const report = adapter.detect({ metrics: ['fanOut'] });

       // hub is an articulation point (removing it disconnects left from right)
       const hubAP = report.articulationPoints.find((ap) => ap.nodeId === 'file:hub.ts');
       expect(hubAP).toBeDefined();

       // hub should be a fanOut outlier (4 imports vs 0 for everyone else)
       const hubOutlier = report.statisticalOutliers.find(
         (o) => o.nodeId === 'file:hub.ts' && o.metric === 'fanOut'
       );
       expect(hubOutlier).toBeDefined();

       // hub should appear in overlapping
       expect(report.overlapping).toContain('file:hub.ts');
       expect(report.summary.overlapCount).toBeGreaterThanOrEqual(1);
     });

     it('overlapping is empty when no node appears in both sets', () => {
       const store = new GraphStore();

       // Simple chain with no outlier metrics
       store.addNode({
         id: 'file:a.ts',
         type: 'file',
         name: 'a.ts',
         path: 'src/a.ts',
         metadata: {},
       });
       store.addNode({
         id: 'file:b.ts',
         type: 'file',
         name: 'b.ts',
         path: 'src/b.ts',
         metadata: {},
       });
       store.addNode({
         id: 'file:c.ts',
         type: 'file',
         name: 'c.ts',
         path: 'src/c.ts',
         metadata: {},
       });

       store.addEdge({ from: 'file:a.ts', to: 'file:b.ts', type: 'imports' });
       store.addEdge({ from: 'file:b.ts', to: 'file:c.ts', type: 'imports' });

       const adapter = new GraphAnomalyAdapter(store);
       // Use no metrics so no outliers, but B is an articulation point
       const report = adapter.detect({ metrics: [] });

       expect(report.articulationPoints).toHaveLength(1);
       expect(report.overlapping).toEqual([]);
     });
   });
   ```

2. Run test: `npx vitest run packages/graph/tests/entropy/GraphAnomalyAdapter.test.ts`
3. Observe failure: overlap not computed.

4. Update `detect()` to compute overlap:

   ```typescript
   // After computing allOutliers and articulationPoints:
   const outlierNodeIds = new Set(allOutliers.map((o) => o.nodeId));
   const apNodeIds = new Set(articulationPoints.map((ap) => ap.nodeId));
   const overlapping = [...outlierNodeIds].filter((id) => apNodeIds.has(id));
   ```

   Wire `overlapping` and `overlapCount: overlapping.length` into the return value.

5. Run test: `npx vitest run packages/graph/tests/entropy/GraphAnomalyAdapter.test.ts`
6. Observe: all tests pass (~21 tests).
7. Run: `harness validate`
8. Commit: `feat(graph): add overlap computation to GraphAnomalyAdapter and complete unit tests`

## Traceability

| Observable Truth                                                       | Delivered by Task(s) |
| ---------------------------------------------------------------------- | -------------------- |
| 1. Z-score outlier detection with correct values                       | Task 2               |
| 2. Skip metrics with zero stdDev                                       | Task 2               |
| 3. Empty results for fewer than 3 nodes                                | Task 1, Task 2       |
| 4. Articulation points with correct componentsIfRemoved/dependentCount | Task 3               |
| 5. Overlapping cross-reference                                         | Task 4               |
| 6. Sorting (zScore desc, dependentCount desc)                          | Task 2, Task 3       |
| 7. Custom threshold/metrics                                            | Task 1, Task 2       |
| 8. Unrecognized metric warnings                                        | Task 1               |
| 9. Negative/zero threshold clamping                                    | Task 1               |
| 10. Empty graph returns empty report                                   | Task 1               |
| 11. All tests pass                                                     | Task 4               |
| 12. harness validate passes                                            | All tasks            |
