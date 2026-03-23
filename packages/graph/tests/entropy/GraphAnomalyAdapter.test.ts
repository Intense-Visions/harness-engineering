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
      // Use threshold 1.0 so both fn8 (z=1.44) and fn9 (z=2.46) are outliers
      const report = adapter.detect({ metrics: ['cyclomaticComplexity'], threshold: 1.0 });

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
      expect(report.articulationPoints).toHaveLength(0);
    });
  });
});
