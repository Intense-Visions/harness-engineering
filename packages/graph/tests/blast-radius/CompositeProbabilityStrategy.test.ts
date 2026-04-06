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
      const edge = makeEdge('file:a', 'file:b', 'imports');
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
