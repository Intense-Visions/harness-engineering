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
});
