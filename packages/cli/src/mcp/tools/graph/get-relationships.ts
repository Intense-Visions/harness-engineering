import { paginate } from '@harness-engineering/core';
import { loadGraphStore } from '../../utils/graph-loader.js';
import { sanitizePath } from '../../utils/sanitize-path.js';
import { graphNotFoundError } from './shared.js';

/**
 * Summarize edge provenance (EXTRACTED vs INFERRED vs AMBIGUOUS) for a set of
 * edges by reading the optional `provenance` field set at ingest time. Lets a
 * caller tell relationships read directly from source (AST-explicit) apart from
 * resolver/heuristic-derived ones. Returns undefined when no edge carries
 * provenance — older graphs ingested before provenance existed simply omit the
 * field, so the breakdown is dropped gracefully (back-compat).
 */
function summarizeProvenance(
  edges: readonly { provenance?: string }[]
): Record<string, number> | undefined {
  const breakdown: Record<string, number> = {};
  for (const edge of edges) {
    if (!edge.provenance) continue;
    breakdown[edge.provenance] = (breakdown[edge.provenance] ?? 0) + 1;
  }
  return Object.keys(breakdown).length > 0 ? breakdown : undefined;
}

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
      offset: {
        type: 'number',
        description:
          'Number of edges to skip (pagination). Default: 0. Edges are sorted by weight (confidence desc).',
      },
      limit: {
        type: 'number',
        description: 'Max edges to return (pagination). Default: 50.',
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
  offset?: number;
  limit?: number;
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
              provenanceBreakdown: summarizeProvenance(filteredEdges),
              stats: result.stats,
            }),
          },
        ],
      };
    }

    // Sort edges by confidence (weight) desc, defaulting to 1
    const sortedEdges = [...filteredEdges].sort(
      (a, b) => (b.confidence ?? 1) - (a.confidence ?? 1)
    );

    const offset = input.offset ?? 0;
    const limit = input.limit ?? 50;
    const paged = paginate(sortedEdges, offset, limit);

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            nodeId: input.nodeId,
            direction,
            depth: input.depth ?? 1,
            // Filter nodes to only those referenced by paginated edges
            nodes: filteredNodes.filter((n: { id: string }) =>
              paged.items.some(
                (e: { from: string; to: string }) => e.from === n.id || e.to === n.id
              )
            ),
            edges: paged.items,
            provenanceBreakdown: summarizeProvenance(paged.items),
            stats: result.stats,
            pagination: paged.pagination,
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
