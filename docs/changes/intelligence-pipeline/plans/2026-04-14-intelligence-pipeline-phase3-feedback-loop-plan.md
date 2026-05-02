# Plan: Intelligence Pipeline Phase 3 -- Feedback Loop (Historical Learning)

**Date:** 2026-04-14 | **Spec:** docs/changes/intelligence-pipeline/proposal.md | **Tasks:** 9 | **Time:** ~35 min

## Goal

Execution outcomes from worker exits feed back into the knowledge graph as structured nodes with edges to affected systems. CML queries historical outcomes to improve complexity scoring over time -- issues touching previously-failed systems score higher.

## Observable Truths (Acceptance Criteria)

1. **[EARS: Event-driven]** When an `ExecutionOutcome` is ingested, the system shall create a graph node of type `'execution_outcome'` with metadata containing `result`, `retryCount`, `failureReasons`, `durationMs`, and `linkedSpecId`.
2. **[EARS: Event-driven]** When an `ExecutionOutcome` is ingested with `affectedSystems` referencing graph node IDs, the system shall create `'outcome_of'` edges from the outcome node to each affected system node.
3. **[EARS: Event-driven]** When a `WorkerExitEvent` fires in the orchestrator, the system shall call `pipeline.recordOutcome()` with the exit reason, attempt count, error message, and associated enriched spec (if available).
4. **[EARS: State-driven]** While the graph contains previously-failed outcomes for a module, CML scoring an `EnrichedSpec` whose `affectedSystems` overlap with that module shall produce `dimensions.historical > 0`.
5. **[EARS: Ubiquitous]** The system shall produce `dimensions.historical === 0` when no past outcomes exist for an `EnrichedSpec`'s affected systems.
6. **[EARS: Ubiquitous]** `npx vitest run` in `packages/intelligence/` shall pass with all new and existing tests (zero regressions).
7. **[EARS: Ubiquitous]** `npx vitest run` in `packages/orchestrator/` shall pass with all existing tests (zero regressions).

**Success Criteria from Spec:** SC10 (connector ingests outcomes with correct node type and edges), SC11 (CML historical dimension queries past outcomes and weights scoring).

## File Map

```
MODIFY packages/graph/src/types.ts                         (add 'execution_outcome' to NODE_TYPES, 'outcome_of' to EDGE_TYPES)
CREATE packages/intelligence/src/outcome/types.ts           (ExecutionOutcome interface)
CREATE packages/intelligence/src/outcome/connector.ts       (ExecutionOutcomeConnector class)
CREATE packages/intelligence/tests/outcome/connector.test.ts (connector TDD tests)
CREATE packages/intelligence/src/cml/historical.ts          (computeHistoricalComplexity function)
CREATE packages/intelligence/tests/cml/historical.test.ts   (historical TDD tests)
MODIFY packages/intelligence/src/cml/scorer.ts              (wire historical dimension)
MODIFY packages/intelligence/tests/cml/scorer.test.ts       (add historical integration tests)
MODIFY packages/intelligence/src/index.ts                   (export outcome types, connector, historical)
MODIFY packages/intelligence/src/pipeline.ts                (add recordOutcome method)
MODIFY packages/orchestrator/src/orchestrator.ts            (store enriched specs, call recordOutcome on worker exit)
```

## Skeleton

1. Graph schema extension -- add node and edge types (~1 task, ~3 min)
2. Execution outcome types and connector with TDD (~2 tasks, ~8 min)
3. CML historical dimension with TDD (~2 tasks, ~8 min)
4. CML scorer integration -- wire historical into score() (~1 task, ~4 min)
5. Pipeline + exports -- recordOutcome method and public API (~1 task, ~4 min)
6. Orchestrator wiring -- store enriched specs, record outcomes on exit (~2 tasks, ~8 min)

_Skeleton approved: pending._

**Estimated total:** 9 tasks, ~35 minutes

## Decisions

| #   | Decision                                                                                                                      | Rationale                                                                                                                                                                                                                                    |
| --- | ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Use `'execution_outcome'` as the new node type (not reusing `'test_result'` or `'failure'`)                                   | Execution outcomes are a distinct concept from CI test results or knowledge-base failures. A dedicated type enables precise querying without collision.                                                                                      |
| D2  | Use `'outcome_of'` as the new edge type (outcome -> affected system node)                                                     | Expresses "this outcome relates to this module" directionally. Existing edge types (`caused_by`, `failed_in`) carry different semantics.                                                                                                     |
| D3  | Orchestrator records outcomes directly (no new SideEffect type)                                                               | Outcome recording is I/O that belongs in the orchestrator layer. The state machine stays pure. Adding a `RecordOutcomeEffect` would add complexity to the pure state machine for something that can be handled directly in `emitWorkerExit`. |
| D4  | Orchestrator stores enriched specs in a class-level `Map<string, EnrichedSpec>` persisted across ticks                        | The enriched spec is computed during `asyncTick` but the worker exit happens much later. Storing it on the orchestrator avoids modifying `RunningEntry` or the state machine.                                                                |
| D5  | Historical complexity uses failure-rate formula: `failureCount / (failureCount + successCount)` with a smoothing constant     | Simple, interpretable, no ML required. Produces values in [0, 1]. Smoothing constant prevents extreme scores from a single observation.                                                                                                      |
| D6  | `computeHistoricalComplexity` queries graph with `findNodes({ type: 'execution_outcome' })` filtered by affected system edges | Uses existing GraphStore API. No FusionLayer needed -- direct graph traversal is faster and sufficient for structured outcome data.                                                                                                          |

## Changes to Existing Behavior

- **[ADDED]** `'execution_outcome'` node type in graph schema
- **[ADDED]** `'outcome_of'` edge type in graph schema
- **[ADDED]** `ExecutionOutcomeConnector` class in intelligence package
- **[ADDED]** `computeHistoricalComplexity()` function in CML
- **[MODIFIED]** CML `score()` replaces `historical = 0` placeholder with `computeHistoricalComplexity()` call
- **[MODIFIED]** CML `computeConfidence()` accounts for historical data presence
- **[MODIFIED]** `IntelligencePipeline` gains `recordOutcome()` method
- **[MODIFIED]** Orchestrator stores enriched specs across ticks and records outcomes on worker exit

## Tasks

### Task 1: Extend graph schema with execution_outcome node type and outcome_of edge type

**Depends on:** none | **Files:** `packages/graph/src/types.ts`

1. Open `packages/graph/src/types.ts`
2. Add `'execution_outcome'` to the `NODE_TYPES` array after `'test_result'` (line 27):

```typescript
  // VCS
  'commit',
  'build',
  'test_result',
  'execution_outcome',
```

3. Add `'outcome_of'` to the `EDGE_TYPES` array after `'triggered_by'` (line 69):

```typescript
  'triggered_by',
  'failed_in',
  'outcome_of',
```

4. Run: `cd packages/graph && npx vitest run` -- verify zero regressions (the Zod schemas use `z.enum(NODE_TYPES)` and `z.enum(EDGE_TYPES)` which will automatically include the new values)
5. Run: `harness validate`
6. Commit: `feat(graph): add execution_outcome node type and outcome_of edge type`

---

### Task 2: Define ExecutionOutcome types

**Depends on:** Task 1 | **Files:** `packages/intelligence/src/outcome/types.ts`

1. Create directory: `mkdir -p packages/intelligence/src/outcome`
2. Create `packages/intelligence/src/outcome/types.ts`:

```typescript
/**
 * Execution outcome -- result of a worker running an issue.
 * Ingested into the graph as an 'execution_outcome' node.
 */
export interface ExecutionOutcome {
  /** Unique ID for this outcome (e.g., `outcome:<issueId>:<attempt>`) */
  id: string;
  /** ID of the issue that was executed */
  issueId: string;
  /** Human-readable identifier (e.g., 'PROJ-123') */
  identifier: string;
  /** Execution result */
  result: 'success' | 'failure';
  /** Number of retry attempts before this outcome */
  retryCount: number;
  /** Failure reasons (empty for success) */
  failureReasons: string[];
  /** Execution duration in milliseconds */
  durationMs: number;
  /** ID of the linked EnrichedSpec, if one was produced */
  linkedSpecId: string | null;
  /** Affected system graph node IDs from the enriched spec */
  affectedSystemNodeIds: string[];
  /** ISO timestamp of when the outcome was recorded */
  timestamp: string;
}
```

3. Run: `harness validate`
4. Commit: `feat(intelligence): define ExecutionOutcome type for graph ingestion`

---

### Task 3: TDD -- ExecutionOutcomeConnector tests

**Depends on:** Task 2 | **Files:** `packages/intelligence/tests/outcome/connector.test.ts`

1. Create directory: `mkdir -p packages/intelligence/tests/outcome`
2. Create `packages/intelligence/tests/outcome/connector.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { GraphStore } from '@harness-engineering/graph';
import { ExecutionOutcomeConnector } from '../../src/outcome/connector.js';
import type { ExecutionOutcome } from '../../src/outcome/types.js';

function makeOutcome(overrides: Partial<ExecutionOutcome> = {}): ExecutionOutcome {
  return {
    id: 'outcome:issue-1:1',
    issueId: 'issue-1',
    identifier: 'TEST-1',
    result: 'failure',
    retryCount: 0,
    failureReasons: ['TypeError: undefined is not a function'],
    durationMs: 5000,
    linkedSpecId: 'spec-1',
    affectedSystemNodeIds: [],
    timestamp: '2026-04-14T12:00:00Z',
    ...overrides,
  };
}

describe('ExecutionOutcomeConnector', () => {
  it('creates an execution_outcome node with correct metadata', () => {
    const store = new GraphStore();
    const connector = new ExecutionOutcomeConnector(store);

    const outcome = makeOutcome();
    const result = connector.ingest(outcome);

    expect(result.nodesAdded).toBe(1);
    const node = store.getNode('outcome:issue-1:1');
    expect(node).not.toBeNull();
    expect(node!.type).toBe('execution_outcome');
    expect(node!.name).toContain('TEST-1');
    expect(node!.metadata.result).toBe('failure');
    expect(node!.metadata.retryCount).toBe(0);
    expect(node!.metadata.failureReasons).toEqual(['TypeError: undefined is not a function']);
    expect(node!.metadata.durationMs).toBe(5000);
    expect(node!.metadata.linkedSpecId).toBe('spec-1');
    expect(node!.metadata.issueId).toBe('issue-1');
    expect(node!.metadata.timestamp).toBe('2026-04-14T12:00:00Z');
  });

  it('creates outcome_of edges to affected system nodes', () => {
    const store = new GraphStore();
    // Pre-populate graph with system nodes
    store.addNode({ id: 'module:auth', type: 'module', name: 'auth', metadata: {} });
    store.addNode({ id: 'module:api', type: 'module', name: 'api', metadata: {} });

    const connector = new ExecutionOutcomeConnector(store);
    const outcome = makeOutcome({
      affectedSystemNodeIds: ['module:auth', 'module:api'],
    });

    const result = connector.ingest(outcome);

    expect(result.edgesAdded).toBe(2);
    const authEdges = store.getEdges({
      from: 'outcome:issue-1:1',
      to: 'module:auth',
      type: 'outcome_of',
    });
    expect(authEdges).toHaveLength(1);
    const apiEdges = store.getEdges({
      from: 'outcome:issue-1:1',
      to: 'module:api',
      type: 'outcome_of',
    });
    expect(apiEdges).toHaveLength(1);
  });

  it('skips edges for system nodes not found in the graph', () => {
    const store = new GraphStore();
    // Only add one of two referenced nodes
    store.addNode({ id: 'module:auth', type: 'module', name: 'auth', metadata: {} });

    const connector = new ExecutionOutcomeConnector(store);
    const outcome = makeOutcome({
      affectedSystemNodeIds: ['module:auth', 'module:nonexistent'],
    });

    const result = connector.ingest(outcome);

    expect(result.edgesAdded).toBe(1);
    expect(result.errors).toHaveLength(0);
    // Edge only to the existing node
    const edges = store.getEdges({ from: 'outcome:issue-1:1', type: 'outcome_of' });
    expect(edges).toHaveLength(1);
    expect(edges[0].to).toBe('module:auth');
  });

  it('creates a success outcome with empty failureReasons', () => {
    const store = new GraphStore();
    const connector = new ExecutionOutcomeConnector(store);

    const outcome = makeOutcome({
      id: 'outcome:issue-2:1',
      issueId: 'issue-2',
      result: 'success',
      failureReasons: [],
    });

    const result = connector.ingest(outcome);

    expect(result.nodesAdded).toBe(1);
    const node = store.getNode('outcome:issue-2:1');
    expect(node!.metadata.result).toBe('success');
    expect(node!.metadata.failureReasons).toEqual([]);
  });

  it('handles duplicate ingestion gracefully (upsert)', () => {
    const store = new GraphStore();
    const connector = new ExecutionOutcomeConnector(store);

    const outcome = makeOutcome();
    connector.ingest(outcome);
    const result = connector.ingest(outcome);

    // GraphStore.addNode merges on duplicate -- node count stays 1
    expect(result.nodesAdded).toBe(1);
    expect(store.findNodes({ type: 'execution_outcome' })).toHaveLength(1);
  });
});
```

3. Run: `cd packages/intelligence && npx vitest run tests/outcome/connector.test.ts` -- observe all tests fail (module not found)
4. Run: `harness validate`
5. Commit: `test(intelligence): add ExecutionOutcomeConnector test suite`

---

### Task 4: Implement ExecutionOutcomeConnector

**Depends on:** Task 3 | **Files:** `packages/intelligence/src/outcome/connector.ts`

1. Create `packages/intelligence/src/outcome/connector.ts`:

```typescript
import type { GraphStore } from '@harness-engineering/graph';
import type { ExecutionOutcome } from './types.js';

export interface OutcomeIngestResult {
  nodesAdded: number;
  edgesAdded: number;
  errors: string[];
}

/**
 * Ingests execution outcomes into the knowledge graph.
 *
 * Creates an 'execution_outcome' node for each outcome with metadata
 * containing result, retry count, failure reasons, duration, and linked
 * spec ID. Creates 'outcome_of' edges to each affected system node
 * that exists in the graph.
 */
export class ExecutionOutcomeConnector {
  constructor(private readonly store: GraphStore) {}

  ingest(outcome: ExecutionOutcome): OutcomeIngestResult {
    const errors: string[] = [];

    // 1. Create the outcome node
    this.store.addNode({
      id: outcome.id,
      type: 'execution_outcome',
      name: `${outcome.result}: ${outcome.identifier}`,
      metadata: {
        issueId: outcome.issueId,
        identifier: outcome.identifier,
        result: outcome.result,
        retryCount: outcome.retryCount,
        failureReasons: outcome.failureReasons,
        durationMs: outcome.durationMs,
        linkedSpecId: outcome.linkedSpecId,
        timestamp: outcome.timestamp,
      },
    });

    // 2. Create edges to affected system nodes
    let edgesAdded = 0;
    for (const systemNodeId of outcome.affectedSystemNodeIds) {
      const systemNode = this.store.getNode(systemNodeId);
      if (!systemNode) continue;
      this.store.addEdge({
        from: outcome.id,
        to: systemNodeId,
        type: 'outcome_of',
      });
      edgesAdded++;
    }

    return { nodesAdded: 1, edgesAdded, errors };
  }
}
```

2. Run: `cd packages/intelligence && npx vitest run tests/outcome/connector.test.ts` -- all 5 tests pass
3. Run: `harness validate`
4. Commit: `feat(intelligence): implement ExecutionOutcomeConnector for graph ingestion`

---

### Task 5: TDD -- computeHistoricalComplexity tests

**Depends on:** Task 1 | **Files:** `packages/intelligence/tests/cml/historical.test.ts`

1. Create `packages/intelligence/tests/cml/historical.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { GraphStore } from '@harness-engineering/graph';
import { computeHistoricalComplexity } from '../../src/cml/historical.js';
import type { EnrichedSpec, AffectedSystem } from '../../src/types.js';

function makeSystem(overrides: Partial<AffectedSystem> = {}): AffectedSystem {
  return {
    name: 'test-system',
    graphNodeId: null,
    confidence: 0,
    transitiveDeps: [],
    testCoverage: 0,
    owner: null,
    ...overrides,
  };
}

function makeSpec(overrides: Partial<EnrichedSpec> = {}): EnrichedSpec {
  return {
    id: 'spec-1',
    title: 'Test spec',
    intent: 'test',
    summary: 'A test spec',
    affectedSystems: [],
    functionalRequirements: [],
    nonFunctionalRequirements: [],
    apiChanges: [],
    dbChanges: [],
    integrationPoints: [],
    assumptions: [],
    unknowns: [],
    ambiguities: [],
    riskSignals: [],
    initialComplexityHints: { textualComplexity: 0, structuralComplexity: 0 },
    ...overrides,
  };
}

/**
 * Helper: add an execution_outcome node and an outcome_of edge to a system node.
 */
function addOutcome(
  store: GraphStore,
  outcomeId: string,
  systemNodeId: string,
  result: 'success' | 'failure'
): void {
  store.addNode({
    id: outcomeId,
    type: 'execution_outcome',
    name: `${result}: test`,
    metadata: {
      result,
      issueId: 'i1',
      identifier: 'T-1',
      retryCount: 0,
      failureReasons: [],
      durationMs: 1000,
      linkedSpecId: null,
      timestamp: '2026-04-14T12:00:00Z',
    },
  });
  store.addEdge({ from: outcomeId, to: systemNodeId, type: 'outcome_of' });
}

describe('computeHistoricalComplexity', () => {
  it('returns 0 when no affected systems have graph node IDs', () => {
    const store = new GraphStore();
    const spec = makeSpec({
      affectedSystems: [makeSystem({ graphNodeId: null })],
    });
    expect(computeHistoricalComplexity(spec, store)).toBe(0);
  });

  it('returns 0 when no outcomes exist for affected systems', () => {
    const store = new GraphStore();
    store.addNode({ id: 'module:auth', type: 'module', name: 'auth', metadata: {} });

    const spec = makeSpec({
      affectedSystems: [makeSystem({ name: 'auth', graphNodeId: 'module:auth', confidence: 0.9 })],
    });
    expect(computeHistoricalComplexity(spec, store)).toBe(0);
  });

  it('returns > 0 when past failure outcomes exist for an affected system', () => {
    const store = new GraphStore();
    store.addNode({ id: 'module:auth', type: 'module', name: 'auth', metadata: {} });
    addOutcome(store, 'outcome:1', 'module:auth', 'failure');
    addOutcome(store, 'outcome:2', 'module:auth', 'failure');
    addOutcome(store, 'outcome:3', 'module:auth', 'failure');

    const spec = makeSpec({
      affectedSystems: [makeSystem({ name: 'auth', graphNodeId: 'module:auth', confidence: 0.9 })],
    });

    const result = computeHistoricalComplexity(spec, store);
    expect(result).toBeGreaterThan(0);
    expect(result).toBeLessThanOrEqual(1);
  });

  it('returns lower score when outcomes are mostly successes', () => {
    const store = new GraphStore();
    store.addNode({ id: 'module:api', type: 'module', name: 'api', metadata: {} });

    // 1 failure, 9 successes
    addOutcome(store, 'outcome:f1', 'module:api', 'failure');
    for (let i = 0; i < 9; i++) {
      addOutcome(store, `outcome:s${i}`, 'module:api', 'success');
    }

    const spec = makeSpec({
      affectedSystems: [makeSystem({ name: 'api', graphNodeId: 'module:api', confidence: 0.9 })],
    });

    const result = computeHistoricalComplexity(spec, store);
    // 1 failure / (1 failure + 9 success + smoothing) should be relatively low
    expect(result).toBeGreaterThan(0);
    expect(result).toBeLessThan(0.3);
  });

  it('returns higher score for higher failure rate', () => {
    const store = new GraphStore();
    store.addNode({ id: 'module:db', type: 'module', name: 'db', metadata: {} });

    // 4 failures, 1 success
    for (let i = 0; i < 4; i++) {
      addOutcome(store, `outcome:f${i}`, 'module:db', 'failure');
    }
    addOutcome(store, 'outcome:s0', 'module:db', 'success');

    const spec = makeSpec({
      affectedSystems: [makeSystem({ name: 'db', graphNodeId: 'module:db', confidence: 0.9 })],
    });

    const highFailure = computeHistoricalComplexity(spec, store);

    // Compare with mostly-success scenario
    const store2 = new GraphStore();
    store2.addNode({ id: 'module:db', type: 'module', name: 'db', metadata: {} });
    addOutcome(store2, 'outcome:f0', 'module:db', 'failure');
    for (let i = 0; i < 4; i++) {
      addOutcome(store2, `outcome:s${i}`, 'module:db', 'success');
    }

    const lowFailure = computeHistoricalComplexity(spec, store2);

    expect(highFailure).toBeGreaterThan(lowFailure);
  });

  it('aggregates across multiple affected systems', () => {
    const store = new GraphStore();
    store.addNode({ id: 'module:auth', type: 'module', name: 'auth', metadata: {} });
    store.addNode({ id: 'module:api', type: 'module', name: 'api', metadata: {} });

    addOutcome(store, 'outcome:1', 'module:auth', 'failure');
    addOutcome(store, 'outcome:2', 'module:api', 'failure');

    const spec = makeSpec({
      affectedSystems: [
        makeSystem({ name: 'auth', graphNodeId: 'module:auth', confidence: 0.9 }),
        makeSystem({ name: 'api', graphNodeId: 'module:api', confidence: 0.9 }),
      ],
    });

    const result = computeHistoricalComplexity(spec, store);
    expect(result).toBeGreaterThan(0);
  });

  it('clamps to [0, 1] range', () => {
    const store = new GraphStore();
    store.addNode({ id: 'module:x', type: 'module', name: 'x', metadata: {} });

    // Many failures to push score high
    for (let i = 0; i < 50; i++) {
      addOutcome(store, `outcome:f${i}`, 'module:x', 'failure');
    }

    const spec = makeSpec({
      affectedSystems: [makeSystem({ name: 'x', graphNodeId: 'module:x', confidence: 0.9 })],
    });

    const result = computeHistoricalComplexity(spec, store);
    expect(result).toBeLessThanOrEqual(1);
    expect(result).toBeGreaterThanOrEqual(0);
  });
});
```

2. Run: `cd packages/intelligence && npx vitest run tests/cml/historical.test.ts` -- observe all tests fail (module not found)
3. Run: `harness validate`
4. Commit: `test(intelligence): add computeHistoricalComplexity test suite`

---

### Task 6: Implement computeHistoricalComplexity

**Depends on:** Task 5 | **Files:** `packages/intelligence/src/cml/historical.ts`

1. Create `packages/intelligence/src/cml/historical.ts`:

```typescript
import type { GraphStore } from '@harness-engineering/graph';
import type { EnrichedSpec } from '../types.js';

/**
 * Smoothing constant to prevent extreme scores from small sample sizes.
 * With SMOOTHING = 2, a single failure yields ~0.33 instead of 1.0.
 */
const SMOOTHING = 2;

interface SystemOutcomeCounts {
  failures: number;
  successes: number;
}

/**
 * Count failure and success outcomes linked to a specific system node
 * by traversing inbound 'outcome_of' edges.
 */
function countOutcomesForSystem(store: GraphStore, systemNodeId: string): SystemOutcomeCounts {
  const edges = store.getEdges({ to: systemNodeId, type: 'outcome_of' });

  let failures = 0;
  let successes = 0;

  for (const edge of edges) {
    const outcomeNode = store.getNode(edge.from);
    if (!outcomeNode || outcomeNode.type !== 'execution_outcome') continue;

    if (outcomeNode.metadata.result === 'failure') {
      failures++;
    } else if (outcomeNode.metadata.result === 'success') {
      successes++;
    }
  }

  return { failures, successes };
}

/**
 * Compute a failure rate for a system using Laplace-style smoothing.
 *
 * Formula: failures / (failures + successes + SMOOTHING)
 *
 * Returns 0 when no outcomes exist. Returns values in (0, 1) otherwise.
 */
function computeFailureRate(counts: SystemOutcomeCounts): number {
  const total = counts.failures + counts.successes;
  if (total === 0) return 0;
  return counts.failures / (total + SMOOTHING);
}

/**
 * Compute historical complexity from past execution outcomes in the graph.
 *
 * For each affected system with a graph node ID, queries the graph for
 * 'execution_outcome' nodes linked via 'outcome_of' edges. Computes
 * a smoothed failure rate per system, then returns the maximum across
 * all systems.
 *
 * Returns a value in [0, 1]. Returns 0 when no outcomes exist.
 */
export function computeHistoricalComplexity(spec: EnrichedSpec, store: GraphStore): number {
  const systemsWithGraph = spec.affectedSystems.filter((s) => s.graphNodeId !== null);

  if (systemsWithGraph.length === 0) return 0;

  let maxFailureRate = 0;

  for (const system of systemsWithGraph) {
    const counts = countOutcomesForSystem(store, system.graphNodeId!);
    const rate = computeFailureRate(counts);
    if (rate > maxFailureRate) {
      maxFailureRate = rate;
    }
  }

  return Math.max(0, Math.min(1, maxFailureRate));
}
```

2. Run: `cd packages/intelligence && npx vitest run tests/cml/historical.test.ts` -- all 7 tests pass
3. Run: `harness validate`
4. Commit: `feat(intelligence): implement CML historical dimension with smoothed failure rate`

---

### Task 7: Wire historical dimension into CML scorer and update tests

**Depends on:** Task 6 | **Files:** `packages/intelligence/src/cml/scorer.ts`, `packages/intelligence/tests/cml/scorer.test.ts`

1. Modify `packages/intelligence/src/cml/scorer.ts`:

   a. Add import at line 3 (after `import { computeSemanticComplexity }`):

   ```typescript
   import { computeHistoricalComplexity } from './historical.js';
   ```

   b. Replace line 13 (`computeConfidence` function) to account for historical data:

   ```typescript
   function computeConfidence(
     structuralScore: number,
     semanticScore: number,
     historicalScore: number
   ): number {
     const hasStructural = structuralScore > 0;
     const hasSemantic = semanticScore > 0;
     const hasHistorical = historicalScore > 0;
     const dataSourceCount =
       (hasStructural ? 1 : 0) + (hasSemantic ? 1 : 0) + (hasHistorical ? 1 : 0);
     if (dataSourceCount >= 2) return 0.8;
     if (dataSourceCount === 1) return 0.5;
     return 0.3;
   }
   ```

   c. Replace line 46 (`const historical = 0; // Phase 3 placeholder`) with:

   ```typescript
   const historical = computeHistoricalComplexity(spec, store);
   ```

   d. Update line 11 (`const confidence = ...`) to pass historical:

   ```typescript
   const confidence = computeConfidence(structural.score, semantic, historical);
   ```

   e. Update the reasoning line for historical (line 58) to remove "Phase 3 placeholder":

   ```typescript
   `Historical complexity: ${historical.toFixed(2)} (from past execution outcomes)`,
   ```

2. Modify `packages/intelligence/tests/cml/scorer.test.ts` -- add a new describe block after the existing `describe('recommended route', ...)` block:

```typescript
describe('historical dimension integration', () => {
  it('historical dimension is 0 when no outcomes exist', () => {
    const store = new GraphStore();
    const spec = makeSpec({
      affectedSystems: [makeSystem({ name: 'auth', graphNodeId: 'auth-node', confidence: 0.9 })],
    });
    store.addNode({ id: 'auth-node', type: 'module', name: 'auth', metadata: {} });

    const result = score(spec, store);
    expect(result.dimensions.historical).toBe(0);
  });

  it('historical dimension is > 0 when past failures exist for affected system', () => {
    const store = new GraphStore();
    store.addNode({ id: 'auth-node', type: 'module', name: 'auth', metadata: {} });

    // Add 3 failure outcomes linked to auth-node
    for (let i = 0; i < 3; i++) {
      store.addNode({
        id: `outcome:f${i}`,
        type: 'execution_outcome',
        name: `failure: T-${i}`,
        metadata: {
          result: 'failure',
          issueId: `i${i}`,
          identifier: `T-${i}`,
          retryCount: 0,
          failureReasons: [],
          durationMs: 1000,
          linkedSpecId: null,
          timestamp: '2026-04-14T12:00:00Z',
        },
      });
      store.addEdge({ from: `outcome:f${i}`, to: 'auth-node', type: 'outcome_of' });
    }

    const spec = makeSpec({
      affectedSystems: [makeSystem({ name: 'auth', graphNodeId: 'auth-node', confidence: 0.9 })],
    });

    const result = score(spec, store);
    expect(result.dimensions.historical).toBeGreaterThan(0);
    expect(result.reasoning.some((r) => r.includes('Historical complexity'))).toBe(true);
  });

  it('historical data increases overall score', () => {
    // Without outcomes
    const storeEmpty = new GraphStore();
    storeEmpty.addNode({ id: 'mod-a', type: 'module', name: 'mod-a', metadata: {} });
    const specA = makeSpec({
      affectedSystems: [makeSystem({ name: 'mod-a', graphNodeId: 'mod-a', confidence: 0.9 })],
      unknowns: ['u1'],
    });
    const scoreWithout = score(specA, storeEmpty);

    // With failure outcomes
    const storeWithFailures = new GraphStore();
    storeWithFailures.addNode({ id: 'mod-a', type: 'module', name: 'mod-a', metadata: {} });
    for (let i = 0; i < 5; i++) {
      storeWithFailures.addNode({
        id: `outcome:f${i}`,
        type: 'execution_outcome',
        name: `failure: T-${i}`,
        metadata: {
          result: 'failure',
          issueId: `i${i}`,
          identifier: `T-${i}`,
          retryCount: 0,
          failureReasons: [],
          durationMs: 1000,
          linkedSpecId: null,
          timestamp: '2026-04-14T12:00:00Z',
        },
      });
      storeWithFailures.addEdge({ from: `outcome:f${i}`, to: 'mod-a', type: 'outcome_of' });
    }
    const scoreWith = score(specA, storeWithFailures);

    expect(scoreWith.overall).toBeGreaterThan(scoreWithout.overall);
  });
});
```

3. Run: `cd packages/intelligence && npx vitest run tests/cml/` -- all existing + new tests pass
4. Run: `harness validate`
5. Commit: `feat(intelligence): wire CML historical dimension from execution outcomes`

---

### Task 8: Add recordOutcome to IntelligencePipeline and update exports

**Depends on:** Task 4 | **Files:** `packages/intelligence/src/pipeline.ts`, `packages/intelligence/src/index.ts`

1. Modify `packages/intelligence/src/pipeline.ts`:

   a. Add imports after existing imports:

   ```typescript
   import { ExecutionOutcomeConnector } from './outcome/connector.js';
   import type { ExecutionOutcome } from './outcome/types.js';
   import type { OutcomeIngestResult } from './outcome/connector.js';
   ```

   b. Add `outcomeConnector` field to the class (after `private readonly simulator: PeslSimulator;`):

   ```typescript
   private readonly outcomeConnector: ExecutionOutcomeConnector;
   ```

   c. In the constructor, after `this.simulator = new PeslSimulator(...)`:

   ```typescript
   this.outcomeConnector = new ExecutionOutcomeConnector(store);
   ```

   d. Add `recordOutcome` method to the class (after `simulate` method):

   ```typescript
   /**
    * Record an execution outcome in the knowledge graph.
    * Called by the orchestrator after a worker exits.
    */
   recordOutcome(outcome: ExecutionOutcome): OutcomeIngestResult {
     return this.outcomeConnector.ingest(outcome);
   }
   ```

2. Modify `packages/intelligence/src/index.ts` -- add exports after the `// Pipeline` section:

```typescript
// Outcome
export { ExecutionOutcomeConnector } from './outcome/connector.js';
export type { ExecutionOutcome } from './outcome/types.js';
export type { OutcomeIngestResult } from './outcome/connector.js';

// CML Historical
export { computeHistoricalComplexity } from './cml/historical.js';
```

3. Run: `cd packages/intelligence && npx vitest run` -- all tests pass
4. Run: `harness validate`
5. Commit: `feat(intelligence): add recordOutcome to pipeline and export outcome types`

---

### Task 9: Wire outcome recording into orchestrator on worker exit

**Depends on:** Task 8 | **Files:** `packages/orchestrator/src/orchestrator.ts`

1. Modify `packages/orchestrator/src/orchestrator.ts`:

   a. Add `EnrichedSpec` import (already imported on line 16, verify it is there):

   ```typescript
   import type { ExecutionOutcome } from '@harness-engineering/intelligence';
   ```

   b. Add a class-level field to store enriched specs (after `private graphLoaded = false;` on line 71):

   ```typescript
   private enrichedSpecsByIssue: Map<string, import('@harness-engineering/intelligence').EnrichedSpec> = new Map();
   ```

   c. In `asyncTick()`, after enriched specs are computed (line ~286, inside the `for (const issue of candidatesResult.value)` loop, after `enrichedSpecs.set(issue.id, result.spec)`), add:

   ```typescript
   this.enrichedSpecsByIssue.set(issue.id, result.spec);
   ```

   d. Modify `emitWorkerExit()` (line ~664). After `const { nextState, effects } = applyEvent(...)` and before processing effects, add outcome recording:

   ```typescript
   // Record execution outcome in graph (if pipeline is enabled)
   if (this.pipeline) {
     const entry = this.state.running.get(issueId) ?? nextState.running.get(issueId);
     const enrichedSpec = this.enrichedSpecsByIssue.get(issueId);
     const affectedSystemNodeIds = enrichedSpec
       ? enrichedSpec.affectedSystems
           .filter((s) => s.graphNodeId !== null)
           .map((s) => s.graphNodeId!)
       : [];

     const outcome: ExecutionOutcome = {
       id: `outcome:${issueId}:${attempt ?? 0}`,
       issueId,
       identifier: entry?.identifier ?? issueId,
       result: reason === 'normal' ? 'success' : 'failure',
       retryCount: attempt ?? 0,
       failureReasons: error ? [error] : [],
       durationMs: entry ? Date.now() - new Date(entry.startedAt).getTime() : 0,
       linkedSpecId: enrichedSpec?.id ?? null,
       affectedSystemNodeIds,
       timestamp: new Date().toISOString(),
     };

     try {
       this.pipeline.recordOutcome(outcome);
       this.logger.info(`Recorded execution outcome for ${issueId}: ${reason}`, {
         issueId,
         result: outcome.result,
         edgesAdded: affectedSystemNodeIds.length,
       });
     } catch (err) {
       this.logger.warn(`Failed to record execution outcome for ${issueId}`, {
         error: String(err),
       });
     }

     // Clean up enriched spec cache for completed issues
     if (reason === 'normal') {
       this.enrichedSpecsByIssue.delete(issueId);
     }
   }
   ```

   The full modified `emitWorkerExit` method should read:

   ```typescript
   private async emitWorkerExit(
     issueId: string,
     reason: 'normal' | 'error',
     attempt: number | null,
     error?: string
   ): Promise<void> {
     // Record execution outcome in graph (if pipeline is enabled)
     if (this.pipeline) {
       const entry = this.state.running.get(issueId);
       const enrichedSpec = this.enrichedSpecsByIssue.get(issueId);
       const affectedSystemNodeIds = enrichedSpec
         ? enrichedSpec.affectedSystems
             .filter((s) => s.graphNodeId !== null)
             .map((s) => s.graphNodeId!)
         : [];

       const outcome: ExecutionOutcome = {
         id: `outcome:${issueId}:${attempt ?? 0}`,
         issueId,
         identifier: entry?.identifier ?? issueId,
         result: reason === 'normal' ? 'success' : 'failure',
         retryCount: attempt ?? 0,
         failureReasons: error ? [error] : [],
         durationMs: entry ? Date.now() - new Date(entry.startedAt).getTime() : 0,
         linkedSpecId: enrichedSpec?.id ?? null,
         affectedSystemNodeIds,
         timestamp: new Date().toISOString(),
       };

       try {
         this.pipeline.recordOutcome(outcome);
         this.logger.info(`Recorded execution outcome for ${issueId}: ${reason}`, {
           issueId,
           result: outcome.result,
         });
       } catch (err) {
         this.logger.warn(`Failed to record execution outcome for ${issueId}`, {
           error: String(err),
         });
       }

       // Clean up enriched spec cache for completed issues
       if (reason === 'normal') {
         this.enrichedSpecsByIssue.delete(issueId);
       }
     }

     const event: OrchestratorEvent = {
       type: 'worker_exit',
       issueId,
       reason,
       error,
       attempt,
     };
     const { nextState, effects } = applyEvent(this.state, event, this.config);
     this.state = nextState;

     // Process side effects immediately and await them
     for (const effect of effects) {
       await this.handleEffect(effect);
     }
     this.emit('state_change', this.getSnapshot());
   }
   ```

2. Run: `cd packages/orchestrator && npx vitest run` -- all 188+ tests pass (zero regressions)
3. Run: `cd packages/intelligence && npx vitest run` -- all tests pass
4. Run: `harness validate`
5. Commit: `feat(orchestrator): wire execution outcome recording on worker exit`

[checkpoint:human-verify] -- Verify that outcome recording in `emitWorkerExit` runs before the state machine event (so it can read `entry` from `this.state.running` before the state machine removes it). Also verify no cyclomatic complexity violations.

## Parallel Opportunities

- Tasks 2-4 (outcome connector) and Tasks 5-6 (historical dimension) are independent and could be developed in parallel after Task 1 completes.
- Task 7 depends on Task 6 only.
- Task 8 depends on Task 4 only.
- Task 9 depends on Tasks 7 and 8.

## Dependency Graph

```
Task 1 (graph schema)
  |
  +-- Task 2 (outcome types)
  |     |
  |     +-- Task 3 (connector tests)
  |           |
  |           +-- Task 4 (connector impl)
  |                 |
  |                 +-- Task 8 (pipeline + exports)
  |                       |
  +-- Task 5 (historical tests)    |
        |                          |
        +-- Task 6 (historical impl)|
              |                     |
              +-- Task 7 (scorer integration)
                    |               |
                    +---+---+-------+
                        |
                        Task 9 (orchestrator wiring)
```

## Risk Assessment

| Risk                                                                        | Mitigation                                                                                                                                                 |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `computeHistoricalComplexity` queries all outcome nodes in the graph (O(N)) | N is bounded by execution history which grows slowly. If performance becomes an issue, add a type-filtered index in GraphStore (future optimization).      |
| Enriched specs in `enrichedSpecsByIssue` map grow unboundedly               | Cleanup on normal exit. For error exits, specs are kept for retry attempts. A periodic cleanup (e.g., on tick) could be added if memory becomes a concern. |
| Pre-commit hooks may reject functions exceeding complexity threshold        | All functions are designed to stay under 15 cyclomatic complexity and 50 lines. Helper functions extracted to keep main functions small.                   |
| `exactOptionalPropertyTypes` may reject optional field assignments          | All optional fields use conditional spread pattern (`...(value !== undefined && { field: value })`).                                                       |
