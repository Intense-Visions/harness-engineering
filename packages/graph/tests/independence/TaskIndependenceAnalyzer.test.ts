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
});
