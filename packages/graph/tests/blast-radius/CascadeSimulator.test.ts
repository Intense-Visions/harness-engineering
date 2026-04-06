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
      const dNodes = result.flatSummary.filter(n => n.nodeId === 'file:d');
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

      const ids = result.flatSummary.map(n => n.nodeId);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });

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
      expect(result.flatSummary.map(n => n.nodeId)).toContain('file:b');
      expect(result.flatSummary.map(n => n.nodeId)).not.toContain('file:a');
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

      expect(result.summary.highRisk).toBe(1);   // 0.8 >= 0.5
      expect(result.summary.mediumRisk).toBe(1);  // 0.3 >= 0.2 and < 0.5
      expect(result.summary.lowRisk).toBe(1);     // 0.1 < 0.2
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
        expect(result.flatSummary[i - 1].cumulativeProbability)
          .toBeGreaterThanOrEqual(result.flatSummary[i].cumulativeProbability);
      }
    });
  });
});
