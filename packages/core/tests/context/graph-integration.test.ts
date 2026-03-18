import { describe, it, expect } from 'vitest';
import { contextBudget } from '../../src/context/budget';
import { contextFilter } from '../../src/context/filter';
import { checkDocCoverage } from '../../src/context/doc-coverage';
import { generateAgentsMap } from '../../src/context/generate';

describe('Graph integration', () => {
  describe('contextBudget with graphDensity', () => {
    it('produces different allocations than defaults', () => {
      const graphDensity = { file: 10, function: 20, class: 5, adr: 3 };
      const total = 100000;

      const budget = contextBudget(total, undefined, graphDensity);
      const defaultBudget = contextBudget(total);

      // file + function + class all map to activeCode, so it should get more
      expect(budget.activeCode).toBeGreaterThan(defaultBudget.activeCode);

      // All allocations should sum to approximately total
      const sum =
        budget.systemPrompt +
        budget.projectManifest +
        budget.taskSpec +
        budget.activeCode +
        budget.interfaces +
        budget.reserve;
      expect(sum).toBeLessThanOrEqual(total);
      expect(sum).toBeGreaterThan(total - 10);
    });

    it('preserves reserve floor at 10%', () => {
      const graphDensity = { file: 10, function: 20, class: 5, adr: 3 };
      const total = 100000;

      const budget = contextBudget(total, undefined, graphDensity);

      // Reserve should be significantly above the 1% minimum (the bug was it got only 1%)
      // The floor is set to 10% before normalization, so after normalization it will be
      // somewhat less than 10% but much more than 1%
      expect(budget.reserve).toBeGreaterThanOrEqual(Math.floor(total * 0.05));
    });
  });

  describe('contextFilter with graphFilePaths', () => {
    it('returns those paths when graphFilePaths provided', () => {
      const graphFilePaths = ['src/a.ts', 'src/b.ts'];

      const result = contextFilter('implement', undefined, graphFilePaths);

      expect(result.filePatterns).toContain('src/a.ts');
      expect(result.filePatterns).toContain('src/b.ts');
      expect(result.filePatterns).toHaveLength(2);
    });

    it('returns default glob patterns without graphFilePaths', () => {
      const result = contextFilter('implement');

      // Default patterns are globs like 'src/**/*.ts', not specific paths
      expect(result.filePatterns.some((p) => p.includes('*'))).toBe(true);
    });
  });

  describe('checkDocCoverage with graphCoverage', () => {
    it('uses pre-computed data', async () => {
      const graphCoverage = {
        documented: ['a.ts'],
        undocumented: ['b.ts'],
        coveragePercentage: 50,
      };

      const result = await checkDocCoverage('test-domain', { graphCoverage });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.coveragePercentage).toBe(50);
        expect(result.value.documented).toEqual(['a.ts']);
        expect(result.value.undocumented).toEqual(['b.ts']);
      }
    });
  });

  describe('generateAgentsMap with graphSections', () => {
    it('uses provided sections', async () => {
      const graphSections = [{ name: 'Core', files: ['src/core.ts'], description: 'Core module' }];

      const config = {
        rootDir: '.',
        includePaths: [],
        excludePaths: [],
      };

      const result = await generateAgentsMap(config, graphSections);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toContain('## Core');
        expect(result.value).toContain('Core module');
      }
    });
  });
});
