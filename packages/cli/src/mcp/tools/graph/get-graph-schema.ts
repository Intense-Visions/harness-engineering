import type { GraphNode, GraphEdge } from '@harness-engineering/graph';
import { loadGraphStore } from '../../utils/graph-loader.js';
import { sanitizePath } from '../../utils/sanitize-path.js';
import { graphNotFoundError } from './shared.js';

export const getGraphSchemaDefinition = {
  name: 'get_graph_schema',
  description:
    'Introspect the SHAPE of the project knowledge graph so an agent can discover it before querying: ' +
    'node-type (label) counts with their observed property keys, edge-type (relationship) counts, and the ' +
    'relationship patterns present (which node types connect to which via which edge types). Read-only.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: { type: 'string', description: 'Path to project root' },
    },
    required: ['path'],
  },
};

// Top-level GraphNode fields that count as "properties" when set (excludes
// id/type which are structural, and embedding/content which are bulk payload).
const NODE_PROPERTY_FIELDS = ['name', 'path', 'location', 'hash', 'lastModified'] as const;

interface NodeTypeSchema {
  label: string;
  count: number;
  properties: string[];
}

interface EdgeTypeSchema {
  type: string;
  count: number;
}

interface PatternSchema {
  from: string;
  edge: string;
  to: string;
  count: number;
}

interface GraphSchema {
  nodeTypes: NodeTypeSchema[];
  edgeTypes: EdgeTypeSchema[];
  patterns: PatternSchema[];
  totals: { nodeCount: number; edgeCount: number };
}

const UNKNOWN_LABEL = 'unknown';

function buildSchema(
  nodes: ReadonlyArray<GraphNode>,
  edges: ReadonlyArray<GraphEdge>
): GraphSchema {
  // node-type counts + property-key union per label
  const countByLabel = new Map<string, number>();
  const propsByLabel = new Map<string, Set<string>>();
  const labelById = new Map<string, string>();

  for (const node of nodes) {
    labelById.set(node.id, node.type);
    countByLabel.set(node.type, (countByLabel.get(node.type) ?? 0) + 1);

    let props = propsByLabel.get(node.type);
    if (!props) {
      props = new Set<string>();
      propsByLabel.set(node.type, props);
    }
    const record = node as unknown as Record<string, unknown>;
    for (const field of NODE_PROPERTY_FIELDS) {
      if (record[field] !== undefined && record[field] !== null) props.add(field);
    }
    if (node.metadata) {
      for (const key of Object.keys(node.metadata)) props.add(key);
    }
  }

  const nodeTypes: NodeTypeSchema[] = [...countByLabel.entries()]
    .map(([label, count]) => ({
      label,
      count,
      properties: [...(propsByLabel.get(label) ?? [])].sort(),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));

  // edge-type counts + (from,edge,to) pattern counts
  const countByEdgeType = new Map<string, number>();
  const patternCounts = new Map<string, number>();

  for (const edge of edges) {
    countByEdgeType.set(edge.type, (countByEdgeType.get(edge.type) ?? 0) + 1);
    const from = labelById.get(edge.from) ?? UNKNOWN_LABEL;
    const to = labelById.get(edge.to) ?? UNKNOWN_LABEL;
    const key = `${from}\0${edge.type}\0${to}`;
    patternCounts.set(key, (patternCounts.get(key) ?? 0) + 1);
  }

  const edgeTypes: EdgeTypeSchema[] = [...countByEdgeType.entries()]
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => a.type.localeCompare(b.type));

  const patterns: PatternSchema[] = [...patternCounts.entries()]
    .map(([key, count]) => {
      const [from, edge, to] = key.split('\0');
      return { from: from!, edge: edge!, to: to!, count };
    })
    .sort(
      (a, b) =>
        a.from.localeCompare(b.from) || a.edge.localeCompare(b.edge) || a.to.localeCompare(b.to)
    );

  return {
    nodeTypes,
    edgeTypes,
    patterns,
    totals: { nodeCount: nodes.length, edgeCount: edges.length },
  };
}

export async function handleGetGraphSchema(input: { path: string }) {
  try {
    const projectPath = sanitizePath(input.path);
    const store = await loadGraphStore(projectPath);
    if (!store) return graphNotFoundError();

    // Read-only enumeration: empty queries return every node/edge.
    const nodes = store.findNodes({});
    const edges = store.getEdges({});
    const schema = buildSchema(nodes, edges);

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(schema),
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
