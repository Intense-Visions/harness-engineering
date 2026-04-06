# Cascading Failure Simulation

**Keywords:** cascade, blast-radius, probabilistic-BFS, failure-propagation, edge-weight, change-frequency, coupling, graph-traversal, risk-scoring

## Overview

Probabilistic BFS traversal over the knowledge graph that simulates how a failure in one node cascades through transitive dependencies. Unlike `get_impact` (which returns all nodes within depth N equally), this tool assigns cumulative failure probability to each affected node by blending edge type, change frequency, and coupling strength into per-edge weights. The result answers: "If this file breaks, what's the probability it takes down each downstream dependency — and through what chain?"

### Goals

1. New `CascadeSimulator` class in `packages/graph` implementing probability-weighted BFS with lazy edge weight computation via a pluggable `ProbabilityStrategy` interface
2. Default `CompositeProbabilityStrategy` blending edge type base weight, normalized change frequency, and normalized coupling strength
3. Dual-view result: layered cascade chain (grouped by depth with per-node cumulative probability) + flat ranked summary (sorted by probability, grouped by category)
4. Termination via probability floor (default 0.05) + depth cap (default 10)
5. New `compute_blast_radius` MCP tool exposing the simulator
6. NLQ integration — "blast radius" queries already classified as impact intent; route to the new tool when probabilistic mode is requested

### Non-Goals

- Runtime failure detection or monitoring
- Automated remediation or fix suggestions
- Modifying ContextQL's existing interface
- Monte Carlo or stochastic simulation
- Real-time failure alerting

## Assumptions

- **Populated knowledge graph required.** Run `harness ingest` before using `compute_blast_radius`. If change frequency data is unavailable (no git history ingested), `CompositeProbabilityStrategy` falls back to edge-type-only weights (changeFreq=0, coupling=0). If the graph store is missing, return `graphNotFoundError()` consistent with other graph tools.
- **Source node must exist in graph.** If the source file/nodeId is not found, return an error: "Node not found: \<identifier\>. Ensure the file has been ingested." Consistent with `get_impact` error handling.

## Decisions

| #   | Decision                                                                                             | Rationale                                                                                                                                                                                                                                                   |
| --- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Composite signal for edge probability** — blend change frequency, coupling strength, and edge type | Uses all available graph data; ConflictPredictor validates the composite approach; single-signal alternatives lose meaningful information                                                                                                                   |
| 2   | **Probability threshold (0.05) + max depth cap (10)** for termination                                | Probability threshold handles 95% of cases; depth cap is a safety net for pathological graphs (utility files imported everywhere); both parameters have analogues in existing codebase                                                                      |
| 3   | **Dual-view result** — layered cascade chain + flat ranked summary                                   | Cascade chain answers "why is Z at risk?" (core value prop); flat list enables CI integration and quick scans; impact-preview established the compact/detailed pattern                                                                                      |
| 4   | **Standalone CascadeSimulator** — separate from ContextQL                                            | ContextQL is a general-purpose query engine with 5+ consumers; cascade simulation has different semantics (cumulative probability, probability-based termination, layered grouping); GraphAnomalyAdapter sets precedent for standalone traversal algorithms |
| 5   | **Lazy edge weight computation via ProbabilityStrategy interface**                                   | Most cascades touch <20% of the graph; precomputing all weights is wasteful; strategy interface enables testability (mock strategy, test BFS) and future extensibility at no cost                                                                           |

## Technical Design

### Data Structures

#### Probability Strategy

```typescript
interface ProbabilityStrategy {
  /** Compute failure propagation probability for a single edge (0..1) */
  getEdgeProbability(edge: GraphEdge, fromNode: GraphNode, toNode: GraphNode): number;
}

class CompositeProbabilityStrategy implements ProbabilityStrategy {
  static BASE_WEIGHTS: Record<string, number> = {
    imports: 0.7,
    calls: 0.5,
    implements: 0.6,
    inherits: 0.6,
    co_changes_with: 0.4,
    references: 0.2,
    contains: 0.3,
  };

  constructor(
    private changeFreqMap: Map<string, number>, // nodeId → normalized 0..1
    private couplingMap: Map<string, number> // nodeId → normalized 0..1
  ) {}

  getEdgeProbability(edge: GraphEdge, _from: GraphNode, toNode: GraphNode): number {
    const base = CompositeProbabilityStrategy.BASE_WEIGHTS[edge.type] ?? 0.1;
    const changeFreq = this.changeFreqMap.get(toNode.id) ?? 0;
    const coupling = this.couplingMap.get(toNode.id) ?? 0;
    // Weighted blend: 50% edge type, 30% change frequency, 20% coupling
    return Math.min(1, base * 0.5 + changeFreq * 0.3 + coupling * 0.2);
  }
}
```

#### Simulation Options

```typescript
interface CascadeSimulationOptions {
  probabilityFloor?: number; // default 0.05
  maxDepth?: number; // default 10
  edgeTypes?: string[]; // filter to specific edge types; default: all
  strategy?: ProbabilityStrategy; // default: CompositeProbabilityStrategy
}
```

#### Result Structures

```typescript
interface CascadeNode {
  nodeId: string;
  name: string;
  path?: string;
  type: string; // node type (file, module, class, etc.)
  cumulativeProbability: number; // product of probabilities along the path
  depth: number;
  incomingEdge: string; // edge type that propagated failure to this node
  parentId: string; // node that propagated failure
}

interface CascadeLayer {
  depth: number;
  nodes: CascadeNode[];
  categoryBreakdown: {
    code: number;
    tests: number;
    docs: number;
    other: number;
  };
}

interface CascadeResult {
  sourceNodeId: string;
  sourceName: string;
  layers: CascadeLayer[]; // grouped by cascade depth
  flatSummary: CascadeNode[]; // all nodes sorted by probability desc
  summary: {
    totalAffected: number;
    maxDepthReached: number;
    highRisk: number; // probability >= 0.5
    mediumRisk: number; // 0.2 <= probability < 0.5
    lowRisk: number; // probability < 0.2
    categoryBreakdown: {
      code: number;
      tests: number;
      docs: number;
      other: number;
    };
    amplificationPoints: string[]; // nodes with fanOut > 3 in the cascade
  };
}
```

### Algorithm: CascadeSimulator.simulate()

```
1. Resolve source node from GraphStore
2. Load change frequency data (GraphComplexityAdapter.computeComplexityHotspots())
   → extract hotspots[].changeFrequency, normalize to 0..1 using max-normalization
3. Load coupling data (GraphCouplingAdapter.computeCouplingData())
   → extract files[].fanIn + files[].fanOut, normalize to 0..1 using max-normalization
4. Instantiate CompositeProbabilityStrategy (or use provided strategy)
5. BFS:
   - Initialize queue with [(sourceNode, probability=1.0, depth=0, path=[])]
   - visited: Map<nodeId, highestCumulativeProbability>
   - For each (node, cumProb, depth, path) dequeued:
     a. If cumProb < probabilityFloor → skip (prune)
     b. If depth > maxDepth → skip (cap)
     c. For each outgoing edge from node:
        - edgeProb = strategy.getEdgeProbability(edge, node, targetNode)
        - newCumProb = cumProb * edgeProb
        - If target already visited with higher probability → skip
        - Otherwise: update visited, enqueue (target, newCumProb, depth+1, path+[node])
        - Record CascadeNode in the appropriate layer
6. Build CascadeLayer[] from depth-grouped results
7. Build flatSummary by sorting all CascadeNodes by cumulativeProbability desc
8. Compute summary stats (risk buckets, category breakdown, amplification points)
9. Return CascadeResult
```

### File Layout

```
packages/graph/src/blast-radius/
  CascadeSimulator.ts              # BFS engine
  CompositeProbabilityStrategy.ts  # default strategy
  types.ts                         # interfaces
  index.ts                         # barrel export

packages/graph/tests/blast-radius/
  CascadeSimulator.test.ts
  CompositeProbabilityStrategy.test.ts

packages/cli/src/mcp/tools/graph/
  compute-blast-radius.ts          # MCP tool definition + handler
```

### MCP Tool: compute_blast_radius

```typescript
// Input schema
{
  path: string;                // project root (required)
  file?: string;               // file path to simulate failure for
  nodeId?: string;             // or node ID directly
  probabilityFloor?: number;   // default 0.05
  maxDepth?: number;           // default 10
  mode?: 'compact' | 'detailed';  // default 'compact'
}

// compact mode: summary + flat top-10
// detailed mode: full layered cascade chain
```

### NLQ Integration

The `IntentClassifier` already maps "blast radius" to the `impact` intent. The enhancement:

- When the NLQ orchestrator detects "blast radius" or "cascade" in the query, it routes to `compute_blast_radius` instead of `get_impact`
- No changes to IntentClassifier needed — just a routing decision in the orchestrator

## Success Criteria

1. `CascadeSimulator.simulate(sourceNodeId)` returns a `CascadeResult` with layered cascade chain and flat summary for any valid node in the graph
2. Cumulative probability decays monotonically along each path — no node has higher probability than its parent in the cascade chain
3. Termination is bounded — BFS stops when cumulative probability drops below floor (default 0.05) OR depth exceeds cap (default 10), whichever comes first
4. When a node is reachable via multiple paths, the highest cumulative probability wins — no double-counting, no dropped paths
5. `CompositeProbabilityStrategy` blends three signals — edge type base weight (50%), normalized change frequency (30%), normalized coupling (20%) — and returns values in 0..1
6. `ProbabilityStrategy` is pluggable — a custom strategy can be injected and the simulator uses it without modification
7. `compute_blast_radius` MCP tool is registered, accepts file path or nodeId, returns compact or detailed output
8. Compact mode returns summary stats + top 10 highest-risk nodes; detailed mode returns full layered cascade chain
9. Amplification points are identified — nodes in the cascade with fanOut > 3 are surfaced in `summary.amplificationPoints`
10. Risk bucketing — nodes are classified as high (>=0.5), medium (0.2-0.5), low (<0.2) in the summary
11. Category breakdown at each layer and in the summary — code, tests, docs, other — using the same grouping logic as `groupNodesByImpact`
12. NLQ queries containing "blast radius" or "cascade" route to `compute_blast_radius` instead of `get_impact`

## Implementation Order

### Phase 1: Core Types & Strategy (foundation)

- Define `ProbabilityStrategy` interface, `CascadeSimulationOptions`, `CascadeNode`, `CascadeLayer`, `CascadeResult` types
- Implement `CompositeProbabilityStrategy` with base weights, change frequency, and coupling normalization
- Unit tests for strategy probability calculations

### Phase 2: CascadeSimulator Engine (core algorithm)

- Implement probability-weighted BFS with lazy edge weight computation
- Termination via probability floor + depth cap
- Multi-path handling (keep highest cumulative probability)
- Layer grouping, flat summary generation, summary stats (risk buckets, amplification points, category breakdown)
- Unit tests: simple chain, diamond graph, fan-out hub, cycle handling, termination at floor, termination at depth cap

### Phase 3: MCP Tool & NLQ Integration (user-facing)

- `compute_blast_radius` MCP tool definition + handler following existing pattern
- Register in server.ts (definition + handler)
- NLQ routing: "blast radius" / "cascade" queries → `compute_blast_radius`
- Integration tests with a realistic graph fixture

Three phases, each independently testable. Phase 1 has no dependencies. Phase 2 depends on Phase 1. Phase 3 depends on Phase 2.
