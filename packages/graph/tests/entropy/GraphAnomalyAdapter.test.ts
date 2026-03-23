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
});
