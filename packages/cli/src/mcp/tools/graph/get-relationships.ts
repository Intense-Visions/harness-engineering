import { loadGraphStore } from '../../utils/graph-loader.js';
import { sanitizePath } from '../../utils/sanitize-path.js';
import { graphNotFoundError } from './shared.js';

export const getRelationshipsDefinition = {
  name: 'get_relationships',
  description:
    'Get relationships for a specific node in the knowledge graph, with configurable direction and depth.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: { type: 'string', description: 'Path to project root' },
      nodeId: { type: 'string', description: 'ID of the node to get relationships for' },
      direction: {
        type: 'string',
        enum: ['outbound', 'inbound', 'both'],
        description: 'Direction of relationships to include (default both)',
      },
      depth: { type: 'number', description: 'Traversal depth (default 1)' },
      mode: {
        type: 'string',
        enum: ['summary', 'detailed'],
        description:
          'Response density: summary returns neighbor counts by type + direct neighbors only, detailed returns full traversal. Default: detailed',
      },
    },
    required: ['path', 'nodeId'],
  },
};

export async function handleGetRelationships(input: {
  path: string;
  nodeId: string;
  direction?: 'outbound' | 'inbound' | 'both';
  depth?: number;
  mode?: 'summary' | 'detailed';
}) {
  try {
    const projectPath = sanitizePath(input.path);
    const store = await loadGraphStore(projectPath);
    if (!store) return graphNotFoundError();

    const { ContextQL } = await import('@harness-engineering/graph');
    const cql = new ContextQL(store);

    const direction = input.direction ?? 'both';
    const bidirectional = direction === 'both' || direction === 'inbound';

    const result = cql.execute({
      rootNodeIds: [input.nodeId],
      maxDepth: input.depth ?? 1,
      bidirectional,
    });

    // Post-filter for inbound-only: remove outbound edges from the root node
    let filteredNodes = result.nodes;
    let filteredEdges = result.edges;
    if (direction === 'inbound') {
      filteredEdges = result.edges.filter((e) => e.from !== input.nodeId);
      const reachableNodeIds = new Set(filteredEdges.map((e) => e.from));
      reachableNodeIds.add(input.nodeId);
      filteredNodes = result.nodes.filter((n) => reachableNodeIds.has(n.id));
    }

    if (input.mode === 'summary') {
      const neighborsByType: Record<string, number> = {};
      for (const node of filteredNodes) {
        if (node.id === input.nodeId) continue;
        neighborsByType[node.type] = (neighborsByType[node.type] ?? 0) + 1;
      }
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              mode: 'summary',
              nodeId: input.nodeId,
              direction,
              totalNeighbors: filteredNodes.length - 1,
              neighborsByType,
              totalEdges: filteredEdges.length,
              stats: result.stats,
            }),
          },
        ],
      };
    }

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            nodeId: input.nodeId,
            direction,
            depth: input.depth ?? 1,
            nodes: filteredNodes,
            edges: filteredEdges,
            stats: result.stats,
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
