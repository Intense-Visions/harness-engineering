import { describe, it, expect } from 'vitest';
import { GraphStore } from '@harness-engineering/graph';
import { score } from '../../src/cml/scorer.js';
import { computeSemanticComplexity } from '../../src/cml/semantic.js';
import { computeStructuralComplexity } from '../../src/cml/structural.js';
import type { EnrichedSpec, AffectedSystem } from '../../src/types.js';

/* ---------- helpers ---------- */

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
 * Populate a graph store with a simple chain from a source node to N downstream
 * file nodes via "imports" edges.
 */
function buildGraphChain(store: GraphStore, sourceId: string, chainLength: number): void {
  store.addNode({ id: sourceId, name: sourceId, type: 'file' });
  let prevId = sourceId;
  for (let i = 1; i <= chainLength; i++) {
    const nodeId = `${sourceId}-dep-${i}`;
    store.addNode({ id: nodeId, name: nodeId, type: 'file' });
    store.addEdge({ from: prevId, to: nodeId, type: 'imports' });
    prevId = nodeId;
  }
}

/**
 * Build a fan-out graph where the source node directly imports N downstream
 * file nodes. This creates many affected nodes with high cumulative probability.
 */
function buildGraphFanOut(store: GraphStore, sourceId: string, fanOut: number): void {
  store.addNode({ id: sourceId, name: sourceId, type: 'file' });
  for (let i = 1; i <= fanOut; i++) {
    const nodeId = `${sourceId}-fan-${i}`;
    store.addNode({ id: nodeId, name: nodeId, type: 'file' });
    store.addEdge({ from: sourceId, to: nodeId, type: 'imports' });
  }
}

/* ---------- tests ---------- */

describe('CML scorer', () => {
  describe('low-complexity spec', () => {
    it('produces overall < 0.3, riskLevel "low" for a minimal spec', () => {
      const store = new GraphStore();
      const spec = makeSpec({
        affectedSystems: [makeSystem({ name: 'auth', graphNodeId: null })],
        unknowns: [],
        ambiguities: [],
        riskSignals: [],
      });

      const result = score(spec, store);

      expect(result.overall).toBeLessThan(0.3);
      expect(result.riskLevel).toBe('low');
      expect(result.recommendedRoute).toBe('local');
      expect(result.dimensions.structural).toBe(0);
      expect(result.dimensions.semantic).toBe(0);
      expect(result.dimensions.historical).toBe(0);
    });
  });

  describe('high-complexity spec', () => {
    it('produces overall > 0.5 for a spec with many systems, unknowns, and ambiguities', () => {
      const store = new GraphStore();

      // Create 8 systems, each with a fan-out of 40 downstream nodes to generate
      // enough probability-weighted affected nodes for a high structural score.
      // Each fan-out node contributes ~0.35 cumulative probability, so
      // 8 * 40 * 0.35 = 112 weighted nodes → normalized to 1.0 structural.
      const systems: AffectedSystem[] = [];
      for (let i = 0; i < 8; i++) {
        const sourceId = `service-${i}`;
        buildGraphFanOut(store, sourceId, 40);
        systems.push(makeSystem({ name: `service-${i}`, graphNodeId: sourceId, confidence: 0.9 }));
      }

      const spec = makeSpec({
        affectedSystems: systems,
        unknowns: ['unknown-1', 'unknown-2', 'unknown-3', 'unknown-4', 'unknown-5'],
        ambiguities: ['ambiguity-1', 'ambiguity-2', 'ambiguity-3', 'ambiguity-4'],
        riskSignals: ['risk-1', 'risk-2', 'risk-3'],
      });

      const result = score(spec, store);

      expect(result.overall).toBeGreaterThan(0.5);
      expect(result.dimensions.structural).toBeGreaterThan(0);
      expect(result.dimensions.semantic).toBeGreaterThan(0);
      expect(result.reasoning.length).toBeGreaterThan(0);
    });
  });

  describe('deterministic scoring', () => {
    it('returns identical results on multiple invocations', () => {
      const store = new GraphStore();
      buildGraphChain(store, 'svc', 5);

      const spec = makeSpec({
        affectedSystems: [makeSystem({ name: 'svc', graphNodeId: 'svc', confidence: 0.8 })],
        unknowns: ['u1'],
        ambiguities: ['a1'],
        riskSignals: ['r1'],
      });

      const first = score(spec, store);
      const second = score(spec, store);

      expect(first.overall).toBe(second.overall);
      expect(first.dimensions).toEqual(second.dimensions);
      expect(first.riskLevel).toBe(second.riskLevel);
      expect(first.recommendedRoute).toBe(second.recommendedRoute);
      expect(first.confidence).toBe(second.confidence);
    });
  });

  describe('no graph data fallback', () => {
    it('structural score is 0, falls back to semantic-only', () => {
      const store = new GraphStore();
      const spec = makeSpec({
        affectedSystems: [makeSystem({ name: 'unknown-system', graphNodeId: null })],
        unknowns: ['u1', 'u2'],
        ambiguities: ['a1'],
        riskSignals: [],
      });

      const result = score(spec, store);

      expect(result.dimensions.structural).toBe(0);
      expect(result.dimensions.semantic).toBeGreaterThan(0);
      expect(result.blastRadius).toEqual({
        services: 0,
        modules: 0,
        filesEstimated: 0,
        testFilesAffected: 0,
      });
      // Confidence should be 0.5 (only semantic has data)
      expect(result.confidence).toBe(0.5);
    });
  });

  describe('computeSemanticComplexity', () => {
    it('returns 0 for an empty spec', () => {
      const spec = makeSpec();
      expect(computeSemanticComplexity(spec)).toBe(0);
    });

    it('returns a value in [0, 1]', () => {
      const spec = makeSpec({
        unknowns: ['u1', 'u2', 'u3', 'u4', 'u5'],
        ambiguities: ['a1', 'a2', 'a3', 'a4', 'a5'],
        riskSignals: ['r1', 'r2', 'r3', 'r4', 'r5'],
      });

      const result = computeSemanticComplexity(spec);
      expect(result).toBeGreaterThanOrEqual(0);
      expect(result).toBeLessThanOrEqual(1);
    });

    it('increases with more unknowns/ambiguities/risk signals', () => {
      const low = computeSemanticComplexity(makeSpec({ unknowns: ['u1'] }));
      const high = computeSemanticComplexity(
        makeSpec({ unknowns: ['u1', 'u2', 'u3'], ambiguities: ['a1', 'a2'] })
      );
      expect(high).toBeGreaterThan(low);
    });
  });

  describe('computeStructuralComplexity', () => {
    it('returns 0 when no systems have graphNodeId', () => {
      const store = new GraphStore();
      const spec = makeSpec({
        affectedSystems: [makeSystem({ graphNodeId: null })],
      });

      const result = computeStructuralComplexity(spec, store);
      expect(result.score).toBe(0);
      expect(result.blastRadius.filesEstimated).toBe(0);
    });

    it('returns a positive score when graph data exists', () => {
      const store = new GraphStore();
      buildGraphChain(store, 'root', 5);

      const spec = makeSpec({
        affectedSystems: [makeSystem({ name: 'root', graphNodeId: 'root', confidence: 0.9 })],
      });

      const result = computeStructuralComplexity(spec, store);
      expect(result.score).toBeGreaterThan(0);
    });
  });

  describe('risk level thresholds', () => {
    it('maps overall < 0.3 to "low"', () => {
      const store = new GraphStore();
      const result = score(makeSpec(), store);
      expect(result.riskLevel).toBe('low');
    });
  });

  describe('recommended route', () => {
    it('routes low risk to "local"', () => {
      const store = new GraphStore();
      const result = score(makeSpec(), store);
      expect(result.recommendedRoute).toBe('local');
    });
  });

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
});
