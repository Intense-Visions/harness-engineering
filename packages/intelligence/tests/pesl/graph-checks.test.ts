import { describe, it, expect } from 'vitest';
import { GraphStore } from '@harness-engineering/graph';
import { runGraphOnlyChecks } from '../../src/pesl/graph-checks.js';
import type { EnrichedSpec, ComplexityScore, SimulationResult } from '../../src/types.js';

function makeSpec(overrides: Partial<EnrichedSpec> = {}): EnrichedSpec {
  return {
    id: 'spec-1',
    title: 'Fix button alignment',
    intent: 'Correct CSS alignment issue in header component',
    summary: 'The header button is misaligned on mobile viewports',
    affectedSystems: [
      {
        name: 'header-component',
        graphNodeId: null,
        confidence: 0,
        transitiveDeps: [],
        testCoverage: 0,
        owner: null,
      },
    ],
    functionalRequirements: ['Button aligns on mobile'],
    nonFunctionalRequirements: [],
    apiChanges: [],
    dbChanges: [],
    integrationPoints: [],
    assumptions: [],
    unknowns: [],
    ambiguities: [],
    riskSignals: [],
    initialComplexityHints: { textualComplexity: 0.1, structuralComplexity: 0.1 },
    ...overrides,
  };
}

function makeScore(overrides: Partial<ComplexityScore> = {}): ComplexityScore {
  return {
    overall: 0.15,
    confidence: 0.5,
    riskLevel: 'low',
    blastRadius: { services: 0, modules: 1, filesEstimated: 2, testFilesAffected: 1 },
    dimensions: { structural: 0.1, semantic: 0.1, historical: 0 },
    reasoning: ['Low complexity'],
    recommendedRoute: 'local',
    ...overrides,
  };
}

describe('runGraphOnlyChecks', () => {
  it('returns graph-only SimulationResult with empty graph', () => {
    const store = new GraphStore();
    const result = runGraphOnlyChecks(makeSpec(), makeScore(), store);

    expect(result.tier).toBe('graph-only');
    expect(result.executionConfidence).toBeGreaterThanOrEqual(0);
    expect(result.executionConfidence).toBeLessThanOrEqual(1);
    expect(result.abort).toBe(false);
    expect(result.simulatedPlan).toEqual([]);
    expect(Array.isArray(result.predictedFailures)).toBe(true);
    expect(Array.isArray(result.testGaps)).toBe(true);
    expect(Array.isArray(result.riskHotspots)).toBe(true);
  });

  it('produces riskHotspots from amplification points when graph has data', () => {
    const store = new GraphStore();
    store.addNode({ id: 'mod-a', name: 'module-a', type: 'module' });
    store.addNode({ id: 'mod-b', name: 'module-b', type: 'module' });
    store.addNode({ id: 'mod-c', name: 'module-c', type: 'module' });
    store.addNode({ id: 'test-1', name: 'test-a', type: 'test_result' });
    store.addEdge({ from: 'mod-a', to: 'mod-b', type: 'imports' });
    store.addEdge({ from: 'mod-a', to: 'mod-c', type: 'imports' });
    store.addEdge({ from: 'mod-a', to: 'test-1', type: 'tested_by' });

    const spec = makeSpec({
      affectedSystems: [
        {
          name: 'module-a',
          graphNodeId: 'mod-a',
          confidence: 0.9,
          transitiveDeps: ['mod-b', 'mod-c'],
          testCoverage: 1,
          owner: null,
        },
      ],
    });

    const result = runGraphOnlyChecks(spec, makeScore(), store);

    expect(result.tier).toBe('graph-only');
    expect(result.executionConfidence).toBeGreaterThan(0);
  });

  it('detects testGaps when affected systems have zero test coverage', () => {
    const store = new GraphStore();
    const spec = makeSpec({
      affectedSystems: [
        {
          name: 'untested-module',
          graphNodeId: 'mod-x',
          confidence: 0.8,
          transitiveDeps: [],
          testCoverage: 0,
          owner: null,
        },
      ],
    });

    const result = runGraphOnlyChecks(spec, makeScore(), store);

    expect(result.testGaps.length).toBeGreaterThanOrEqual(1);
    expect(result.testGaps[0]).toContain('untested-module');
  });

  it('returns high confidence for trivial specs with no graph issues', () => {
    const store = new GraphStore();
    const result = runGraphOnlyChecks(makeSpec(), makeScore(), store);

    expect(result.executionConfidence).toBeGreaterThanOrEqual(0.7);
  });
});
