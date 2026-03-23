# Plan: MCP Tool Wiring for Graph Anomaly Detection

**Date:** 2026-03-22
**Spec:** docs/changes/graph-anomaly-detection/proposal.md
**Phase:** 2 of 3 (MCP tool wiring)
**Estimated tasks:** 4
**Estimated time:** 15 minutes

## Goal

Wire the `detect_anomalies` MCP tool so that agents can call a single tool to get a unified structural risk report (statistical outliers + articulation points + overlap) from the knowledge graph.

## Observable Truths (Acceptance Criteria)

1. When `detect_anomalies` is called with a valid `path` pointing to a project with a graph, the system shall return JSON containing `statisticalOutliers`, `articulationPoints`, `overlapping`, and `summary` sections.
2. When `detect_anomalies` is called with optional `threshold` and `metrics` parameters, the system shall pass those values to `GraphAnomalyAdapter.detect()`.
3. When the graph store is unavailable (no `.harness/graph/`), the system shall return `isError: true` with a "No graph found" message.
4. When the handler throws an unexpected error, the system shall return `isError: true` with the error message.
5. The `detect_anomalies` tool shall appear in `getToolDefinitions()` and be callable via `TOOL_HANDLERS`.
6. `npx vitest run packages/mcp-server/tests/tools/graph-anomaly.test.ts` passes with all tests.
7. `npx vitest run packages/mcp-server/tests/server-integration.test.ts` passes (tool count updated to 41).
8. `npx vitest run packages/mcp-server/tests/server.test.ts` passes (tool count updated to 41).
9. `harness validate` passes.

## File Map

- MODIFY `packages/mcp-server/src/tools/graph.ts` (add `detectAnomaliesDefinition` + `handleDetectAnomalies`)
- MODIFY `packages/mcp-server/src/server.ts` (import + register definition + handler)
- CREATE `packages/mcp-server/tests/tools/graph-anomaly.test.ts` (integration tests)
- MODIFY `packages/mcp-server/tests/server-integration.test.ts` (update tool count 40 -> 41, add `detect_anomalies` name check)
- MODIFY `packages/mcp-server/tests/server.test.ts` (update tool count 40 -> 41)

## Tasks

### Task 1: Add tool definition and handler to graph.ts

**Depends on:** none (Phase 1 already complete -- GraphAnomalyAdapter exported from @harness-engineering/graph)
**Files:** `packages/mcp-server/src/tools/graph.ts`

1. Open `packages/mcp-server/src/tools/graph.ts`.
2. At the end of the file (after the `handleIngestSource` function), add the following definition and handler:

```typescript
// ── detect_anomalies ─────────────────────────────────────────────────

export const detectAnomaliesDefinition = {
  name: 'detect_anomalies',
  description:
    'Detect structural anomalies — statistical outliers across code metrics and topological single points of failure in the import graph',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: { type: 'string', description: 'Path to project root' },
      threshold: { type: 'number', description: 'Z-score threshold (default 2.0)' },
      metrics: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Metrics to analyze (default: cyclomaticComplexity, fanIn, fanOut, hotspotScore, transitiveDepth)',
      },
    },
    required: ['path'],
  },
};

export async function handleDetectAnomalies(input: {
  path: string;
  threshold?: number;
  metrics?: string[];
}) {
  try {
    const projectPath = sanitizePath(input.path);
    const store = await loadGraphStore(projectPath);
    if (!store) return graphNotFoundError();

    const { GraphAnomalyAdapter } = await import('@harness-engineering/graph');
    const adapter = new GraphAnomalyAdapter(store);
    const report = adapter.detect({
      threshold: input.threshold,
      metrics: input.metrics,
    });

    return {
      content: [{ type: 'text' as const, text: JSON.stringify(report) }],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text' as const,
          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}
```

3. Run: `npx vitest run packages/mcp-server/tests/tools/graph.test.ts` -- existing tests should still pass.
4. Run: `harness validate`
5. Commit: `feat(mcp): add detect_anomalies tool definition and handler`

### Task 2: Register tool in server.ts

**Depends on:** Task 1
**Files:** `packages/mcp-server/src/server.ts`

1. Open `packages/mcp-server/src/server.ts`.
2. Add `detectAnomaliesDefinition` and `handleDetectAnomalies` to the import from `'./tools/graph.js'`:

```typescript
import {
  queryGraphDefinition,
  handleQueryGraph,
  searchSimilarDefinition,
  handleSearchSimilar,
  findContextForDefinition,
  handleFindContextFor,
  getRelationshipsDefinition,
  handleGetRelationships,
  getImpactDefinition,
  handleGetImpact,
  ingestSourceDefinition,
  handleIngestSource,
  detectAnomaliesDefinition,
  handleDetectAnomalies,
} from './tools/graph.js';
```

3. Add `detectAnomaliesDefinition` to the `TOOL_DEFINITIONS` array (after `reviewChangesDefinition`):

```typescript
  reviewChangesDefinition,
  detectAnomaliesDefinition,
```

4. Add the handler to `TOOL_HANDLERS` (after `review_changes`):

```typescript
  review_changes: handleReviewChanges as ToolHandler,
  detect_anomalies: handleDetectAnomalies as ToolHandler,
```

5. Run: `harness validate`
6. Commit: `feat(mcp): register detect_anomalies in server tool registry`

### Task 3: Create integration test

**Depends on:** Task 1
**Files:** `packages/mcp-server/tests/tools/graph-anomaly.test.ts`

1. Create `packages/mcp-server/tests/tools/graph-anomaly.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs/promises';
import { handleDetectAnomalies, detectAnomaliesDefinition } from '../../src/tools/graph.js';

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

  // Function nodes with varying cyclomatic complexity (one outlier)
  store.addNode({
    id: 'fn:simple1',
    type: 'function',
    name: 'simple1',
    path: 'a.ts',
    metadata: { cyclomaticComplexity: 2 },
  });
  store.addNode({
    id: 'fn:simple2',
    type: 'function',
    name: 'simple2',
    path: 'b.ts',
    metadata: { cyclomaticComplexity: 3 },
  });
  store.addNode({
    id: 'fn:simple3',
    type: 'function',
    name: 'simple3',
    path: 'c.ts',
    metadata: { cyclomaticComplexity: 2 },
  });
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
```

2. Run test: `npx vitest run packages/mcp-server/tests/tools/graph-anomaly.test.ts`
3. Observe: all tests pass (handler delegates to the already-tested adapter)
4. Run: `harness validate`
5. Commit: `test(mcp): add integration tests for detect_anomalies tool`

### Task 4: Update tool count in server tests

**Depends on:** Task 2
**Files:** `packages/mcp-server/tests/server-integration.test.ts`, `packages/mcp-server/tests/server.test.ts`

1. Open `packages/mcp-server/tests/server-integration.test.ts`.
2. Add `expect(names).toContain('detect_anomalies');` after the line `expect(names).toContain('review_changes');` (line 41).
3. Change `expect(tools).toHaveLength(40);` to `expect(tools).toHaveLength(41);` (line 42).

4. Open `packages/mcp-server/tests/server.test.ts`.
5. Change `expect(tools).toHaveLength(40);` to `expect(tools).toHaveLength(41);` (line 12).

6. Run: `npx vitest run packages/mcp-server/tests/server-integration.test.ts packages/mcp-server/tests/server.test.ts`
7. Observe: all tests pass
8. Run: `harness validate`
9. Commit: `test(mcp): update tool count to 41 for detect_anomalies`

## Traceability

| Observable Truth                         | Delivered by                                                                                             |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 1. Returns JSON with all report sections | Task 1 (handler), Task 3 (test: "returns anomaly report with all sections")                              |
| 2. Passes threshold/metrics to adapter   | Task 1 (handler), Task 3 (tests: "passes custom threshold", "passes custom metrics")                     |
| 3. Returns error when graph unavailable  | Task 1 (handler reuses `graphNotFoundError()`), Task 3 (test: "returns error when graph does not exist") |
| 4. Returns error on unexpected throw     | Task 1 (try/catch in handler)                                                                            |
| 5. Tool appears in definitions/handlers  | Task 2 (server registration)                                                                             |
| 6. Integration tests pass                | Task 3                                                                                                   |
| 7. server-integration.test.ts passes     | Task 4                                                                                                   |
| 8. server.test.ts passes                 | Task 4                                                                                                   |
| 9. harness validate passes               | Every task                                                                                               |
