import { describe, it, expect } from 'vitest';
import {
  reviewChangesDefinition,
  handleReviewChanges,
} from '../../../src/mcp/tools/review-changes';

describe('review_changes tool', () => {
  describe('definition', () => {
    it('has correct name', () => {
      expect(reviewChangesDefinition.name).toBe('review_changes');
    });

    it('requires path and depth', () => {
      expect(reviewChangesDefinition.inputSchema.required).toContain('path');
      expect(reviewChangesDefinition.inputSchema.required).toContain('depth');
    });

    it('has depth enum with quick, standard, deep', () => {
      const depthProp = reviewChangesDefinition.inputSchema.properties.depth;
      expect(depthProp.enum).toEqual(['quick', 'standard', 'deep']);
    });

    it('has optional diff and mode properties', () => {
      const props = reviewChangesDefinition.inputSchema.properties;
      expect(props).toHaveProperty('diff');
      expect(props).toHaveProperty('mode');
    });

    it('has optional offset and limit properties', () => {
      const props = reviewChangesDefinition.inputSchema.properties;
      expect(props).toHaveProperty('offset');
      expect(props).toHaveProperty('limit');
      expect(props.offset.type).toBe('number');
      expect(props.limit.type).toBe('number');
    });
  });

  describe('handler', () => {
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

    it('quick depth runs analyze_diff only', async () => {
      const response = await handleReviewChanges({
        path: '/nonexistent/project-rc-test',
        depth: 'quick',
        diff: minimalDiff,
      });
      expect(response.isError).toBeFalsy();
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed).toHaveProperty('depth', 'quick');
      expect(parsed).toHaveProperty('downgraded', false);
      expect(parsed).toHaveProperty('findings');
    });

    it('returns error when no diff provided and git fails', async () => {
      const response = await handleReviewChanges({
        path: '/nonexistent/project-rc-test',
        depth: 'quick',
      });
      expect(response.isError).toBe(true);
    });

    it('size gate downgrades deep to standard for large diffs', async () => {
      // Create a diff > 10000 lines
      const lines = [
        'diff --git a/big.ts b/big.ts',
        '--- a/big.ts',
        '+++ b/big.ts',
        '@@ -1,1 +1,10001 @@',
      ];
      for (let i = 0; i < 10001; i++) {
        lines.push(`+line${i}`);
      }
      const bigDiff = lines.join('\n');

      const response = await handleReviewChanges({
        path: '/nonexistent/project-rc-test',
        depth: 'deep',
        diff: bigDiff,
      });
      expect(response.isError).toBeFalsy();
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.downgraded).toBe(true);
      expect(parsed.depth).toBe('standard');
    });
  });

  describe('review_changes snapshot parity', () => {
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

    it('quick depth findings match analyze_diff output', async () => {
      const { handleAnalyzeDiff } = await import('../../../src/mcp/tools/feedback');

      const compositeResponse = await handleReviewChanges({
        path: '/nonexistent/project-parity',
        depth: 'quick',
        diff: minimalDiff,
      });
      const compositeData = JSON.parse(compositeResponse.content[0].text);

      const directResult = await handleAnalyzeDiff({
        diff: minimalDiff,
        path: '/nonexistent/project-parity',
      });
      const directParsed = JSON.parse(directResult.content[0].text);

      expect(compositeData.findings).toEqual(directParsed.findings ?? directParsed.warnings ?? []);
    });

    it('standard depth includes both analyze_diff and create_self_review findings', async () => {
      const response = await handleReviewChanges({
        path: '/nonexistent/project-parity',
        depth: 'standard',
        diff: minimalDiff,
      });
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed).toHaveProperty('diffAnalysis');
      expect(parsed).toHaveProperty('selfReview');
      expect(parsed.depth).toBe('standard');
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

    it('quick depth includes pagination metadata with defaults', async () => {
      const response = await handleReviewChanges({
        path: '/nonexistent/project-pagination',
        depth: 'quick',
        diff: minimalDiff,
      });
      expect(response.isError).toBeFalsy();
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed).toHaveProperty('pagination');
      expect(parsed.pagination).toHaveProperty('offset', 0);
      expect(parsed.pagination).toHaveProperty('limit', 20);
      expect(parsed.pagination).toHaveProperty('total');
      expect(typeof parsed.pagination.total).toBe('number');
      expect(parsed.pagination).toHaveProperty('hasMore');
    });

    it('standard depth includes pagination metadata', async () => {
      const response = await handleReviewChanges({
        path: '/nonexistent/project-pagination',
        depth: 'standard',
        diff: minimalDiff,
      });
      expect(response.isError).toBeFalsy();
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed).toHaveProperty('pagination');
      expect(parsed.pagination.offset).toBe(0);
      expect(parsed.pagination.limit).toBe(20);
    });

    it('respects offset and limit params', async () => {
      const response = await handleReviewChanges({
        path: '/nonexistent/project-pagination',
        depth: 'quick',
        diff: minimalDiff,
        offset: 0,
        limit: 1,
      });
      expect(response.isError).toBeFalsy();
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.pagination.offset).toBe(0);
      expect(parsed.pagination.limit).toBe(1);
    });

    it('offset beyond findings returns empty with hasMore false', async () => {
      const response = await handleReviewChanges({
        path: '/nonexistent/project-pagination',
        depth: 'quick',
        diff: minimalDiff,
        offset: 1000,
        limit: 20,
      });
      expect(response.isError).toBeFalsy();
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.findings).toHaveLength(0);
      expect(parsed.pagination.hasMore).toBe(false);
      expect(parsed.pagination.offset).toBe(1000);
    });
  });
});
