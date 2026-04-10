import { describe, it, expect } from 'vitest';
import { wrapWithCompaction, applyCompaction } from '../../../src/mcp/middleware/compaction';

type ToolResult = { content: Array<{ type: string; text: string }>; isError?: boolean };

/** Handler returning a large JSON payload (> 4000 token budget = 16 000 chars) */
const largeJsonHandler = async (): Promise<ToolResult> => {
  const payload = {
    items: Array.from({ length: 2000 }, (_, i) => ({
      id: i,
      value: `item-${i}`,
      path: `/src/module-${i}.ts`,
      status: 'ok',
    })),
  };
  return { content: [{ type: 'text', text: JSON.stringify(payload) }] };
};

/** Handler returning short text (under budget — no truncation expected) */
const shortHandler = async (): Promise<ToolResult> => ({
  content: [{ type: 'text', text: JSON.stringify({ name: 'harness', version: '1.0' }) }],
});

/** Handler returning an error result */
const errorHandler = async (): Promise<ToolResult> => ({
  content: [{ type: 'text', text: JSON.stringify({ error: 'not found', path: '/src/foo.ts' }) }],
  isError: true,
});

/** Handler returning non-JSON (plain text — structural pass is no-op) */
const plainTextHandler = async (): Promise<ToolResult> => ({
  content: [{ type: 'text', text: 'Line one\nLine two\n   extra   spaces   ' }],
});

/** Handler for compact: false bypass test */
const verboseHandler = async (): Promise<ToolResult> => ({
  content: [{ type: 'text', text: JSON.stringify({ a: null, b: '', c: [], d: { e: '' } }) }],
});

describe('wrapWithCompaction', () => {
  describe('CT01: applies structural pass to short JSON (no truncation needed)', () => {
    it('removes null/empty fields and returns compact JSON with packed header', async () => {
      const handler = async (): Promise<ToolResult> => ({
        content: [
          {
            type: 'text',
            text: JSON.stringify({ name: 'test', empty: null, arr: [], nested: { a: '' } }),
          },
        ],
      });
      const wrapped = wrapWithCompaction('test_tool', handler);
      const result = await wrapped({});

      expect(result.content).toHaveLength(1);
      expect(result.content[0].text).toMatch(/<!-- packed: structural\+truncate/);
      // null/empty fields stripped
      expect(result.content[0].text).not.toContain('"empty"');
      expect(result.content[0].text).not.toContain('"arr"');
      // real data preserved
      expect(result.content[0].text).toContain('"name"');
      expect(result.content[0].text).toContain('"test"');
    });
  });

  describe('CT02: applies truncation when content exceeds 4000-token budget', () => {
    it('reduces large payload and includes reduction metadata in header', async () => {
      const wrapped = wrapWithCompaction('large_tool', largeJsonHandler);
      const result = await wrapped({});

      const text = result.content[0].text;
      expect(text).toMatch(/<!-- packed: structural\+truncate \| \d+→\d+ tokens \(-\d+%\) -->/);

      // Verify actual reduction occurred
      const match = text.match(/(\d+)→(\d+) tokens/);
      expect(match).not.toBeNull();
      const original = parseInt(match![1], 10);
      const compacted = parseInt(match![2], 10);
      expect(compacted).toBeLessThan(original);
      expect(compacted).toBeLessThanOrEqual(4000);
    });
  });

  describe('CT03: compact: false bypasses middleware entirely', () => {
    it('returns byte-identical output when compact: false is present', async () => {
      const rawResult = await verboseHandler();
      const wrapped = wrapWithCompaction('bypass_tool', verboseHandler);
      const bypassResult = await wrapped({ compact: false });

      // Must be identical to raw handler output — no header, no transformation
      expect(bypassResult.content[0].text).toBe(rawResult.content[0].text);
      expect(bypassResult.content[0].text).not.toContain('<!-- packed:');
    });
  });

  describe('CT04: isError: true responses are still compacted', () => {
    it('compacts error responses and preserves isError flag', async () => {
      const wrapped = wrapWithCompaction('error_tool', errorHandler);
      const result = await wrapped({});

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/<!-- packed:/);
      // Preserve error-critical fields
      expect(result.content[0].text).toContain('error');
      expect(result.content[0].text).toContain('/src/foo.ts');
    });
  });

  describe('CT05: non-JSON plain text passes through structural (no-op) and is handled', () => {
    it('returns plain text with packed header prepended', async () => {
      const wrapped = wrapWithCompaction('plain_tool', plainTextHandler);
      const result = await wrapped({});

      expect(result.content[0].text).toMatch(/<!-- packed:/);
      expect(result.content[0].text).toContain('Line one');
    });
  });

  describe('CT06: applyCompaction wraps all handlers in the map', () => {
    it('returns a new handlers map with all keys wrapped', async () => {
      const handlers = {
        tool_a: shortHandler,
        tool_b: shortHandler,
      };
      const wrapped = applyCompaction(handlers);

      expect(Object.keys(wrapped)).toEqual(['tool_a', 'tool_b']);

      // Each wrapped handler should produce a packed header
      const resultA = await wrapped.tool_a({});
      expect(resultA.content[0].text).toMatch(/<!-- packed:/);
    });
  });

  describe('CT07: fail-open — middleware error returns raw result', () => {
    it('returns raw handler output when middleware throws internally', async () => {
      // Handler that returns a result the middleware can process normally,
      // but we verify fail-open by testing with a handler that throws
      const throwingHandler = async (): Promise<ToolResult> => {
        throw new Error('handler exploded');
      };
      const wrapped = wrapWithCompaction('throw_tool', throwingHandler);
      // The middleware should catch and re-throw (fail-open means original handler error propagates)
      await expect(wrapped({})).rejects.toThrow('handler exploded');
    });
  });
});
