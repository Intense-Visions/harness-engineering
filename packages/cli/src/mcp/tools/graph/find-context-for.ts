import { loadGraphStore } from '../../utils/graph-loader.js';
import { sanitizePath } from '../../utils/sanitize-path.js';
import { graphNotFoundError } from './shared.js';

export const findContextForDefinition = {
  name: 'find_context_for',
  description:
    'Find relevant context for a given intent by searching the graph and expanding around top results. Returns assembled context within a token budget.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: { type: 'string', description: 'Path to project root' },
      intent: { type: 'string', description: 'Description of what context is needed for' },
      tokenBudget: {
        type: 'number',
        description: 'Approximate token budget for results (default 4000)',
      },
    },
    required: ['path', 'intent'],
  },
};

export async function handleFindContextFor(input: {
  path: string;
  intent: string;
  tokenBudget?: number;
}) {
  try {
    const projectPath = sanitizePath(input.path);
    const store = await loadGraphStore(projectPath);
    if (!store) return graphNotFoundError();

    const { FusionLayer, ContextQL } = await import('@harness-engineering/graph');
    const fusion = new FusionLayer(store);
    const cql = new ContextQL(store);

    const tokenBudget = input.tokenBudget ?? 4000;
    const charBudget = tokenBudget * 4;

    // Find top relevant nodes
    const searchResults = fusion.search(input.intent, 10);
    if (searchResults.length === 0) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ context: [], message: 'No relevant nodes found.' }),
          },
        ],
      };
    }

    // Expand context around each top result
    const contextBlocks: Array<{
      rootNode: string;
      score: number;
      nodes: unknown[];
      edges: unknown[];
    }> = [];
    let totalChars = 0;

    for (const result of searchResults) {
      if (totalChars >= charBudget) break;

      const expanded = cql.execute({
        rootNodeIds: [result.nodeId],
        maxDepth: 2,
      });

      const blockJson = JSON.stringify({
        rootNode: result.nodeId,
        score: result.score,
        nodes: expanded.nodes,
        edges: expanded.edges,
      });

      if (totalChars + blockJson.length > charBudget && contextBlocks.length > 0) {
        break;
      }

      contextBlocks.push({
        rootNode: result.nodeId,
        score: result.score,
        nodes: expanded.nodes as unknown[],
        edges: expanded.edges as unknown[],
      });
      totalChars += blockJson.length;
    }

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            intent: input.intent,
            tokenBudget,
            blocksReturned: contextBlocks.length,
            context: contextBlocks,
          }),
        },
      ],
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
