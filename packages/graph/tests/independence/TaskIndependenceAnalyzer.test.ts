import { describe, it, expect } from 'vitest';
import { GraphStore } from '../../src/store/GraphStore.js';
import { TaskIndependenceAnalyzer } from '../../src/independence/TaskIndependenceAnalyzer.js';

describe('TaskIndependenceAnalyzer', () => {
  describe('validation', () => {
    it('throws on duplicate task IDs', () => {
      const analyzer = new TaskIndependenceAnalyzer();
      expect(() =>
        analyzer.analyze({
          tasks: [
            { id: 'a', files: ['f1.ts'] },
            { id: 'a', files: ['f2.ts'] },
          ],
        })
      ).toThrow('Duplicate task ID: "a"');
    });

    it('throws on empty files array', () => {
      const analyzer = new TaskIndependenceAnalyzer();
      expect(() =>
        analyzer.analyze({
          tasks: [
            { id: 'a', files: [] },
            { id: 'b', files: ['f1.ts'] },
          ],
        })
      ).toThrow('Task "a" has an empty files array');
    });
  });

  describe('file-only analysis (no graph)', () => {
    it('detects direct file overlap between two tasks', () => {
      const analyzer = new TaskIndependenceAnalyzer();
      const result = analyzer.analyze({
        tasks: [
          { id: 'a', files: ['src/shared.ts', 'src/a.ts'] },
          { id: 'b', files: ['src/shared.ts', 'src/b.ts'] },
        ],
      });

      expect(result.analysisLevel).toBe('file-only');
      expect(result.pairs).toHaveLength(1);
      expect(result.pairs[0]!.independent).toBe(false);
      expect(result.pairs[0]!.overlaps).toEqual([{ file: 'src/shared.ts', type: 'direct' }]);
    });

    it('reports independent when no files overlap', () => {
      const analyzer = new TaskIndependenceAnalyzer();
      const result = analyzer.analyze({
        tasks: [
          { id: 'a', files: ['src/a.ts'] },
          { id: 'b', files: ['src/b.ts'] },
        ],
      });

      expect(result.pairs[0]!.independent).toBe(true);
      expect(result.pairs[0]!.overlaps).toEqual([]);
    });

    it('uses file-only when depth is 0 even with graph store', () => {
      const store = new GraphStore();
      const analyzer = new TaskIndependenceAnalyzer(store);
      const result = analyzer.analyze({
        tasks: [
          { id: 'a', files: ['src/a.ts'] },
          { id: 'b', files: ['src/b.ts'] },
        ],
        depth: 0,
      });

      expect(result.analysisLevel).toBe('file-only');
      expect(result.depth).toBe(0);
    });

    it('includes graph-unavailable warning in verdict', () => {
      const analyzer = new TaskIndependenceAnalyzer();
      const result = analyzer.analyze({
        tasks: [
          { id: 'a', files: ['src/a.ts'] },
          { id: 'b', files: ['src/b.ts'] },
        ],
      });

      expect(result.verdict).toContain('Graph unavailable');
    });
  });

  describe('graph-expanded analysis', () => {
    function buildGraphWithImports(): GraphStore {
      const store = new GraphStore();
      // Files: a.ts -> shared.ts <- b.ts
      // a.ts imports shared.ts, b.ts imports shared.ts
      store.addNode({
        id: 'file:src/a.ts',
        type: 'file',
        name: 'a.ts',
        path: 'src/a.ts',
        metadata: {},
      });
      store.addNode({
        id: 'file:src/b.ts',
        type: 'file',
        name: 'b.ts',
        path: 'src/b.ts',
        metadata: {},
      });
      store.addNode({
        id: 'file:src/shared.ts',
        type: 'file',
        name: 'shared.ts',
        path: 'src/shared.ts',
        metadata: {},
      });
      store.addEdge({ from: 'file:src/a.ts', to: 'file:src/shared.ts', type: 'imports' });
      store.addEdge({ from: 'file:src/b.ts', to: 'file:src/shared.ts', type: 'imports' });
      return store;
    }

    it('detects transitive overlap via graph expansion at depth 1', () => {
      const store = buildGraphWithImports();
      const analyzer = new TaskIndependenceAnalyzer(store);
      const result = analyzer.analyze({
        tasks: [
          { id: 'a', files: ['src/a.ts'] },
          { id: 'b', files: ['src/b.ts'] },
        ],
        depth: 1,
      });

      expect(result.analysisLevel).toBe('graph-expanded');
      expect(result.pairs[0]!.independent).toBe(false);

      const transitiveOverlap = result.pairs[0]!.overlaps.find(
        (o) => o.type === 'transitive' && o.file === 'src/shared.ts'
      );
      expect(transitiveOverlap).toBeDefined();
      expect(transitiveOverlap!.via).toBeDefined();
    });

    it('does not detect transitive overlap at depth 0', () => {
      const store = buildGraphWithImports();
      const analyzer = new TaskIndependenceAnalyzer(store);
      const result = analyzer.analyze({
        tasks: [
          { id: 'a', files: ['src/a.ts'] },
          { id: 'b', files: ['src/b.ts'] },
        ],
        depth: 0,
      });

      expect(result.pairs[0]!.independent).toBe(true);
    });

    it('respects edgeTypes filter', () => {
      const store = buildGraphWithImports();
      // Add a 'calls' edge that would create a conflict
      store.addNode({
        id: 'file:src/called.ts',
        type: 'file',
        name: 'called.ts',
        path: 'src/called.ts',
        metadata: {},
      });
      store.addEdge({ from: 'file:src/a.ts', to: 'file:src/called.ts', type: 'calls' });
      store.addEdge({ from: 'file:src/b.ts', to: 'file:src/called.ts', type: 'calls' });

      const analyzer = new TaskIndependenceAnalyzer(store);

      // Only check 'calls' edges — should find overlap on called.ts
      const result = analyzer.analyze({
        tasks: [
          { id: 'a', files: ['src/a.ts'] },
          { id: 'b', files: ['src/b.ts'] },
        ],
        depth: 1,
        edgeTypes: ['calls'],
      });

      expect(result.pairs[0]!.independent).toBe(false);
      const calledOverlap = result.pairs[0]!.overlaps.find((o) => o.file === 'src/called.ts');
      expect(calledOverlap).toBeDefined();
    });

    it('handles files not found in graph gracefully', () => {
      const store = new GraphStore();
      // Graph is empty — no nodes exist
      const analyzer = new TaskIndependenceAnalyzer(store);
      const result = analyzer.analyze({
        tasks: [
          { id: 'a', files: ['src/a.ts'] },
          { id: 'b', files: ['src/b.ts'] },
        ],
        depth: 1,
      });

      // No graph nodes found, so falls back to direct-only comparison
      expect(result.analysisLevel).toBe('graph-expanded');
      expect(result.pairs[0]!.independent).toBe(true);
    });
  });

  describe('parallel grouping', () => {
    it('groups conflicting tasks together and independent tasks separately', () => {
      const analyzer = new TaskIndependenceAnalyzer();
      const result = analyzer.analyze({
        tasks: [
          { id: 'a', files: ['src/shared.ts'] },
          { id: 'b', files: ['src/shared.ts'] },
          { id: 'c', files: ['src/other.ts'] },
        ],
      });

      expect(result.groups).toHaveLength(2);
      // Find the group containing 'a' — it must also contain 'b'
      const groupWithA = result.groups.find((g) => g.includes('a'));
      expect(groupWithA).toContain('b');
      expect(groupWithA).not.toContain('c');
      // 'c' is in its own group
      const groupWithC = result.groups.find((g) => g.includes('c'));
      expect(groupWithC).toEqual(['c']);
    });

    it('puts all tasks in one group when all conflict', () => {
      const analyzer = new TaskIndependenceAnalyzer();
      const result = analyzer.analyze({
        tasks: [
          { id: 'a', files: ['src/shared.ts'] },
          { id: 'b', files: ['src/shared.ts'] },
          { id: 'c', files: ['src/shared.ts'] },
        ],
      });

      expect(result.groups).toHaveLength(1);
      expect(result.groups[0]).toHaveLength(3);
    });

    it('puts each task in its own group when all independent', () => {
      const analyzer = new TaskIndependenceAnalyzer();
      const result = analyzer.analyze({
        tasks: [
          { id: 'a', files: ['src/a.ts'] },
          { id: 'b', files: ['src/b.ts'] },
          { id: 'c', files: ['src/c.ts'] },
        ],
      });

      expect(result.groups).toHaveLength(3);
    });
  });

  describe('verdict', () => {
    it('says all tasks conflict when one group', () => {
      const analyzer = new TaskIndependenceAnalyzer();
      const result = analyzer.analyze({
        tasks: [
          { id: 'a', files: ['src/x.ts'] },
          { id: 'b', files: ['src/x.ts'] },
        ],
      });
      expect(result.verdict).toContain('must run serially');
    });

    it('says all independent when each task is its own group', () => {
      const analyzer = new TaskIndependenceAnalyzer();
      const result = analyzer.analyze({
        tasks: [
          { id: 'a', files: ['src/a.ts'] },
          { id: 'b', files: ['src/b.ts'] },
        ],
      });
      expect(result.verdict).toContain('can all run in parallel');
    });

    it('says N groups when mixed', () => {
      const analyzer = new TaskIndependenceAnalyzer();
      const result = analyzer.analyze({
        tasks: [
          { id: 'a', files: ['src/shared.ts'] },
          { id: 'b', files: ['src/shared.ts'] },
          { id: 'c', files: ['src/c.ts'] },
        ],
      });
      expect(result.verdict).toContain('2 independent groups');
      expect(result.verdict).toContain('2 parallel waves');
    });
  });
});
