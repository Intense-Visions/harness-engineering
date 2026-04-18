import { describe, it, expect } from 'vitest';
import { GraphStore } from '@harness-engineering/graph';
import { computeStructuralComplexity } from '../../src/cml/structural.js';
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

describe('computeStructuralComplexity', () => {
  it('returns zero score and empty blast radius when no affected systems exist', () => {
    const store = new GraphStore();
    const spec = makeSpec({ affectedSystems: [] });
    const result = computeStructuralComplexity(spec, store);

    expect(result.score).toBe(0);
    expect(result.blastRadius).toEqual({
      services: 0,
      modules: 0,
      filesEstimated: 0,
      testFilesAffected: 0,
    });
  });

  it('returns zero when affected systems have no graph node IDs', () => {
    const store = new GraphStore();
    const spec = makeSpec({
      affectedSystems: [makeSystem({ name: 'unresolved', graphNodeId: null })],
    });
    const result = computeStructuralComplexity(spec, store);

    expect(result.score).toBe(0);
    expect(result.blastRadius.filesEstimated).toBe(0);
  });

  it('returns a positive score when a resolved system has cascade dependencies', () => {
    const store = new GraphStore();
    store.addNode({ id: 'mod-a', name: 'module-a', type: 'module', metadata: {} });
    store.addNode({ id: 'mod-b', name: 'module-b', type: 'module', metadata: {} });
    store.addNode({ id: 'mod-c', name: 'module-c', type: 'module', metadata: {} });
    store.addEdge({ from: 'mod-a', to: 'mod-b', type: 'imports' });
    store.addEdge({ from: 'mod-b', to: 'mod-c', type: 'imports' });

    const spec = makeSpec({
      affectedSystems: [makeSystem({ name: 'module-a', graphNodeId: 'mod-a', confidence: 0.9 })],
    });

    const result = computeStructuralComplexity(spec, store);
    expect(result.score).toBeGreaterThan(0);
    expect(result.score).toBeLessThanOrEqual(1);
  });

  it('counts modules in blast radius', () => {
    const store = new GraphStore();
    store.addNode({ id: 'mod-a', name: 'module-a', type: 'module', metadata: {} });
    store.addNode({ id: 'mod-b', name: 'module-b', type: 'module', metadata: {} });
    store.addNode({ id: 'mod-c', name: 'module-c', type: 'module', metadata: {} });
    store.addEdge({ from: 'mod-a', to: 'mod-b', type: 'imports' });
    store.addEdge({ from: 'mod-a', to: 'mod-c', type: 'imports' });

    const spec = makeSpec({
      affectedSystems: [makeSystem({ name: 'module-a', graphNodeId: 'mod-a', confidence: 0.9 })],
    });

    const result = computeStructuralComplexity(spec, store);
    expect(result.blastRadius.modules).toBeGreaterThanOrEqual(1);
  });

  it('skips systems whose graph node ID is not found in the store', () => {
    const store = new GraphStore();
    // Node 'nonexistent' is not added to the store
    const spec = makeSpec({
      affectedSystems: [makeSystem({ name: 'ghost', graphNodeId: 'nonexistent', confidence: 0.5 })],
    });

    const result = computeStructuralComplexity(spec, store);
    expect(result.score).toBe(0);
    expect(result.blastRadius.filesEstimated).toBe(0);
  });

  it('aggregates across multiple affected systems', () => {
    const store = new GraphStore();
    store.addNode({ id: 'mod-a', name: 'module-a', type: 'module', metadata: {} });
    store.addNode({ id: 'mod-b', name: 'module-b', type: 'module', metadata: {} });
    store.addNode({ id: 'mod-c', name: 'module-c', type: 'module', metadata: {} });
    store.addEdge({ from: 'mod-a', to: 'mod-c', type: 'imports' });
    store.addEdge({ from: 'mod-b', to: 'mod-c', type: 'imports' });

    const specSingle = makeSpec({
      affectedSystems: [makeSystem({ name: 'module-a', graphNodeId: 'mod-a', confidence: 0.9 })],
    });
    const singleResult = computeStructuralComplexity(specSingle, store);

    const specMulti = makeSpec({
      affectedSystems: [
        makeSystem({ name: 'module-a', graphNodeId: 'mod-a', confidence: 0.9 }),
        makeSystem({ name: 'module-b', graphNodeId: 'mod-b', confidence: 0.9 }),
      ],
    });
    const multiResult = computeStructuralComplexity(specMulti, store);

    expect(multiResult.score).toBeGreaterThanOrEqual(singleResult.score);
  });

  it('clamps score to maximum of 1', () => {
    const store = new GraphStore();
    // Create a large graph to push weighted total above normalization ceiling
    const nodeCount = 150;
    for (let i = 0; i < nodeCount; i++) {
      store.addNode({ id: `mod-${i}`, name: `module-${i}`, type: 'module', metadata: {} });
    }
    // Chain all modules from root
    for (let i = 0; i < nodeCount - 1; i++) {
      store.addEdge({ from: `mod-${i}`, to: `mod-${i + 1}`, type: 'imports' });
    }

    const spec = makeSpec({
      affectedSystems: [makeSystem({ name: 'module-0', graphNodeId: 'mod-0', confidence: 1.0 })],
    });

    const result = computeStructuralComplexity(spec, store);
    expect(result.score).toBeLessThanOrEqual(1);
    expect(result.score).toBeGreaterThanOrEqual(0);
  });
});
