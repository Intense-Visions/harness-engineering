import { describe, it, expect, vi } from 'vitest';
import { compactToolDefinition, handleCompact } from '../../../src/mcp/tools/compact';

describe('compact tool', () => {
  describe('definition', () => {
    it('has correct name and schema', () => {
      expect(compactToolDefinition.name).toBe('compact');
      // path is optional — only required for intent mode (validated at runtime)
      expect(compactToolDefinition.inputSchema.required).not.toContain('path');
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

    it('returns error when both content and ref are provided without intent', async () => {
      const result = await handleCompact({
        path: '/tmp/test-project',
        content: 'some content',
        ref: { source: 'test', content: 'ref content' },
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Cannot provide both 'content' and 'ref'");
    });

    it('warns when unknown strategies are provided', async () => {
      const result = await handleCompact({
        path: '/tmp/test-project',
        content: JSON.stringify({ a: 'value' }),
        strategies: ['structural', 'nonexistent' as any],
      });
      expect(result.isError).toBeUndefined();
      const text = result.content[0].text;
      expect(text).toContain('Warning: unknown strategies ignored: nonexistent');
    });

    it('works without path in content mode', async () => {
      const result = await handleCompact({
        content: JSON.stringify({ a: 1, b: null }),
      });
      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toMatch(/<!-- packed:/);
    });
  });

  describe('ref mode', () => {
    it('compacts ref.content and preserves ref.source in envelope header', async () => {
      const result = await handleCompact({
        path: '/tmp/test-project',
        ref: {
          source: 'gather_context',
          content: JSON.stringify({
            results: Array.from({ length: 20 }, (_, i) => ({
              id: `node-${i}`,
              path: `/src/mod-${i}.ts`,
              empty: null,
              nested: { blank: '' },
            })),
          }),
        },
      });

      expect(result.isError).toBeUndefined();
      const text = result.content[0].text;
      expect(text).toMatch(/<!-- packed:/);
      // Source attribution preserved
      expect(text).toContain('### [gather_context]');
      // Real data preserved
      expect(text).toContain('node-0');
    });

    it('respects custom tokenBudget for ref mode', async () => {
      const result = await handleCompact({
        path: '/tmp/test-project',
        ref: {
          source: 'find_context_for',
          content: 'A'.repeat(20000),
        },
        tokenBudget: 500,
      });

      const text = result.content[0].text;
      expect(text).toMatch(/<!-- packed:/);
      // Should be within budget
      expect(text.length).toBeLessThan(4000);
    });
  });

  describe('intent mode', () => {
    it('returns error when intent is provided without path', async () => {
      const result = await handleCompact({
        intent: 'understand the notification service',
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("'path' is required when using intent mode");
    });

    it('returns packed envelope with sections from graph search results', async () => {
      // Intent mode requires a graph — use a path that will fail to load graph
      // and return a graceful "no graph" error
      const result = await handleCompact({
        path: '/tmp/no-graph-project',
        intent: 'understand the notification service',
      });

      // Without a graph, should return a graceful error
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('No graph found');
    });
  });

  describe('intent + content mode', () => {
    it('returns error when no graph is available', async () => {
      const result = await handleCompact({
        path: '/tmp/no-graph-project',
        intent: 'understand the notification service',
        content: 'filter context here',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('No graph found');
    });
  });

  describe('intent mode with mocked graph', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('returns packed envelope with sections when graph has results', async () => {
      vi.doMock('../../../src/mcp/utils/graph-loader', () => ({
        loadGraphStore: vi.fn().mockResolvedValue({}),
      }));
      vi.doMock('@harness-engineering/graph', () => ({
        PackedSummaryCache: class {
          get() {
            return null;
          }
          set() {}
        },
        FusionLayer: class {
          search() {
            return [
              { nodeId: 'src/services/user.ts', score: 0.9 },
              { nodeId: 'src/types/user.ts', score: 0.7 },
            ];
          }
        },
        ContextQL: class {
          execute({ rootNodeIds }: { rootNodeIds: string[] }) {
            return {
              nodes: [
                { id: rootNodeIds[0], type: 'file', content: 'mock content for ' + rootNodeIds[0] },
              ],
              edges: [],
            };
          }
        },
      }));

      const { handleCompact: freshHandleCompact } = await import('../../../src/mcp/tools/compact');

      const result = await freshHandleCompact({
        path: '/tmp/test-project',
        intent: 'understand user service',
      });

      expect(result.isError).toBeUndefined();
      const text = result.content[0].text;
      expect(text).toMatch(/<!-- packed:/);
      // Should have sections for each search result
      expect(text).toContain('### [src/services/user.ts]');
      expect(text).toContain('### [src/types/user.ts]');

      vi.doUnmock('@harness-engineering/graph');
      vi.doUnmock('../../../src/mcp/utils/graph-loader');
    });

    it('returns empty envelope when graph search finds no results', async () => {
      vi.doMock('../../../src/mcp/utils/graph-loader', () => ({
        loadGraphStore: vi.fn().mockResolvedValue({}),
      }));
      vi.doMock('@harness-engineering/graph', () => ({
        PackedSummaryCache: class {
          get() {
            return null;
          }
          set() {}
        },
        FusionLayer: class {
          search() {
            return [];
          }
        },
        ContextQL: class {
          execute() {
            return { nodes: [], edges: [] };
          }
        },
      }));

      const { handleCompact: freshHandleCompact } = await import('../../../src/mcp/tools/compact');

      const result = await freshHandleCompact({
        path: '/tmp/test-project',
        intent: 'something with no matches',
      });

      expect(result.isError).toBeUndefined();
      const text = result.content[0].text;
      expect(text).toContain('No relevant context found');

      vi.doUnmock('@harness-engineering/graph');
      vi.doUnmock('../../../src/mcp/utils/graph-loader');
    });

    it('passes content as filter context when intent + content are both provided', async () => {
      let capturedQuery = '';
      vi.doMock('../../../src/mcp/utils/graph-loader', () => ({
        loadGraphStore: vi.fn().mockResolvedValue({}),
      }));
      vi.doMock('@harness-engineering/graph', () => ({
        PackedSummaryCache: class {
          get() {
            return null;
          }
          set() {}
        },
        FusionLayer: class {
          search(query: string) {
            capturedQuery = query;
            return [];
          }
        },
        ContextQL: class {
          execute() {
            return { nodes: [], edges: [] };
          }
        },
      }));

      const { handleCompact: freshHandleCompact } = await import('../../../src/mcp/tools/compact');

      await freshHandleCompact({
        path: '/tmp/test-project',
        intent: 'understand auth',
        content: 'OAuth2 refresh tokens',
      });

      expect(capturedQuery).toContain('understand auth');
      expect(capturedQuery).toContain('OAuth2 refresh tokens');

      vi.doUnmock('@harness-engineering/graph');
      vi.doUnmock('../../../src/mcp/utils/graph-loader');
    });
  });

  describe('cache stub (Phase 4 placeholder)', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('intent mode always sets cached: false in envelope meta', async () => {
      vi.doMock('../../../src/mcp/utils/graph-loader', () => ({
        loadGraphStore: vi.fn().mockResolvedValue({}),
      }));
      vi.doMock('@harness-engineering/graph', () => ({
        PackedSummaryCache: class {
          get() {
            return null;
          }
          set() {}
        },
        FusionLayer: class {
          search() {
            return [{ nodeId: 'src/test.ts', score: 0.8 }];
          }
        },
        ContextQL: class {
          execute() {
            return { nodes: [{ id: 'src/test.ts', type: 'file', content: 'test' }], edges: [] };
          }
        },
      }));

      const { handleCompact: freshHandleCompact } = await import('../../../src/mcp/tools/compact');

      const result = await freshHandleCompact({
        path: '/tmp/test-project',
        intent: 'anything',
      });

      expect(result.isError).toBeUndefined();
      const text = result.content[0].text;
      // Verify cached: false — packed header should NOT contain [cached] marker
      expect(text).toMatch(/<!-- packed:/);
      expect(text).not.toContain('[cached]');

      vi.doUnmock('@harness-engineering/graph');
      vi.doUnmock('../../../src/mcp/utils/graph-loader');
    });
  });
});
