import { loadGraphStore } from '../../utils/graph-loader.js';
import { sanitizePath } from '../../utils/sanitize-path.js';
import { graphNotFoundError } from './shared.js';

export const searchSimilarDefinition = {
  name: 'search_similar',
  description:
    'Search the knowledge graph for nodes similar to a query string using keyword and semantic fusion.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: { type: 'string', description: 'Path to project root' },
      query: { type: 'string', description: 'Search query string' },
      topK: { type: 'number', description: 'Maximum number of results to return (default 10)' },
      mode: {
        type: 'string',
        enum: ['summary', 'detailed'],
        description:
          'Response density: summary returns top 5 results with scores only, detailed returns top 10+ with full metadata. Default: detailed',
      },
    },
    required: ['path', 'query'],
  },
};

export async function handleSearchSimilar(input: {
  path: string;
  query: string;
  topK?: number;
  mode?: 'summary' | 'detailed';
}) {
  try {
    const projectPath = sanitizePath(input.path);
    const store = await loadGraphStore(projectPath);
    if (!store) return graphNotFoundError();

    const { FusionLayer } = await import('@harness-engineering/graph');
    const fusion = new FusionLayer(store);
    const results = fusion.search(input.query, input.topK ?? 10);

    if (input.mode === 'summary') {
      const summaryResults = results.slice(0, 5).map((r: { nodeId: string; score: number }) => ({
        nodeId: r.nodeId,
        score: r.score,
      }));
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ mode: 'summary', results: summaryResults }),
          },
        ],
      };
    }

    return {
      content: [{ type: 'text' as const, text: JSON.stringify(results) }],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text' as const,
          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}
