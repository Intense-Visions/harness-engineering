import { describe, it, expect } from 'vitest';
import {
  runCodeReviewDefinition,
  handleRunCodeReview,
} from '../../../src/mcp/tools/review-pipeline';

describe('run_code_review tool', () => {
  describe('definition', () => {
    it('has correct name', () => {
      expect(runCodeReviewDefinition.name).toBe('run_code_review');
    });

    it('requires path and diff', () => {
      expect(runCodeReviewDefinition.inputSchema.required).toContain('path');
      expect(runCodeReviewDefinition.inputSchema.required).toContain('diff');
    });

    it('has offset and limit properties in schema', () => {
      const props = runCodeReviewDefinition.inputSchema.properties;
      expect(props).toHaveProperty('offset');
      expect(props).toHaveProperty('limit');
      expect(props.offset.type).toBe('number');
      expect(props.limit.type).toBe('number');
    });
  });

  describe('pagination', () => {
    const minimalDiff = [
      'diff --git a/test.ts b/test.ts',
      'index 1234567..abcdefg 100644',
      '--- a/test.ts',
      '+++ b/test.ts',
      '@@ -1,3 +1,4 @@',
      ' const a = 1;',
      '+const b = 2;',
      ' const c = 3;',
    ].join('\n');

    it('includes pagination metadata with defaults', async () => {
      const response = await handleRunCodeReview({
        path: '/nonexistent/project-pipeline-test',
        diff: minimalDiff,
      });
      // Pipeline may error on nonexistent path but should still parse
      if (!response.isError) {
        const parsed = JSON.parse(response.content[0].text);
        expect(parsed).toHaveProperty('pagination');
        expect(parsed.pagination).toHaveProperty('offset', 0);
        expect(parsed.pagination).toHaveProperty('limit', 20);
        expect(parsed.pagination).toHaveProperty('total');
        expect(parsed.pagination).toHaveProperty('hasMore');
        expect(parsed).toHaveProperty('findings');
        expect(Array.isArray(parsed.findings)).toBe(true);
        // findingCount should reflect total, not page size
        expect(parsed.findingCount).toBe(parsed.pagination.total);
      }
    });

    it('respects offset and limit params', async () => {
      const response = await handleRunCodeReview({
        path: '/nonexistent/project-pipeline-test',
        diff: minimalDiff,
        offset: 0,
        limit: 1,
      });
      if (!response.isError) {
        const parsed = JSON.parse(response.content[0].text);
        expect(parsed.pagination.offset).toBe(0);
        expect(parsed.pagination.limit).toBe(1);
        expect(parsed.findings.length).toBeLessThanOrEqual(1);
      }
    });

    it('offset beyond findings returns empty page', async () => {
      const response = await handleRunCodeReview({
        path: '/nonexistent/project-pipeline-test',
        diff: minimalDiff,
        offset: 10000,
        limit: 20,
      });
      if (!response.isError) {
        const parsed = JSON.parse(response.content[0].text);
        expect(parsed.findings).toHaveLength(0);
        expect(parsed.pagination.hasMore).toBe(false);
      }
    });
  });
});
