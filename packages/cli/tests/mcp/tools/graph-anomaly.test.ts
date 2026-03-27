import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs/promises';
import {
  handleDetectAnomalies,
  detectAnomaliesDefinition,
} from '../../../src/mcp/tools/graph/index.js';

let tmpDir: string;

async function createAnomalyTestGraph(dir: string) {
  const { GraphStore } = await import('@harness-engineering/graph');
  const store = new GraphStore();

  // File nodes with imports edges to create articulation point topology:
  //   A -> B -> C  and  A -> B -> D  (B is articulation point)
  store.addNode({ id: 'file:a.ts', type: 'file', name: 'a.ts', path: 'a.ts', metadata: {} });
  store.addNode({ id: 'file:b.ts', type: 'file', name: 'b.ts', path: 'b.ts', metadata: {} });
  store.addNode({ id: 'file:c.ts', type: 'file', name: 'c.ts', path: 'c.ts', metadata: {} });
  store.addNode({ id: 'file:d.ts', type: 'file', name: 'd.ts', path: 'd.ts', metadata: {} });

  store.addEdge({ from: 'file:a.ts', to: 'file:b.ts', type: 'imports' });
  store.addEdge({ from: 'file:b.ts', to: 'file:c.ts', type: 'imports' });
  store.addEdge({ from: 'file:b.ts', to: 'file:d.ts', type: 'imports' });

  // Function nodes with varying cyclomatic complexity (one outlier).
  // We need enough normal-range data points so the outlier exceeds the
  // default z-score threshold of 2.0.
  const normalComplexities = [2, 3, 2, 3, 2, 3, 2, 3];
  for (let i = 0; i < normalComplexities.length; i++) {
    store.addNode({
      id: `fn:simple${i + 1}`,
      type: 'function',
      name: `simple${i + 1}`,
      path: `${String.fromCharCode(97 + (i % 4))}.ts`,
      metadata: { cyclomaticComplexity: normalComplexities[i] },
    });
  }
  store.addNode({
    id: 'fn:complex',
    type: 'function',
    name: 'complex',
    path: 'd.ts',
    metadata: { cyclomaticComplexity: 50 },
  });

  const graphDir = path.join(dir, '.harness', 'graph');
  await store.save(graphDir);
  return store;
}

function parseResult(result: { content: { text: string }[] }) {
  return JSON.parse(result.content[0].text);
}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'anomaly-test-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// ── Definition tests ─────────────────────────────────────────────────

describe('detect_anomalies definition', () => {
  it('has correct name', () => {
    expect(detectAnomaliesDefinition.name).toBe('detect_anomalies');
  });

  it('requires path parameter', () => {
    expect(detectAnomaliesDefinition.inputSchema.required).toEqual(['path']);
  });

  it('has threshold and metrics as optional parameters', () => {
    const props = detectAnomaliesDefinition.inputSchema.properties;
    expect(props).toHaveProperty('threshold');
    expect(props).toHaveProperty('metrics');
    expect(props.threshold.type).toBe('number');
    expect(props.metrics.type).toBe('array');
  });
});

// ── Handler tests ────────────────────────────────────────────────────

describe('handleDetectAnomalies', () => {
  it('returns anomaly report with all sections', async () => {
    await createAnomalyTestGraph(tmpDir);
    const result = await handleDetectAnomalies({ path: tmpDir });

    expect(result.isError).toBeUndefined();
    const data = parseResult(result);
    expect(data).toHaveProperty('statisticalOutliers');
    expect(data).toHaveProperty('articulationPoints');
    expect(data).toHaveProperty('overlapping');
    expect(data).toHaveProperty('summary');
    expect(data.summary).toHaveProperty('totalNodesAnalyzed');
    expect(data.summary).toHaveProperty('outlierCount');
    expect(data.summary).toHaveProperty('articulationPointCount');
    expect(data.summary).toHaveProperty('overlapCount');
    expect(data.summary).toHaveProperty('metricsAnalyzed');
    expect(data.summary).toHaveProperty('threshold');
  });

  it('detects the high-complexity outlier', async () => {
    await createAnomalyTestGraph(tmpDir);
    const result = await handleDetectAnomalies({
      path: tmpDir,
      metrics: ['cyclomaticComplexity'],
    });

    const data = parseResult(result);
    expect(data.statisticalOutliers.length).toBeGreaterThan(0);
    const outlierIds = data.statisticalOutliers.map((o: { nodeId: string }) => o.nodeId);
    expect(outlierIds).toContain('fn:complex');
  });

  it('passes custom threshold to adapter', async () => {
    await createAnomalyTestGraph(tmpDir);
    // Very high threshold: no outliers
    const result = await handleDetectAnomalies({
      path: tmpDir,
      threshold: 100,
      metrics: ['cyclomaticComplexity'],
    });

    const data = parseResult(result);
    expect(data.statisticalOutliers).toHaveLength(0);
    expect(data.summary.threshold).toBe(100);
  });

  it('passes custom metrics to adapter', async () => {
    await createAnomalyTestGraph(tmpDir);
    const result = await handleDetectAnomalies({
      path: tmpDir,
      metrics: ['cyclomaticComplexity'],
    });

    const data = parseResult(result);
    expect(data.summary.metricsAnalyzed).toEqual(['cyclomaticComplexity']);
  });

  it('returns error when graph does not exist', async () => {
    const result = await handleDetectAnomalies({ path: tmpDir });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('No graph found');
  });

  it('includes unrecognized metrics in warnings', async () => {
    await createAnomalyTestGraph(tmpDir);
    const result = await handleDetectAnomalies({
      path: tmpDir,
      metrics: ['cyclomaticComplexity', 'madeUpMetric'],
    });

    const data = parseResult(result);
    expect(data.summary.warnings).toContain('madeUpMetric');
    expect(data.summary.metricsAnalyzed).toEqual(['cyclomaticComplexity']);
  });
});
