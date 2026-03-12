import { describe, it, expect } from 'vitest';
import { validateKnowledgeMap } from '../../src/context/knowledge-map';
import { join } from 'path';

describe('validateKnowledgeMap', () => {
  const fixturesDir = join(__dirname, '../fixtures');

  it('should report broken links with details', async () => {
    const rootDir = join(fixturesDir, 'broken-links-project');
    const result = await validateKnowledgeMap(rootDir);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.brokenLinks.length).toBeGreaterThan(0);

      const brokenLink = result.value.brokenLinks[0];
      expect(brokenLink.reason).toBe('NOT_FOUND');
      expect(brokenLink.suggestion).toBeDefined();
      expect(brokenLink.section).toBeDefined();
    }
  });

  it('should calculate integrity percentage', async () => {
    const rootDir = join(fixturesDir, 'broken-links-project');
    const result = await validateKnowledgeMap(rootDir);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.integrity).toBeLessThan(100);
      expect(result.value.integrity).toBeGreaterThanOrEqual(0);
      expect(result.value.totalLinks).toBeGreaterThan(0);
      expect(result.value.validLinks + result.value.brokenLinks.length).toBe(
        result.value.totalLinks
      );
    }
  });

  it('should return 100% integrity for valid project', async () => {
    const rootDir = join(fixturesDir, 'valid-project');
    const result = await validateKnowledgeMap(rootDir);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.integrity).toBe(100);
      expect(result.value.brokenLinks).toHaveLength(0);
    }
  });

  it('should return error when AGENTS.md is missing', async () => {
    const rootDir = join(fixturesDir, 'non-existent-project');
    const result = await validateKnowledgeMap(rootDir);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('PARSE_ERROR');
    }
  });
});
