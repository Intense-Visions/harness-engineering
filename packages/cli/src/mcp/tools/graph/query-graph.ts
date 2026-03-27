import { loadGraphStore } from '../../utils/graph-loader.js';
import { sanitizePath } from '../../utils/sanitize-path.js';
import { graphNotFoundError } from './shared.js';

export const queryGraphDefinition = {
  name: 'query_graph',
  description:
    'Query the project knowledge graph using ContextQL. Traverses from root nodes outward, filtering by node/edge types.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: { type: 'string', description: 'Path to project root' },
      rootNodeIds: {
        type: 'array',
        items: { type: 'string' },
        description: 'Node IDs to start traversal from',
      },
      maxDepth: { type: 'number', description: 'Maximum traversal depth (default 3)' },
      includeTypes: {
        type: 'array',
        items: { type: 'string' },
        description: 'Only include nodes of these types',
      },
      excludeTypes: {
        type: 'array',
        items: { type: 'string' },
        description: 'Exclude nodes of these types',
      },
      includeEdges: {
        type: 'array',
        items: { type: 'string' },
        description: 'Only traverse edges of these types',
      },
      bidirectional: {
        type: 'boolean',
        description: 'Traverse edges in both directions (default false)',
      },
      pruneObservability: {
        type: 'boolean',
        description: 'Prune observability nodes like spans/metrics/logs (default true)',
      },
      mode: {
        type: 'string',
        enum: ['summary', 'detailed'],
        description:
          'Response density: summary returns node/edge counts by type + top 10 nodes by connectivity, detailed returns full arrays. Default: detailed',
      },
    },
    required: ['path', 'rootNodeIds'],
  },
};

export async function handleQueryGraph(input: {
  path: string;
  rootNodeIds: string[];
  maxDepth?: number;
  includeTypes?: string[];
  excludeTypes?: string[];
  includeEdges?: string[];
  bidirectional?: boolean;
  pruneObservability?: boolean;
  mode?: 'summary' | 'detailed';
}) {
  try {
    const projectPath = sanitizePath(input.path);
    const store = await loadGraphStore(projectPath);
    if (!store) return graphNotFoundError();

    const { ContextQL } = await import('@harness-engineering/graph');
    const cql = new ContextQL(store);
    const result = cql.execute({
      rootNodeIds: input.rootNodeIds,
      ...(input.maxDepth !== undefined && { maxDepth: input.maxDepth }),
      ...(input.includeTypes !== undefined && {
        includeTypes: input.includeTypes as import('@harness-engineering/graph').NodeType[],
      }),
      ...(input.excludeTypes !== undefined && {
        excludeTypes: input.excludeTypes as import('@harness-engineering/graph').NodeType[],
      }),
      ...(input.includeEdges !== undefined && {
        includeEdges: input.includeEdges as import('@harness-engineering/graph').EdgeType[],
      }),
      ...(input.bidirectional !== undefined && { bidirectional: input.bidirectional }),
      ...(input.pruneObservability !== undefined && {
        pruneObservability: input.pruneObservability,
      }),
    });

    if (input.mode === 'summary') {
      // Count nodes by type
      const nodesByType: Record<string, number> = {};
      for (const node of result.nodes) {
        nodesByType[node.type] = (nodesByType[node.type] ?? 0) + 1;
      }
      // Count edges by type
      const edgesByType: Record<string, number> = {};
      for (const edge of result.edges) {
        edgesByType[edge.type] = (edgesByType[edge.type] ?? 0) + 1;
      }
      // Top 10 nodes by connectivity (number of edges)
      const edgeCounts = new Map<string, number>();
      for (const edge of result.edges) {
        edgeCounts.set(edge.from, (edgeCounts.get(edge.from) ?? 0) + 1);
        edgeCounts.set(edge.to, (edgeCounts.get(edge.to) ?? 0) + 1);
      }
      const topNodes = [...edgeCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([id, connections]) => ({ id, connections }));

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              mode: 'summary',
              totalNodes: result.nodes.length,
              totalEdges: result.edges.length,
              nodesByType,
              edgesByType,
              topNodes,
              stats: result.stats,
            }),
          },
        ],
      };
    }

    return {
      content: [{ type: 'text' as const, text: JSON.stringify(result) }],
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
