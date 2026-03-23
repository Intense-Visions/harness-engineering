# Graph Anomaly Detection

**Status:** proposed
**Created:** 2026-03-22
**Keywords:** anomaly, z-score, outlier, articulation-point, graph, coupling, complexity, structural-risk

## Overview

Graph Anomaly Detection adds a `detect_anomalies` MCP tool that identifies structural risk in a codebase through two complementary analyses: statistical outlier detection (Z-scores across key metrics) and topological vulnerability detection (articulation points on the import graph). The tool produces a unified structural risk report that surfaces the nodes most likely to cause problems — either because their metrics are abnormally high or because their removal would disconnect the dependency graph.

### Goals

1. Surface statistically unusual code (functions/files whose metrics deviate significantly from the codebase norm)
2. Identify structural single points of failure (modules whose removal would fragment the import graph)
3. Highlight nodes flagged by both analyses as highest-priority risks
4. Provide actionable output that agents and humans can triage without needing to understand the underlying algorithms

### Non-Goals

- Time-series trending (→ Architecture Decay Timeline roadmap item)
- Predictive analysis (→ Predictive Architecture Failure roadmap item)
- Module boundary discovery (→ Community Detection roadmap item)
- Performance-critical path identification (→ existing `get_critical_paths` tool)

## Decisions

| #   | Decision                                                                                                   | Rationale                                                                                                                   |
| --- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| 1   | Single `detect_anomalies` tool, always runs both analyses                                                  | Callers shouldn't need to know the difference between statistical and topological analysis — they just want "what's risky?" |
| 2   | Z-score threshold default 2.0, optional `threshold` param                                                  | Standard statistical threshold with escape hatch if the default is wrong for a given codebase                               |
| 3   | Two sections + `overlapping` cross-reference in output                                                     | Avoids a fake unified severity score while still surfacing the highest-value insight (nodes flagged by both)                |
| 4   | Five curated default metrics: `cyclomaticComplexity`, `fanIn`, `fanOut`, `hotspotScore`, `transitiveDepth` | Covers distinct risk dimensions without correlated noise. Optional `metrics` param for full list                            |
| 5   | Articulation points on `imports` edges only                                                                | Import graph is deterministic and file-scoped — the right layer for structural single-point-of-failure analysis             |
| 6   | Graph Adapter pattern (`GraphAnomalyAdapter`)                                                              | Follows established architecture. Adapters own computation, MCP tools own presentation                                      |

## Technical Design

### Data Structures

**`GraphAnomalyAdapter`** in `packages/graph/src/entropy/GraphAnomalyAdapter.ts`:

```typescript
interface AnomalyDetectionOptions {
  threshold?: number; // Z-score threshold, default 2.0 (clamped if <= 0)
  metrics?: string[]; // Metric names to analyze, defaults to curated five
}

interface StatisticalOutlier {
  nodeId: string;
  nodeName: string;
  nodePath?: string;
  nodeType: string; // 'function' | 'file' etc.
  metric: string; // e.g. 'cyclomaticComplexity'
  value: number; // actual value
  zScore: number; // how many stddevs from mean
  mean: number; // population mean for context
  stdDev: number; // population stddev for context
}

interface ArticulationPoint {
  nodeId: string;
  nodeName: string;
  nodePath?: string;
  componentsIfRemoved: number; // how many disconnected subgraphs result
  dependentCount: number; // nodes that would lose connectivity
}

interface AnomalyReport {
  statisticalOutliers: StatisticalOutlier[]; // sorted by zScore desc
  articulationPoints: ArticulationPoint[]; // sorted by dependentCount desc
  overlapping: string[]; // nodeIds in both
  summary: {
    totalNodesAnalyzed: number;
    outlierCount: number;
    articulationPointCount: number;
    overlapCount: number;
    metricsAnalyzed: string[];
    warnings: string[]; // e.g. unrecognized metric names
    threshold: number;
  };
}
```

### Algorithms

#### Z-Score Computation

1. Gather metric values from their authoritative sources:
   - `cyclomaticComplexity`: read directly from function/method node `metadata.cyclomaticComplexity`
   - `fanIn`, `fanOut`, `transitiveDepth`: call `GraphCouplingAdapter.computeCouplingData()` to get per-file values
   - `hotspotScore`: call `GraphComplexityAdapter.computeComplexityHotspots()` to get per-function values
2. For each metric, collect values across all nodes, compute mean and standard deviation
3. If `threshold` is <= 0, clamp to the default value of 2.0
4. Flag nodes where `|value - mean| / stdDev > threshold`
5. Skip metrics where stdDev is 0 (all values identical)
6. Skip unrecognized metric names and include them in `summary.warnings`
7. A node can appear multiple times if it's an outlier on multiple metrics — that's useful signal

#### Articulation Point Detection (Tarjan's Algorithm)

1. Build adjacency list from `imports` edges (undirected — both import directions count)
2. DFS with discovery time and low-link tracking
3. Root is articulation point if it has 2+ DFS children
4. Non-root is articulation point if any child's low-link >= parent's discovery time
5. For each articulation point, compute `componentsIfRemoved` via BFS on the graph with that node deleted, and `dependentCount` as total nodes in the smaller resulting components

#### Overlap Computation

Set intersection of node IDs from statistical outliers and articulation points.

### File Layout

| File                                                     | Purpose                                          |
| -------------------------------------------------------- | ------------------------------------------------ |
| `packages/graph/src/entropy/GraphAnomalyAdapter.ts`      | Adapter class with `detect()` method             |
| `packages/graph/src/entropy/GraphAnomalyAdapter.test.ts` | Unit tests with synthetic graphs                 |
| `packages/mcp-server/src/tools/graph.ts`                 | New `detect_anomalies` tool definition + handler |
| `packages/mcp-server/tests/tools/graph-anomaly.test.ts`  | Integration test for MCP tool                    |

### MCP Tool Schema

```typescript
{
  name: 'detect_anomalies',
  description: 'Detect structural anomalies — statistical outliers across code metrics and topological single points of failure in the import graph',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Path to project root' },
      threshold: { type: 'number', description: 'Z-score threshold (default 2.0)' },
      metrics: {
        type: 'array',
        items: { type: 'string' },
        description: 'Metrics to analyze (default: cyclomaticComplexity, fanIn, fanOut, hotspotScore, transitiveDepth)'
      }
    },
    required: ['path']
  }
}
```

## Success Criteria

1. When the `detect_anomalies` tool is called, the system shall return an `AnomalyReport` containing `statisticalOutliers`, `articulationPoints`, `overlapping`, and `summary` sections.
2. When a node's metric Z-score exceeds the threshold, the system shall include it in `statisticalOutliers` with correct `zScore`, `mean`, and `stdDev` values.
3. When a node's metric Z-score is below the threshold, the system shall not include it in `statisticalOutliers`.
4. When a node is a true articulation point on the `imports` graph, the system shall include it in `articulationPoints` with correct `componentsIfRemoved` and `dependentCount`.
5. When a node appears in both `statisticalOutliers` and `articulationPoints`, the system shall include its ID in the `overlapping` array.
6. When a metric has zero standard deviation across all nodes, the system shall skip that metric without error.
7. When the graph has fewer than 3 nodes of a given type, the system shall return empty results for that type without error.
8. When `metrics` parameter is omitted, the system shall analyze the five curated defaults: `cyclomaticComplexity`, `fanIn`, `fanOut`, `hotspotScore`, `transitiveDepth`.
9. When custom `threshold` or `metrics` parameters are provided, the system shall use those values instead of defaults.
10. The system shall sort `statisticalOutliers` by `zScore` descending and `articulationPoints` by `dependentCount` descending.
11. If the graph store is unavailable or empty, the system shall return an empty `AnomalyReport` with a summary indicating zero nodes analyzed.
12. When the `metrics` parameter contains an unrecognized metric name, the system shall skip that metric and include it in `summary.warnings`.
13. When the `threshold` parameter is zero or negative, the system shall clamp it to the default value of 2.0.

## Implementation Order

1. **GraphAnomalyAdapter** — Z-score computation + Tarjan's algorithm + overlap merge + unit tests with synthetic graphs
2. **MCP tool wiring** — tool definition, handler calling the adapter, integration test
3. **Export plumbing** — ensure adapter is exported from the graph package barrel files
