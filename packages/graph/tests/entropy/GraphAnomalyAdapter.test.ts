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
