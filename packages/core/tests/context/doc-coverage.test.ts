import { describe, it, expect } from 'vitest';
import { checkDocCoverage } from '../../src/context/doc-coverage';
import { join } from 'path';

describe('checkDocCoverage', () => {
  const fixturesDir = join(__dirname, '../fixtures');

  it('should calculate documentation coverage', async () => {
    const rootDir = join(fixturesDir, 'undocumented-project');
    const result = await checkDocCoverage('src', {
      docsDir: join(rootDir, 'docs'),
      sourceDir: join(rootDir, 'src'),
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.domain).toBe('src');
      expect(result.value.documented.length).toBeGreaterThan(0);
      expect(result.value.undocumented.length).toBeGreaterThan(0);
      expect(result.value.coveragePercentage).toBeLessThan(100);
    }
  });

  it('should identify documentation gaps', async () => {
    const rootDir = join(fixturesDir, 'undocumented-project');
    const result = await checkDocCoverage('src', {
      docsDir: join(rootDir, 'docs'),
      sourceDir: join(rootDir, 'src'),
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.gaps.length).toBeGreaterThan(0);
      const gap = result.value.gaps[0];
      expect(gap.file).toBeDefined();
      expect(gap.suggestedSection).toBeDefined();
      expect(['high', 'medium', 'low']).toContain(gap.importance);
    }
  });

  it('should support exclude patterns', async () => {
    const rootDir = join(fixturesDir, 'undocumented-project');
    const result = await checkDocCoverage('src', {
      docsDir: join(rootDir, 'docs'),
      sourceDir: join(rootDir, 'src'),
      excludePatterns: ['**/also-undocumented.ts'],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      // The excluded file should not appear in undocumented
      expect(result.value.undocumented).not.toContain(
        expect.stringContaining('also-undocumented')
      );
    }
  });

  it('should handle non-existent directories gracefully', async () => {
    const result = await checkDocCoverage('src', {
      docsDir: join(fixturesDir, 'non-existent/docs'),
      sourceDir: join(fixturesDir, 'non-existent/src'),
    });

    // Should return Ok with empty results (no files found)
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.documented).toHaveLength(0);
      expect(result.value.undocumented).toHaveLength(0);
      expect(result.value.coveragePercentage).toBe(100);
    }
  });
});
