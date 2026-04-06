# Plan: Cascading Failure Simulation -- Phase 2: CascadeSimulator Engine

**Date:** 2026-04-06
**Spec:** docs/changes/cascading-failure-simulation/proposal.md
**Estimated tasks:** 7
**Estimated time:** 30 minutes

## Goal

Implement the `CascadeSimulator` class that performs probability-weighted BFS over the knowledge graph, producing layered cascade chains and flat ranked summaries with risk bucketing, amplification point detection, and category breakdowns.

## Observable Truths (Acceptance Criteria)

1. When `CascadeSimulator.simulate("file:a")` is called on a simple chain A->B->C with `imports` edges and empty changeFreq/coupling maps, the system shall return a `CascadeResult` where `flatSummary[0].cumulativeProbability` equals 0.35 (depth 1) and `flatSummary[1].cumulativeProbability` equals `0.35 * 0.35 = 0.1225` (depth 2).
2. When a diamond graph has paths A->B->D and A->C->D with different edge types, the system shall keep only the highest cumulative probability for node D and `flatSummary` shall contain D exactly once.
3. When a node has outgoing edges to 4+ nodes in the cascade, the system shall include that node's ID in `summary.amplificationPoints`.
4. When the graph contains a cycle (A->B->A), the system shall not loop infinitely and shall terminate with a valid `CascadeResult`.
5. When cumulative probability drops below `probabilityFloor` (default 0.05), the system shall not enqueue that node for further traversal.
6. When BFS depth exceeds `maxDepth` (default 10), the system shall not traverse further regardless of probability.
7. `CascadeResult.layers` groups nodes by depth, and each `CascadeLayer.categoryBreakdown` counts code/tests/docs/other using the same type classification as `groupNodesByImpact`.
8. `CascadeResult.flatSummary` is sorted by `cumulativeProbability` descending.
9. `CascadeResult.summary` contains correct `highRisk` (>=0.5), `mediumRisk` (0.2 to <0.5), and `lowRisk` (<0.2) counts.
10. When `CascadeSimulationOptions.strategy` is provided, the system shall use it instead of constructing a `CompositeProbabilityStrategy`.
11. When `CascadeSimulationOptions.edgeTypes` is provided, the system shall only traverse edges of those types.
12. When the source node does not exist in the graph, `simulate()` throws an error with message matching "Node not found".
13. `packages/graph/src/blast-radius/index.ts` exports `CascadeSimulator`.
14. `npx vitest run packages/graph/tests/blast-radius/CascadeSimulator.test.ts` passes with all tests green.
15. `harness validate` passes after all tasks are complete.

## File Map

- CREATE `packages/graph/src/blast-radius/CascadeSimulator.ts`
- CREATE `packages/graph/tests/blast-radius/CascadeSimulator.test.ts`
- MODIFY `packages/graph/src/blast-radius/index.ts` (add CascadeSimulator export)

_Skeleton not produced -- task count (7) below threshold (8)._

## Tasks

### Task 1: Scaffold CascadeSimulator class with source node resolution and error handling

**Depends on:** none (Phase 1 complete)
**Files:** `packages/graph/src/blast-radius/CascadeSimulator.ts`, `packages/graph/tests/blast-radius/CascadeSimulator.test.ts`

1. Create test file `packages/graph/tests/blast-radius/CascadeSimulator.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { GraphStore } from '../../src/store/GraphStore';
import { CascadeSimulator } from '../../src/blast-radius/CascadeSimulator';
import type { GraphNode, GraphEdge } from '../../src/types';

function makeNode(id: string, overrides?: Partial<GraphNode>): GraphNode {
  return {
    id,
    type: 'file',
    name: id.replace('file:', ''),
    path: `src/${id.replace('file:', '')}`,
    metadata: {},
    ...overrides,
  };
}

function makeEdge(from: string, to: string, type: string): GraphEdge {
  return { from, to, type } as GraphEdge;
}

describe('CascadeSimulator', () => {
  describe('source node resolution', () => {
    it('throws when source node does not exist', () => {
      const store = new GraphStore();
      const sim = new CascadeSimulator(store);
      expect(() => sim.simulate('file:nonexistent')).toThrow('Node not found');
    });

    it('returns a CascadeResult with empty layers for an isolated node', () => {
      const store = new GraphStore();
      store.addNode(makeNode('file:a'));
      const sim = new CascadeSimulator(store);
      const result = sim.simulate('file:a');
      expect(result.sourceNodeId).toBe('file:a');
      expect(result.sourceName).toBe('a');
      expect(result.layers).toEqual([]);
      expect(result.flatSummary).toEqual([]);
      expect(result.summary.totalAffected).toBe(0);
      expect(result.summary.maxDepthReached).toBe(0);
    });
  });
});
```

2. Run test from packages/graph: `npx vitest run tests/blast-radius/CascadeSimulator.test.ts`
3. Observe failure: `CascadeSimulator` is not found / cannot be imported.
4. Create `packages/graph/src/blast-radius/CascadeSimulator.ts`:

```typescript
import type { GraphStore } from '../store/GraphStore.js';
import type {
  CascadeSimulationOptions,
  CascadeResult,
  CascadeNode,
  CascadeLayer,
  ProbabilityStrategy,
} from './types.js';

const DEFAULT_PROBABILITY_FLOOR = 0.05;
const DEFAULT_MAX_DEPTH = 10;

export class CascadeSimulator {
  constructor(private readonly store: GraphStore) {}

  simulate(sourceNodeId: string, options: CascadeSimulationOptions = {}): CascadeResult {
    const sourceNode = this.store.getNode(sourceNodeId);
    if (!sourceNode) {
      throw new Error(`Node not found: ${sourceNodeId}. Ensure the file has been ingested.`);
    }

    // Placeholder: return empty result for now; BFS added in Task 2
    return {
      sourceNodeId,
      sourceName: sourceNode.name,
      layers: [],
      flatSummary: [],
      summary: {
        totalAffected: 0,
        maxDepthReached: 0,
        highRisk: 0,
        mediumRisk: 0,
        lowRisk: 0,
        categoryBreakdown: { code: 0, tests: 0, docs: 0, other: 0 },
        amplificationPoints: [],
      },
    };
  }
}
```

5. Run test: `npx vitest run tests/blast-radius/CascadeSimulator.test.ts`
6. Observe: both tests pass.
7. Run: `harness validate`
8. Commit: `feat(blast-radius): scaffold CascadeSimulator with source node resolution`

---

### Task 2: Implement core BFS traversal with probability propagation

**Depends on:** Task 1
**Files:** `packages/graph/src/blast-radius/CascadeSimulator.ts`, `packages/graph/tests/blast-radius/CascadeSimulator.test.ts`

1. Add test to `CascadeSimulator.test.ts` inside the existing `describe('CascadeSimulator', ...)`:

```typescript
describe('simple chain traversal', () => {
  it('propagates probability through A -> B -> C chain', () => {
    const store = new GraphStore();
    store.addNode(makeNode('file:a'));
    store.addNode(makeNode('file:b'));
    store.addNode(makeNode('file:c'));
    store.addEdge(makeEdge('file:a', 'file:b', 'imports'));
    store.addEdge(makeEdge('file:b', 'file:c', 'imports'));

    const sim = new CascadeSimulator(store);
    // No changeFreq/coupling data → imports base=0.7, edgeProb = 0.7*0.5 = 0.35
    const result = sim.simulate('file:a');

    expect(result.flatSummary).toHaveLength(2);
    // Sorted by probability desc: B first (0.35), C second (0.35*0.35=0.1225)
    expect(result.flatSummary[0].nodeId).toBe('file:b');
    expect(result.flatSummary[0].cumulativeProbability).toBeCloseTo(0.35, 10);
    expect(result.flatSummary[0].depth).toBe(1);
    expect(result.flatSummary[0].incomingEdge).toBe('imports');
    expect(result.flatSummary[0].parentId).toBe('file:a');

    expect(result.flatSummary[1].nodeId).toBe('file:c');
    expect(result.flatSummary[1].cumulativeProbability).toBeCloseTo(0.1225, 10);
    expect(result.flatSummary[1].depth).toBe(2);
  });

  it('uses a custom strategy when provided', () => {
    const store = new GraphStore();
    store.addNode(makeNode('file:a'));
    store.addNode(makeNode('file:b'));
    store.addEdge(makeEdge('file:a', 'file:b', 'imports'));

    const mockStrategy = {
      getEdgeProbability: () => 0.9,
    };

    const sim = new CascadeSimulator(store);
    const result = sim.simulate('file:a', { strategy: mockStrategy });

    expect(result.flatSummary[0].cumulativeProbability).toBeCloseTo(0.9, 10);
  });

  it('filters edges when edgeTypes option is provided', () => {
    const store = new GraphStore();
    store.addNode(makeNode('file:a'));
    store.addNode(makeNode('file:b'));
    store.addNode(makeNode('file:c'));
    store.addEdge(makeEdge('file:a', 'file:b', 'imports'));
    store.addEdge(makeEdge('file:a', 'file:c', 'calls'));

    const sim = new CascadeSimulator(store);
    const result = sim.simulate('file:a', { edgeTypes: ['imports'] });

    expect(result.flatSummary).toHaveLength(1);
    expect(result.flatSummary[0].nodeId).toBe('file:b');
  });
});
```

2. Run test: `cd packages/graph && npx vitest run tests/blast-radius/CascadeSimulator.test.ts`
3. Observe failure: simple chain test fails because BFS is not yet implemented.
4. Replace the placeholder in `CascadeSimulator.simulate()` with the full BFS implementation. Update `packages/graph/src/blast-radius/CascadeSimulator.ts`:

```typescript
import type { GraphStore } from '../store/GraphStore.js';
import type { GraphNode } from '../types.js';
import type {
  CascadeSimulationOptions,
  CascadeResult,
  CascadeNode,
  CascadeLayer,
  ProbabilityStrategy,
} from './types.js';
import { CompositeProbabilityStrategy } from './CompositeProbabilityStrategy.js';

const DEFAULT_PROBABILITY_FLOOR = 0.05;
const DEFAULT_MAX_DEPTH = 10;

// Category classification matching groupNodesByImpact
const TEST_TYPES: ReadonlySet<string> = new Set(['test_result']);
const DOC_TYPES: ReadonlySet<string> = new Set(['adr', 'decision', 'document', 'learning']);
const CODE_TYPES: ReadonlySet<string> = new Set([
  'file',
  'module',
  'class',
  'interface',
  'function',
  'method',
  'variable',
]);

function classifyNode(node: GraphNode): 'tests' | 'docs' | 'code' | 'other' {
  if (TEST_TYPES.has(node.type)) return 'tests';
  if (DOC_TYPES.has(node.type)) return 'docs';
  if (CODE_TYPES.has(node.type)) return 'code';
  return 'other';
}

export class CascadeSimulator {
  constructor(private readonly store: GraphStore) {}

  simulate(sourceNodeId: string, options: CascadeSimulationOptions = {}): CascadeResult {
    const sourceNode = this.store.getNode(sourceNodeId);
    if (!sourceNode) {
      throw new Error(`Node not found: ${sourceNodeId}. Ensure the file has been ingested.`);
    }

    const probabilityFloor = options.probabilityFloor ?? DEFAULT_PROBABILITY_FLOOR;
    const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
    const edgeTypeFilter = options.edgeTypes ? new Set(options.edgeTypes) : null;
    const strategy = options.strategy ?? this.buildDefaultStrategy();

    // BFS state
    // visited maps nodeId -> best CascadeNode (highest cumulative probability)
    const visited = new Map<string, CascadeNode>();
    // Queue: [nodeId, cumulativeProbability, depth, parentId, incomingEdge]
    const queue: Array<{
      nodeId: string;
      cumProb: number;
      depth: number;
      parentId: string;
      incomingEdge: string;
    }> = [];

    // Seed: get outgoing edges from source
    const sourceEdges = this.store.getEdges({ from: sourceNodeId });
    for (const edge of sourceEdges) {
      if (edgeTypeFilter && !edgeTypeFilter.has(edge.type)) continue;
      const targetNode = this.store.getNode(edge.to);
      if (!targetNode) continue;
      const edgeProb = strategy.getEdgeProbability(edge, sourceNode, targetNode);
      const cumProb = edgeProb; // 1.0 * edgeProb
      if (cumProb < probabilityFloor) continue;
      queue.push({
        nodeId: edge.to,
        cumProb,
        depth: 1,
        parentId: sourceNodeId,
        incomingEdge: edge.type,
      });
    }

    // Track fan-out per node in the cascade for amplification detection
    const fanOutCount = new Map<string, number>();
    // Count source node fan-out
    fanOutCount.set(
      sourceNodeId,
      sourceEdges.filter((e) => !edgeTypeFilter || edgeTypeFilter.has(e.type)).length
    );

    let head = 0;
    while (head < queue.length) {
      const entry = queue[head++]!;
      const { nodeId, cumProb, depth, parentId, incomingEdge } = entry;

      // Multi-path: skip if we already found a higher-probability path
      const existing = visited.get(nodeId);
      if (existing && existing.cumulativeProbability >= cumProb) continue;

      const targetNode = this.store.getNode(nodeId);
      if (!targetNode) continue;

      const cascadeNode: CascadeNode = {
        nodeId,
        name: targetNode.name,
        path: targetNode.path,
        type: targetNode.type,
        cumulativeProbability: cumProb,
        depth,
        incomingEdge,
        parentId,
      };
      visited.set(nodeId, cascadeNode);

      // Expand if within depth cap
      if (depth < maxDepth) {
        const outEdges = this.store.getEdges({ from: nodeId });
        let childCount = 0;
        for (const edge of outEdges) {
          if (edgeTypeFilter && !edgeTypeFilter.has(edge.type)) continue;
          if (edge.to === sourceNodeId) continue; // skip back-edge to source
          const childNode = this.store.getNode(edge.to);
          if (!childNode) continue;
          const edgeProb = strategy.getEdgeProbability(edge, targetNode, childNode);
          const newCumProb = cumProb * edgeProb;
          if (newCumProb < probabilityFloor) continue;
          childCount++;
          queue.push({
            nodeId: edge.to,
            cumProb: newCumProb,
            depth: depth + 1,
            parentId: nodeId,
            incomingEdge: edge.type,
          });
        }
        fanOutCount.set(nodeId, (fanOutCount.get(nodeId) ?? 0) + childCount);
      }
    }

    // Build layers and flat summary from visited
    return this.buildResult(sourceNodeId, sourceNode.name, visited, fanOutCount);
  }

  private buildDefaultStrategy(): ProbabilityStrategy {
    // Default with empty maps -- no changeFreq/coupling data
    return new CompositeProbabilityStrategy(new Map(), new Map());
  }

  private buildResult(
    sourceNodeId: string,
    sourceName: string,
    visited: Map<string, CascadeNode>,
    fanOutCount: Map<string, number>
  ): CascadeResult {
    if (visited.size === 0) {
      return {
        sourceNodeId,
        sourceName,
        layers: [],
        flatSummary: [],
        summary: {
          totalAffected: 0,
          maxDepthReached: 0,
          highRisk: 0,
          mediumRisk: 0,
          lowRisk: 0,
          categoryBreakdown: { code: 0, tests: 0, docs: 0, other: 0 },
          amplificationPoints: [],
        },
      };
    }

    const allNodes = Array.from(visited.values());

    // Flat summary: sorted by probability desc
    const flatSummary = [...allNodes].sort(
      (a, b) => b.cumulativeProbability - a.cumulativeProbability
    );

    // Group by depth for layers
    const depthMap = new Map<number, CascadeNode[]>();
    for (const node of allNodes) {
      let list = depthMap.get(node.depth);
      if (!list) {
        list = [];
        depthMap.set(node.depth, list);
      }
      list.push(node);
    }

    const layers: CascadeLayer[] = [];
    const depths = Array.from(depthMap.keys()).sort((a, b) => a - b);
    for (const depth of depths) {
      const nodes = depthMap.get(depth)!;
      const breakdown = { code: 0, tests: 0, docs: 0, other: 0 };
      for (const n of nodes) {
        const graphNode = this.store.getNode(n.nodeId);
        if (graphNode) {
          breakdown[classifyNode(graphNode)]++;
        }
      }
      layers.push({ depth, nodes, categoryBreakdown: breakdown });
    }

    // Summary stats
    let highRisk = 0;
    let mediumRisk = 0;
    let lowRisk = 0;
    const catBreakdown = { code: 0, tests: 0, docs: 0, other: 0 };

    for (const node of allNodes) {
      if (node.cumulativeProbability >= 0.5) highRisk++;
      else if (node.cumulativeProbability >= 0.2) mediumRisk++;
      else lowRisk++;

      const graphNode = this.store.getNode(node.nodeId);
      if (graphNode) {
        catBreakdown[classifyNode(graphNode)]++;
      }
    }

    // Amplification points: nodes with fan-out > 3 in the cascade
    const amplificationPoints: string[] = [];
    for (const [nodeId, count] of fanOutCount) {
      if (count > 3) {
        amplificationPoints.push(nodeId);
      }
    }

    const maxDepthReached = allNodes.reduce((max, n) => Math.max(max, n.depth), 0);

    return {
      sourceNodeId,
      sourceName,
      layers,
      flatSummary,
      summary: {
        totalAffected: allNodes.length,
        maxDepthReached,
        highRisk,
        mediumRisk,
        lowRisk,
        categoryBreakdown: catBreakdown,
        amplificationPoints,
      },
    };
  }
}
```

5. Run test: `cd packages/graph && npx vitest run tests/blast-radius/CascadeSimulator.test.ts`
6. Observe: all tests pass (source node resolution + simple chain + custom strategy + edge type filter).
7. Run: `harness validate`
8. Commit: `feat(blast-radius): implement core BFS traversal with probability propagation`

---

### Task 3: Add diamond graph and multi-path handling tests

**Depends on:** Task 2
**Files:** `packages/graph/tests/blast-radius/CascadeSimulator.test.ts`

1. Add tests to `CascadeSimulator.test.ts`:

```typescript
describe('diamond graph (multi-path handling)', () => {
  it('keeps highest cumulative probability when node is reachable via multiple paths', () => {
    const store = new GraphStore();
    store.addNode(makeNode('file:a'));
    store.addNode(makeNode('file:b'));
    store.addNode(makeNode('file:c'));
    store.addNode(makeNode('file:d'));
    // A->B (imports, 0.35), A->C (calls, 0.25), B->D (imports, 0.35), C->D (imports, 0.35)
    store.addEdge(makeEdge('file:a', 'file:b', 'imports'));
    store.addEdge(makeEdge('file:a', 'file:c', 'calls'));
    store.addEdge(makeEdge('file:b', 'file:d', 'imports'));
    store.addEdge(makeEdge('file:c', 'file:d', 'imports'));

    const sim = new CascadeSimulator(store);
    const result = sim.simulate('file:a');

    // D should appear exactly once
    const dNodes = result.flatSummary.filter((n) => n.nodeId === 'file:d');
    expect(dNodes).toHaveLength(1);

    // Best path to D: A->B->D = 0.35 * 0.35 = 0.1225
    // Alt path: A->C->D = 0.25 * 0.35 = 0.0875
    expect(dNodes[0].cumulativeProbability).toBeCloseTo(0.1225, 10);
    expect(dNodes[0].parentId).toBe('file:b');
  });

  it('ensures flatSummary contains no duplicate nodeIds', () => {
    const store = new GraphStore();
    store.addNode(makeNode('file:a'));
    store.addNode(makeNode('file:b'));
    store.addNode(makeNode('file:c'));
    store.addNode(makeNode('file:d'));
    store.addEdge(makeEdge('file:a', 'file:b', 'imports'));
    store.addEdge(makeEdge('file:a', 'file:c', 'imports'));
    store.addEdge(makeEdge('file:b', 'file:d', 'imports'));
    store.addEdge(makeEdge('file:c', 'file:d', 'imports'));

    const sim = new CascadeSimulator(store);
    const result = sim.simulate('file:a');

    const ids = result.flatSummary.map((n) => n.nodeId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
```

2. Run test: `cd packages/graph && npx vitest run tests/blast-radius/CascadeSimulator.test.ts`
3. Observe: all tests pass (BFS already handles multi-path via visited map check).
4. Run: `harness validate`
5. Commit: `test(blast-radius): add diamond graph multi-path handling tests`

---

### Task 4: Add fan-out hub and amplification point tests

**Depends on:** Task 2
**Files:** `packages/graph/tests/blast-radius/CascadeSimulator.test.ts`

1. Add tests to `CascadeSimulator.test.ts`:

```typescript
describe('fan-out hub and amplification points', () => {
  it('identifies source node as amplification point when fan-out > 3', () => {
    const store = new GraphStore();
    store.addNode(makeNode('file:hub'));
    store.addNode(makeNode('file:t1'));
    store.addNode(makeNode('file:t2'));
    store.addNode(makeNode('file:t3'));
    store.addNode(makeNode('file:t4'));
    store.addEdge(makeEdge('file:hub', 'file:t1', 'imports'));
    store.addEdge(makeEdge('file:hub', 'file:t2', 'imports'));
    store.addEdge(makeEdge('file:hub', 'file:t3', 'imports'));
    store.addEdge(makeEdge('file:hub', 'file:t4', 'imports'));

    const sim = new CascadeSimulator(store);
    const result = sim.simulate('file:hub');

    expect(result.summary.amplificationPoints).toContain('file:hub');
    expect(result.summary.totalAffected).toBe(4);
  });

  it('does not mark node as amplification point when fan-out <= 3', () => {
    const store = new GraphStore();
    store.addNode(makeNode('file:hub'));
    store.addNode(makeNode('file:t1'));
    store.addNode(makeNode('file:t2'));
    store.addNode(makeNode('file:t3'));
    store.addEdge(makeEdge('file:hub', 'file:t1', 'imports'));
    store.addEdge(makeEdge('file:hub', 'file:t2', 'imports'));
    store.addEdge(makeEdge('file:hub', 'file:t3', 'imports'));

    const sim = new CascadeSimulator(store);
    const result = sim.simulate('file:hub');

    expect(result.summary.amplificationPoints).not.toContain('file:hub');
  });

  it('identifies intermediate node as amplification point', () => {
    const store = new GraphStore();
    store.addNode(makeNode('file:a'));
    store.addNode(makeNode('file:mid'));
    store.addNode(makeNode('file:t1'));
    store.addNode(makeNode('file:t2'));
    store.addNode(makeNode('file:t3'));
    store.addNode(makeNode('file:t4'));
    store.addEdge(makeEdge('file:a', 'file:mid', 'imports'));
    store.addEdge(makeEdge('file:mid', 'file:t1', 'imports'));
    store.addEdge(makeEdge('file:mid', 'file:t2', 'imports'));
    store.addEdge(makeEdge('file:mid', 'file:t3', 'imports'));
    store.addEdge(makeEdge('file:mid', 'file:t4', 'imports'));

    const sim = new CascadeSimulator(store);
    const result = sim.simulate('file:a');

    expect(result.summary.amplificationPoints).toContain('file:mid');
  });
});
```

2. Run test: `cd packages/graph && npx vitest run tests/blast-radius/CascadeSimulator.test.ts`
3. Observe: all tests pass.
4. Run: `harness validate`
5. Commit: `test(blast-radius): add fan-out hub and amplification point tests`

---

### Task 5: Add cycle handling and termination tests

**Depends on:** Task 2
**Files:** `packages/graph/tests/blast-radius/CascadeSimulator.test.ts`

1. Add tests to `CascadeSimulator.test.ts`:

```typescript
describe('cycle handling', () => {
  it('does not loop infinitely on A -> B -> A cycle', () => {
    const store = new GraphStore();
    store.addNode(makeNode('file:a'));
    store.addNode(makeNode('file:b'));
    store.addEdge(makeEdge('file:a', 'file:b', 'imports'));
    store.addEdge(makeEdge('file:b', 'file:a', 'imports'));

    const sim = new CascadeSimulator(store);
    const result = sim.simulate('file:a');

    // B is visited; A is the source and should not appear in results
    expect(result.flatSummary.map((n) => n.nodeId)).toContain('file:b');
    expect(result.flatSummary.map((n) => n.nodeId)).not.toContain('file:a');
  });

  it('handles self-loop without infinite recursion', () => {
    const store = new GraphStore();
    store.addNode(makeNode('file:a'));
    store.addEdge(makeEdge('file:a', 'file:a', 'imports'));

    const sim = new CascadeSimulator(store);
    const result = sim.simulate('file:a');

    // Source node should not appear in flatSummary
    expect(result.flatSummary).toHaveLength(0);
  });
});

describe('termination at probability floor', () => {
  it('stops traversal when cumulative probability drops below floor', () => {
    const store = new GraphStore();
    // Chain of 10 nodes: each edge is 'references' => base 0.2, prob = 0.2*0.5 = 0.1
    // cumProb: 0.1, 0.01, 0.001, ... -> floor (0.05) reached at depth 2
    const nodeIds: string[] = [];
    for (let i = 0; i < 10; i++) {
      const id = `file:n${i}`;
      nodeIds.push(id);
      store.addNode(makeNode(id));
    }
    for (let i = 0; i < 9; i++) {
      store.addEdge(makeEdge(nodeIds[i], nodeIds[i + 1], 'references'));
    }

    const sim = new CascadeSimulator(store);
    const result = sim.simulate(nodeIds[0]);

    // n1 has cumProb 0.1 (above floor), n2 has 0.01 (below 0.05 floor) → pruned
    expect(result.flatSummary).toHaveLength(1);
    expect(result.flatSummary[0].nodeId).toBe('file:n1');
  });

  it('respects custom probability floor', () => {
    const store = new GraphStore();
    store.addNode(makeNode('file:a'));
    store.addNode(makeNode('file:b'));
    store.addNode(makeNode('file:c'));
    store.addEdge(makeEdge('file:a', 'file:b', 'imports'));
    store.addEdge(makeEdge('file:b', 'file:c', 'imports'));

    const sim = new CascadeSimulator(store);
    // With floor=0.2, B (0.35) passes, C (0.1225) is pruned
    const result = sim.simulate('file:a', { probabilityFloor: 0.2 });

    expect(result.flatSummary).toHaveLength(1);
    expect(result.flatSummary[0].nodeId).toBe('file:b');
  });
});

describe('termination at depth cap', () => {
  it('stops traversal at maxDepth', () => {
    const store = new GraphStore();
    // Use a high-probability strategy so floor is never hit
    const highProbStrategy = { getEdgeProbability: () => 0.99 };

    const nodeIds: string[] = [];
    for (let i = 0; i < 15; i++) {
      const id = `file:n${i}`;
      nodeIds.push(id);
      store.addNode(makeNode(id));
    }
    for (let i = 0; i < 14; i++) {
      store.addEdge(makeEdge(nodeIds[i], nodeIds[i + 1], 'imports'));
    }

    const sim = new CascadeSimulator(store);
    const result = sim.simulate(nodeIds[0], {
      strategy: highProbStrategy,
      maxDepth: 3,
    });

    // Should only reach depth 1, 2, 3 (3 nodes)
    expect(result.summary.maxDepthReached).toBe(3);
    expect(result.summary.totalAffected).toBe(3);
  });
});
```

2. Run test: `cd packages/graph && npx vitest run tests/blast-radius/CascadeSimulator.test.ts`
3. Observe: all tests pass. If the self-loop or cycle tests fail, revisit the BFS implementation. The current implementation skips back-edges to the source node via `if (edge.to === sourceNodeId) continue;`. For general cycles beyond source, the visited map with probability comparison handles re-visitation correctly.

   **NOTE:** The self-loop test (`file:a -> file:a`) will pass because the BFS skips `edge.to === sourceNodeId`. If a non-source cycle exists (e.g., B->C->B), the visited map handles it: once B is visited with some probability, re-visiting B with a lower probability (which it must be, since it has decayed) is skipped.

4. Run: `harness validate`
5. Commit: `test(blast-radius): add cycle handling and termination tests`

---

### Task 6: Add layer grouping, category breakdown, and risk bucket tests

**Depends on:** Task 2
**Files:** `packages/graph/tests/blast-radius/CascadeSimulator.test.ts`

1. Add tests to `CascadeSimulator.test.ts`:

```typescript
describe('layer grouping and category breakdown', () => {
  it('groups nodes by depth into layers', () => {
    const store = new GraphStore();
    store.addNode(makeNode('file:a'));
    store.addNode(makeNode('file:b'));
    store.addNode(makeNode('file:c'));
    store.addEdge(makeEdge('file:a', 'file:b', 'imports'));
    store.addEdge(makeEdge('file:b', 'file:c', 'imports'));

    const sim = new CascadeSimulator(store);
    const result = sim.simulate('file:a');

    expect(result.layers).toHaveLength(2);
    expect(result.layers[0].depth).toBe(1);
    expect(result.layers[0].nodes).toHaveLength(1);
    expect(result.layers[0].nodes[0].nodeId).toBe('file:b');
    expect(result.layers[1].depth).toBe(2);
    expect(result.layers[1].nodes).toHaveLength(1);
    expect(result.layers[1].nodes[0].nodeId).toBe('file:c');
  });

  it('computes category breakdown per layer', () => {
    const store = new GraphStore();
    store.addNode(makeNode('file:a'));
    store.addNode(makeNode('file:b')); // type: 'file' -> code
    store.addNode(makeNode('file:c', { type: 'test_result' })); // tests
    store.addNode(makeNode('file:d', { type: 'document' })); // docs
    store.addEdge(makeEdge('file:a', 'file:b', 'imports'));
    store.addEdge(makeEdge('file:a', 'file:c', 'imports'));
    store.addEdge(makeEdge('file:a', 'file:d', 'imports'));

    const sim = new CascadeSimulator(store);
    const result = sim.simulate('file:a');

    const layer1 = result.layers[0];
    expect(layer1.depth).toBe(1);
    expect(layer1.categoryBreakdown.code).toBe(1);
    expect(layer1.categoryBreakdown.tests).toBe(1);
    expect(layer1.categoryBreakdown.docs).toBe(1);
    expect(layer1.categoryBreakdown.other).toBe(0);
  });
});

describe('risk buckets', () => {
  it('classifies nodes into high/medium/low risk buckets', () => {
    const store = new GraphStore();
    store.addNode(makeNode('file:a'));
    store.addNode(makeNode('file:b'));
    store.addNode(makeNode('file:c'));
    store.addNode(makeNode('file:d'));

    // Use mock strategy to control probabilities
    const callCount = { n: 0 };
    const probabilities = [0.8, 0.3, 0.1]; // high, medium, low
    const mockStrategy = {
      getEdgeProbability: () => {
        return probabilities[callCount.n++] ?? 0.5;
      },
    };

    store.addEdge(makeEdge('file:a', 'file:b', 'imports'));
    store.addEdge(makeEdge('file:a', 'file:c', 'imports'));
    store.addEdge(makeEdge('file:a', 'file:d', 'imports'));

    const sim = new CascadeSimulator(store);
    const result = sim.simulate('file:a', { strategy: mockStrategy });

    expect(result.summary.highRisk).toBe(1); // 0.8 >= 0.5
    expect(result.summary.mediumRisk).toBe(1); // 0.3 >= 0.2 and < 0.5
    expect(result.summary.lowRisk).toBe(1); // 0.1 < 0.2
  });
});

describe('summary stats', () => {
  it('computes correct totalAffected and maxDepthReached', () => {
    const store = new GraphStore();
    store.addNode(makeNode('file:a'));
    store.addNode(makeNode('file:b'));
    store.addNode(makeNode('file:c'));
    store.addEdge(makeEdge('file:a', 'file:b', 'imports'));
    store.addEdge(makeEdge('file:b', 'file:c', 'imports'));

    const sim = new CascadeSimulator(store);
    const result = sim.simulate('file:a');

    expect(result.summary.totalAffected).toBe(2);
    expect(result.summary.maxDepthReached).toBe(2);
  });

  it('computes overall category breakdown', () => {
    const store = new GraphStore();
    store.addNode(makeNode('file:a'));
    store.addNode(makeNode('file:b'));
    store.addNode(makeNode('file:c', { type: 'test_result' }));
    store.addEdge(makeEdge('file:a', 'file:b', 'imports'));
    store.addEdge(makeEdge('file:a', 'file:c', 'imports'));

    const sim = new CascadeSimulator(store);
    const result = sim.simulate('file:a');

    expect(result.summary.categoryBreakdown.code).toBe(1);
    expect(result.summary.categoryBreakdown.tests).toBe(1);
  });

  it('sorts flatSummary by cumulativeProbability descending', () => {
    const store = new GraphStore();
    store.addNode(makeNode('file:a'));
    store.addNode(makeNode('file:b'));
    store.addNode(makeNode('file:c'));
    store.addEdge(makeEdge('file:a', 'file:b', 'imports'));
    store.addEdge(makeEdge('file:b', 'file:c', 'imports'));

    const sim = new CascadeSimulator(store);
    const result = sim.simulate('file:a');

    for (let i = 1; i < result.flatSummary.length; i++) {
      expect(result.flatSummary[i - 1].cumulativeProbability).toBeGreaterThanOrEqual(
        result.flatSummary[i].cumulativeProbability
      );
    }
  });
});
```

2. Run test: `cd packages/graph && npx vitest run tests/blast-radius/CascadeSimulator.test.ts`
3. Observe: all tests pass.
4. Run: `harness validate`
5. Commit: `test(blast-radius): add layer grouping, category breakdown, and risk bucket tests`

---

### Task 7: Wire CascadeSimulator into barrel export

**Depends on:** Task 2
**Files:** `packages/graph/src/blast-radius/index.ts`

1. Modify `packages/graph/src/blast-radius/index.ts` to add the CascadeSimulator export. The file currently contains:

```typescript
// Types
export type {
  ProbabilityStrategy,
  CascadeSimulationOptions,
  CascadeNode,
  CascadeLayer,
  CascadeResult,
} from './types.js';

// Strategy
export { CompositeProbabilityStrategy } from './CompositeProbabilityStrategy.js';
```

Add after the Strategy export:

```typescript
// Simulator
export { CascadeSimulator } from './CascadeSimulator.js';
```

2. Verify the import works by running: `cd packages/graph && npx vitest run tests/blast-radius/CascadeSimulator.test.ts`
3. Run: `harness validate`
4. Run: `harness check-deps`
5. Commit: `feat(blast-radius): export CascadeSimulator from barrel`

---

## Traceability

| Observable Truth                          | Delivered by |
| ----------------------------------------- | ------------ |
| 1. Simple chain cumulative probability    | Task 2       |
| 2. Diamond graph highest probability wins | Task 3       |
| 3. Amplification points (fanOut > 3)      | Task 4       |
| 4. Cycle handling                         | Task 5       |
| 5. Termination at probability floor       | Task 5       |
| 6. Termination at depth cap               | Task 5       |
| 7. Layer grouping with category breakdown | Task 6       |
| 8. Flat summary sorted by probability     | Task 6       |
| 9. Risk buckets (high/medium/low)         | Task 6       |
| 10. Custom strategy support               | Task 2       |
| 11. Edge type filter support              | Task 2       |
| 12. Source node not found error           | Task 1       |
| 13. Barrel export                         | Task 7       |
| 14. All tests pass                        | Tasks 1-6    |
| 15. harness validate passes               | All tasks    |
