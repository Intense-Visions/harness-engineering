import { describe, it, expect } from 'vitest';
import { compactToolDefinition, handleCompact } from '../../../src/mcp/tools/compact';

describe('compact tool', () => {
  describe('definition', () => {
    it('has correct name and required fields', () => {
      expect(compactToolDefinition.name).toBe('compact');
      expect(compactToolDefinition.inputSchema.required).toContain('path');
    });
  });

  describe('content mode', () => {
    it('compacts JSON content using default strategies', async () => {
      const result = await handleCompact({
        path: '/tmp/test-project',
        content: JSON.stringify({
          items: Array.from({ length: 50 }, (_, i) => ({
            id: i,
            name: `item-${i}`,
            empty: null,
            arr: [],
            nested: { blank: '' },
          })),
        }),
      });

      expect(result.isError).toBeUndefined();
      const text = result.content[0].text;
      // Should have packed header
      expect(text).toMatch(/<!-- packed:/);
      // Should have reduction metadata
      expect(text).toMatch(/\d+→\d+ tokens \(-\d+%\)/);
      // Should preserve real data
      expect(text).toContain('item-0');
      // Should strip null/empty fields
      expect(text).not.toContain('"empty"');
    });

    it('respects custom tokenBudget', async () => {
      const largeContent = JSON.stringify({
        data: Array.from({ length: 500 }, (_, i) => ({
          id: i,
          path: `/src/mod-${i}.ts`,
          status: 'ok',
          description: `Module ${i} provides utility functions for domain area ${i}.`,
        })),
      });
      const result = await handleCompact({
        path: '/tmp/test-project',
        content: largeContent,
        tokenBudget: 1000,
      });

      const text = result.content[0].text;
      expect(text).toMatch(/<!-- packed:/);
      // Compacted text should be within budget (1000 tokens ~ 4000 chars, plus header)
      expect(text.length).toBeLessThan(6000);
    });

    it('respects custom strategies array', async () => {
      const result = await handleCompact({
        path: '/tmp/test-project',
        content: JSON.stringify({ a: null, b: '', c: 'real', d: [] }),
        strategies: ['structural'],
      });

      const text = result.content[0].text;
      expect(text).toMatch(/<!-- packed: structural/);
      expect(text).toContain('"c"');
    });

    it('returns error when no input mode is provided', async () => {
      const result = await handleCompact({ path: '/tmp/test-project' });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('must provide');
    });
  });
});
