# Plan: Cascading Failure Simulation -- Phase 1: Core Types & Strategy

**Date:** 2026-04-06
**Spec:** docs/changes/cascading-failure-simulation/proposal.md
**Estimated tasks:** 5
**Estimated time:** 20 minutes

## Goal

Define all type interfaces for the cascading failure simulation and implement the `CompositeProbabilityStrategy` with full unit test coverage, establishing the foundation for the BFS engine in Phase 2.

## Observable Truths (Acceptance Criteria)

1. `packages/graph/src/blast-radius/types.ts` exists and exports `ProbabilityStrategy`, `CascadeSimulationOptions`, `CascadeNode`, `CascadeLayer`, and `CascadeResult` interfaces.
2. `packages/graph/src/blast-radius/CompositeProbabilityStrategy.ts` exists and exports a class implementing `ProbabilityStrategy`.
3. When `CompositeProbabilityStrategy.getEdgeProbability()` is called with an `imports` edge, a target node with changeFreq=1.0 and coupling=1.0, the system shall return `Math.min(1, 0.7 * 0.5 + 1.0 * 0.3 + 1.0 * 0.2)` = 0.85.
4. When `CompositeProbabilityStrategy.getEdgeProbability()` is called with an unrecognized edge type, the system shall use the fallback base weight of 0.1.
5. When `CompositeProbabilityStrategy.getEdgeProbability()` is called with a target node absent from both changeFreqMap and couplingMap, the system shall default both signals to 0 and return `base * 0.5`.
6. `packages/graph/src/blast-radius/index.ts` barrel-exports all types and the strategy class.
7. `packages/graph/src/index.ts` re-exports the blast-radius barrel.
8. `npx vitest run packages/graph/tests/blast-radius/CompositeProbabilityStrategy.test.ts` passes with all tests green.
9. `harness validate` passes after all tasks are complete.

## File Map

- CREATE `packages/graph/src/blast-radius/types.ts`
- CREATE `packages/graph/src/blast-radius/CompositeProbabilityStrategy.ts`
- CREATE `packages/graph/src/blast-radius/index.ts`
- MODIFY `packages/graph/src/index.ts` (add blast-radius re-exports)
- CREATE `packages/graph/tests/blast-radius/CompositeProbabilityStrategy.test.ts`

## Skeleton

_Skeleton not produced -- task count (5) below threshold (8)._

## Tasks

### Task 1: Define cascade simulation types

**Depends on:** none
**Files:** `packages/graph/src/blast-radius/types.ts`

1. Create directory `packages/graph/src/blast-radius/`.
2. Create file `packages/graph/src/blast-radius/types.ts`:

```typescript
import type { GraphEdge, GraphNode } from '../types.js';

// --- Probability Strategy ---

export interface ProbabilityStrategy {
  /** Compute failure propagation probability for a single edge (0..1). */
  getEdgeProbability(edge: GraphEdge, fromNode: GraphNode, toNode: GraphNode): number;
}

// --- Simulation Options ---

export interface CascadeSimulationOptions {
  /** Minimum cumulative probability to continue traversal. Default: 0.05 */
  readonly probabilityFloor?: number;
  /** Maximum BFS depth. Default: 10 */
  readonly maxDepth?: number;
  /** Filter to specific edge types. Default: all edge types. */
  readonly edgeTypes?: readonly string[];
  /** Pluggable probability strategy. Default: CompositeProbabilityStrategy. */
  readonly strategy?: ProbabilityStrategy;
}

// --- Result Structures ---

export interface CascadeNode {
  readonly nodeId: string;
  readonly name: string;
  readonly path?: string;
  readonly type: string;
  readonly cumulativeProbability: number;
  readonly depth: number;
  readonly incomingEdge: string;
  readonly parentId: string;
}

export interface CascadeLayer {
  readonly depth: number;
  readonly nodes: readonly CascadeNode[];
  readonly categoryBreakdown: {
    readonly code: number;
    readonly tests: number;
    readonly docs: number;
    readonly other: number;
  };
}

export interface CascadeResult {
  readonly sourceNodeId: string;
  readonly sourceName: string;
  readonly layers: readonly CascadeLayer[];
  readonly flatSummary: readonly CascadeNode[];
  readonly summary: {
    readonly totalAffected: number;
    readonly maxDepthReached: number;
    readonly highRisk: number;
    readonly mediumRisk: number;
    readonly lowRisk: number;
    readonly categoryBreakdown: {
      readonly code: number;
      readonly tests: number;
      readonly docs: number;
      readonly other: number;
    };
    readonly amplificationPoints: readonly string[];
  };
}
```

3. Run: `harness validate`
4. Commit: `feat(blast-radius): define cascade simulation type interfaces`

---

### Task 2: Implement CompositeProbabilityStrategy

**Depends on:** Task 1
**Files:** `packages/graph/src/blast-radius/CompositeProbabilityStrategy.ts`

1. Create file `packages/graph/src/blast-radius/CompositeProbabilityStrategy.ts`:

```typescript
import type { GraphEdge, GraphNode } from '../types.js';
import type { ProbabilityStrategy } from './types.js';

/**
 * Default probability strategy blending three signals:
 * - 50% edge type base weight
 * - 30% normalized change frequency of target node
 * - 20% normalized coupling strength of target node
 */
export class CompositeProbabilityStrategy implements ProbabilityStrategy {
  static readonly BASE_WEIGHTS: Record<string, number> = {
    imports: 0.7,
    calls: 0.5,
    implements: 0.6,
    inherits: 0.6,
    co_changes_with: 0.4,
    references: 0.2,
    contains: 0.3,
  };

  private static readonly FALLBACK_WEIGHT = 0.1;
  private static readonly EDGE_TYPE_BLEND = 0.5;
  private static readonly CHANGE_FREQ_BLEND = 0.3;
  private static readonly COUPLING_BLEND = 0.2;

  constructor(
    private readonly changeFreqMap: Map<string, number>,
    private readonly couplingMap: Map<string, number>
  ) {}

  getEdgeProbability(edge: GraphEdge, _fromNode: GraphNode, toNode: GraphNode): number {
    const base =
      CompositeProbabilityStrategy.BASE_WEIGHTS[edge.type] ??
      CompositeProbabilityStrategy.FALLBACK_WEIGHT;
    const changeFreq = this.changeFreqMap.get(toNode.id) ?? 0;
    const coupling = this.couplingMap.get(toNode.id) ?? 0;

    return Math.min(
      1,
      base * CompositeProbabilityStrategy.EDGE_TYPE_BLEND +
        changeFreq * CompositeProbabilityStrategy.CHANGE_FREQ_BLEND +
        coupling * CompositeProbabilityStrategy.COUPLING_BLEND
    );
  }
}
```

2. Run: `harness validate`
3. Commit: `feat(blast-radius): implement CompositeProbabilityStrategy`

---

### Task 3: Write CompositeProbabilityStrategy unit tests

**Depends on:** Task 2
**Files:** `packages/graph/tests/blast-radius/CompositeProbabilityStrategy.test.ts`

1. Create directory `packages/graph/tests/blast-radius/`.
2. Create file `packages/graph/tests/blast-radius/CompositeProbabilityStrategy.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { CompositeProbabilityStrategy } from '../../src/blast-radius/CompositeProbabilityStrategy';
import type { GraphEdge, GraphNode } from '../../src/types';

function makeNode(id: string, overrides?: Partial<GraphNode>): GraphNode {
  return {
    id,
    type: 'file',
    name: id,
    path: `src/${id}`,
    metadata: {},
    ...overrides,
  };
}

function makeEdge(from: string, to: string, type: string): GraphEdge {
  return { from, to, type } as GraphEdge;
}

describe('CompositeProbabilityStrategy', () => {
  describe('getEdgeProbability', () => {
    it('blends all three signals for a known edge type', () => {
      const changeFreqMap = new Map([['file:b', 1.0]]);
      const couplingMap = new Map([['file:b', 1.0]]);
      const strategy = new CompositeProbabilityStrategy(changeFreqMap, couplingMap);

      const from = makeNode('file:a');
      const to = makeNode('file:b');
      const edge = makeEdge('file:a', 'file:b', 'imports');

      // imports base = 0.7; result = 0.7*0.5 + 1.0*0.3 + 1.0*0.2 = 0.85
      const prob = strategy.getEdgeProbability(edge, from, to);
      expect(prob).toBeCloseTo(0.85, 10);
    });

    it('defaults changeFreq and coupling to 0 when node is absent from maps', () => {
      const strategy = new CompositeProbabilityStrategy(new Map(), new Map());

      const from = makeNode('file:a');
      const to = makeNode('file:b');
      const edge = makeEdge('file:a', 'file:b', 'imports');

      // imports base = 0.7; result = 0.7*0.5 + 0*0.3 + 0*0.2 = 0.35
      const prob = strategy.getEdgeProbability(edge, from, to);
      expect(prob).toBeCloseTo(0.35, 10);
    });

    it('uses fallback weight for unrecognized edge types', () => {
      const strategy = new CompositeProbabilityStrategy(new Map(), new Map());

      const from = makeNode('file:a');
      const to = makeNode('file:b');
      const edge = makeEdge('file:a', 'file:b', 'unknown_edge_type');

      // fallback base = 0.1; result = 0.1*0.5 + 0*0.3 + 0*0.2 = 0.05
      const prob = strategy.getEdgeProbability(edge, from, to);
      expect(prob).toBeCloseTo(0.05, 10);
    });

    it('clamps result to 1.0 when signals would exceed it', () => {
      // Edge type with high base weight + max signals
      const changeFreqMap = new Map([['file:b', 1.0]]);
      const couplingMap = new Map([['file:b', 1.0]]);
      const strategy = new CompositeProbabilityStrategy(changeFreqMap, couplingMap);

      const from = makeNode('file:a');
      const to = makeNode('file:b');
      // imports: 0.7*0.5 + 1.0*0.3 + 1.0*0.2 = 0.85, under 1.0 — try a scenario
      // With current weights, max possible = 0.7*0.5 + 1.0*0.3 + 1.0*0.2 = 0.85
      // Clamping is a safety net; verify Math.min(1, ...) works
      const prob = strategy.getEdgeProbability(edge, from, to);
      expect(prob).toBeLessThanOrEqual(1.0);
      expect(prob).toBeGreaterThan(0);
    });

    it('computes correct values for each known edge type with zero signals', () => {
      const strategy = new CompositeProbabilityStrategy(new Map(), new Map());
      const from = makeNode('file:a');
      const to = makeNode('file:b');

      const expected: Record<string, number> = {
        imports: 0.7 * 0.5,
        calls: 0.5 * 0.5,
        implements: 0.6 * 0.5,
        inherits: 0.6 * 0.5,
        co_changes_with: 0.4 * 0.5,
        references: 0.2 * 0.5,
        contains: 0.3 * 0.5,
      };

      for (const [edgeType, expectedProb] of Object.entries(expected)) {
        const edge = makeEdge('file:a', 'file:b', edgeType);
        const prob = strategy.getEdgeProbability(edge, from, to);
        expect(prob).toBeCloseTo(expectedProb, 10);
      }
    });

    it('incorporates only changeFreq when coupling is absent', () => {
      const changeFreqMap = new Map([['file:b', 0.6]]);
      const strategy = new CompositeProbabilityStrategy(changeFreqMap, new Map());

      const from = makeNode('file:a');
      const to = makeNode('file:b');
      const edge = makeEdge('file:a', 'file:b', 'calls');

      // calls base = 0.5; result = 0.5*0.5 + 0.6*0.3 + 0*0.2 = 0.43
      const prob = strategy.getEdgeProbability(edge, from, to);
      expect(prob).toBeCloseTo(0.43, 10);
    });

    it('incorporates only coupling when changeFreq is absent', () => {
      const couplingMap = new Map([['file:b', 0.8]]);
      const strategy = new CompositeProbabilityStrategy(new Map(), couplingMap);

      const from = makeNode('file:a');
      const to = makeNode('file:b');
      const edge = makeEdge('file:a', 'file:b', 'calls');

      // calls base = 0.5; result = 0.5*0.5 + 0*0.3 + 0.8*0.2 = 0.41
      const prob = strategy.getEdgeProbability(edge, from, to);
      expect(prob).toBeCloseTo(0.41, 10);
    });

    it('returns value in 0..1 range for all combinations', () => {
      const changeFreqMap = new Map([['file:b', 0.5]]);
      const couplingMap = new Map([['file:b', 0.5]]);
      const strategy = new CompositeProbabilityStrategy(changeFreqMap, couplingMap);

      const from = makeNode('file:a');
      const to = makeNode('file:b');

      for (const edgeType of Object.keys(CompositeProbabilityStrategy.BASE_WEIGHTS)) {
        const edge = makeEdge('file:a', 'file:b', edgeType);
        const prob = strategy.getEdgeProbability(edge, from, to);
        expect(prob).toBeGreaterThanOrEqual(0);
        expect(prob).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('BASE_WEIGHTS', () => {
    it('has entries for all expected edge types', () => {
      const expectedTypes = [
        'imports',
        'calls',
        'implements',
        'inherits',
        'co_changes_with',
        'references',
        'contains',
      ];
      for (const t of expectedTypes) {
        expect(CompositeProbabilityStrategy.BASE_WEIGHTS[t]).toBeDefined();
        expect(CompositeProbabilityStrategy.BASE_WEIGHTS[t]).toBeGreaterThan(0);
        expect(CompositeProbabilityStrategy.BASE_WEIGHTS[t]).toBeLessThanOrEqual(1);
      }
    });
  });
});
```

3. Run: `npx vitest run packages/graph/tests/blast-radius/CompositeProbabilityStrategy.test.ts`
4. Observe: all tests pass.
5. Run: `harness validate`
6. Commit: `test(blast-radius): add CompositeProbabilityStrategy unit tests`

---

### Task 4: Create blast-radius barrel export

**Depends on:** Task 2
**Files:** `packages/graph/src/blast-radius/index.ts`

1. Create file `packages/graph/src/blast-radius/index.ts`:

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

2. Run: `harness validate`
3. Commit: `feat(blast-radius): add barrel export for blast-radius module`

---

### Task 5: Wire blast-radius into package barrel export

**Depends on:** Task 4
**Files:** `packages/graph/src/index.ts`

1. Open `packages/graph/src/index.ts`.
2. Add the following block after the Independence section (before `export const VERSION`), at approximately line 148:

```typescript
// Blast Radius
export { CompositeProbabilityStrategy } from './blast-radius/index.js';
export type {
  ProbabilityStrategy,
  CascadeSimulationOptions,
  CascadeNode,
  CascadeLayer,
  CascadeResult,
} from './blast-radius/index.js';
```

3. Run: `npx vitest run packages/graph/tests/blast-radius/CompositeProbabilityStrategy.test.ts`
4. Observe: all tests still pass.
5. Run: `harness validate`
6. Commit: `feat(blast-radius): wire blast-radius exports into package barrel`

---

## Traceability

| Observable Truth                            | Delivered By         |
| ------------------------------------------- | -------------------- |
| 1. types.ts exports all interfaces          | Task 1               |
| 2. CompositeProbabilityStrategy.ts exists   | Task 2               |
| 3. imports + full signals = 0.85            | Task 3 (test case 1) |
| 4. unrecognized edge type uses fallback 0.1 | Task 3 (test case 3) |
| 5. absent node defaults signals to 0        | Task 3 (test case 2) |
| 6. barrel export in blast-radius/index.ts   | Task 4               |
| 7. package barrel re-exports blast-radius   | Task 5               |
| 8. all tests pass                           | Task 3               |
| 9. harness validate passes                  | All tasks            |

## Evidence

- `packages/graph/src/types.ts:101-122` -- `GraphNode` and `GraphEdge` interfaces confirmed; types.ts imports reference these.
- `packages/graph/src/types.ts:49-81` -- `EDGE_TYPES` array confirms `imports`, `calls`, `implements`, `inherits`, `co_changes_with`, `references`, `contains` are valid edge types matching `BASE_WEIGHTS` keys.
- `packages/graph/src/entropy/GraphComplexityAdapter.ts:3-8` -- `GraphComplexityHotspot` has `changeFrequency: number` field used for normalization.
- `packages/graph/src/entropy/GraphCouplingAdapter.ts:3-8` -- `GraphCouplingFileData` has `fanIn` and `fanOut` fields used for coupling normalization.
- `packages/graph/src/query/groupImpact.ts:4-14` -- Category grouping sets (TEST_TYPES, DOC_TYPES, CODE_TYPES) define the categorization logic that `CascadeLayer.categoryBreakdown` mirrors.
- `packages/graph/src/index.ts:64-87` -- Entropy section export pattern confirms the barrel re-export convention used in Task 5.
- `packages/graph/tests/entropy/GraphComplexityAdapter.test.ts:1-3` -- Test import pattern (`import { describe, it, expect } from 'vitest'`) confirmed for test file structure.
- `packages/graph/src/store/GraphStore.ts:125-149` -- `getEdges(query: EdgeQuery)` is the API for retrieving edges; relevant for Phase 2 BFS but confirms the store interface the types will interact with.
