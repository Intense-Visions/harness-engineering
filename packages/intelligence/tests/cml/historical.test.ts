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
