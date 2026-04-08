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

type CQLResult = {
  readonly nodes: ReadonlyArray<{ type: string; id: string }>;
  readonly edges: ReadonlyArray<{ type: string }>;
  readonly stats: {
    totalReturned: number;
    totalTraversed: number;
    pruned: number;
    depthReached: number;
  };
};

function buildSummaryText(result: CQLResult): string {
  const nodeTypeCounts: Record<string, number> = {};
  for (const n of result.nodes) {
    nodeTypeCounts[n.type] = (nodeTypeCounts[n.type] ?? 0) + 1;
  }
  const edgeTypeCounts: Record<string, number> = {};
  for (const e of result.edges) {
    edgeTypeCounts[e.type] = (edgeTypeCounts[e.type] ?? 0) + 1;
  }
  const nodesByType = Object.entries(nodeTypeCounts)
    .map(([t, c]) => `  ${t}: ${c}`)
    .join('\n');
  const edgesByType = Object.entries(edgeTypeCounts)
    .map(([t, c]) => `  ${t}: ${c}`)
    .join('\n');
  return [
    `Nodes (${result.stats.totalReturned}):`,
    nodesByType || '  (none)',
    `Edges (${result.edges.length}):`,
    edgesByType || '  (none)',
    `Stats: traversed=${result.stats.totalTraversed}, pruned=${result.stats.pruned}, depthReached=${result.stats.depthReached}`,
  ].join('\n');
}

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

    const text = input.mode === 'summary' ? buildSummaryText(result) : JSON.stringify(result);

    return { content: [{ type: 'text' as const, text }] };
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
