import { describe, it, expect } from 'vitest';
import { codeOutlineDefinition, handleCodeOutline } from '../../../src/mcp/tools/code-nav';
import { join, resolve } from 'path';

// Resolve repo root from packages/cli/tests/mcp/tools -> up to repo root
const repoRoot = resolve(__dirname, '..', '..', '..', '..', '..');

describe('code_outline tool', () => {
  describe('definition', () => {
    it('has correct name', () => {
      expect(codeOutlineDefinition.name).toBe('code_outline');
    });

    it('has offset and limit properties in schema', () => {
      const props = codeOutlineDefinition.inputSchema.properties;
      expect(props).toHaveProperty('offset');
      expect(props).toHaveProperty('limit');
      expect(props.offset.type).toBe('number');
      expect(props.limit.type).toBe('number');
    });
  });

  describe('directory pagination', () => {
    // Use packages/core/src/code-nav as a test directory (contains known .ts files)
    const testDir = join(repoRoot, 'packages', 'core', 'src', 'code-nav');

    it('returns pagination metadata with default offset/limit', async () => {
      const result = await handleCodeOutline({ path: testDir });
      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed).toHaveProperty('pagination');
      expect(parsed.pagination).toHaveProperty('offset', 0);
      expect(parsed.pagination).toHaveProperty('limit', 30);
      expect(parsed.pagination).toHaveProperty('total');
      expect(typeof parsed.pagination.total).toBe('number');
      expect(parsed.pagination).toHaveProperty('hasMore');
    });

    it('respects offset and limit params', async () => {
      const fullResult = await handleCodeOutline({ path: testDir });
      const fullParsed = JSON.parse(fullResult.content[0].text);
      const total = fullParsed.pagination.total;

      if (total >= 2) {
        const pagedResult = await handleCodeOutline({
          path: testDir,
          offset: 1,
          limit: 1,
        });
        const pagedParsed = JSON.parse(pagedResult.content[0].text);
        expect(pagedParsed.pagination.offset).toBe(1);
        expect(pagedParsed.pagination.limit).toBe(1);
        expect(pagedParsed.pagination.total).toBe(total);
        expect(pagedParsed.pagination.hasMore).toBe(total > 2);
      }
    });

    it('returns hasMore false when all items fit', async () => {
      const result = await handleCodeOutline({
        path: testDir,
        offset: 0,
        limit: 100,
      });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.pagination.hasMore).toBe(false);
    });
  });

  describe('single file mode', () => {
    it('does not include pagination for single file', async () => {
      const testFile = join(repoRoot, 'packages', 'core', 'src', 'code-nav', 'types.ts');
      const result = await handleCodeOutline({ path: testFile });
      expect(result.isError).toBeFalsy();
      // Single file returns plain text, not JSON with pagination
      const text = result.content[0].text;
      expect(() => {
        const parsed = JSON.parse(text);
        expect(parsed).not.toHaveProperty('pagination');
      }).toThrow(); // Single file is plain text, not JSON
    });
  });
});
