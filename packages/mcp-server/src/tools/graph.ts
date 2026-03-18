import * as path from 'path';
import { loadGraphStore } from '../utils/graph-loader.js';

// ── Shared helper ────────────────────────────────────────────────────

function sanitizePath(inputPath: string): string {
  const resolved = path.resolve(inputPath);
  if (resolved === '/' || resolved === path.parse(resolved).root) {
    throw new Error('Invalid project path: cannot use filesystem root');
  }
  return resolved;
}

function graphNotFoundError() {
  return {
    content: [
      {
        type: 'text' as const,
        text: 'No graph found. Run `harness scan` or use `ingest_source` tool first.',
      },
    ],
    isError: true,
  };
}

// ── query_graph ──────────────────────────────────────────────────────

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
}) {
  try {
    const projectPath = sanitizePath(input.path);
    const store = await loadGraphStore(projectPath);
    if (!store) return graphNotFoundError();

    const { ContextQL } = await import('@harness-engineering/graph');
    const cql = new ContextQL(store);
    const result = cql.execute({
      rootNodeIds: input.rootNodeIds,
      maxDepth: input.maxDepth,
      includeTypes: input.includeTypes as
        | import('@harness-engineering/graph').NodeType[]
        | undefined,
      excludeTypes: input.excludeTypes as
        | import('@harness-engineering/graph').NodeType[]
        | undefined,
      includeEdges: input.includeEdges as
        | import('@harness-engineering/graph').EdgeType[]
        | undefined,
      bidirectional: input.bidirectional,
      pruneObservability: input.pruneObservability,
    });

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

// ── search_similar ───────────────────────────────────────────────────

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
    },
    required: ['path', 'query'],
  },
};

export async function handleSearchSimilar(input: { path: string; query: string; topK?: number }) {
  try {
    const projectPath = sanitizePath(input.path);
    const store = await loadGraphStore(projectPath);
    if (!store) return graphNotFoundError();

    const { FusionLayer } = await import('@harness-engineering/graph');
    const fusion = new FusionLayer(store);
    const results = fusion.search(input.query, input.topK ?? 10);

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

// ── find_context_for ─────────────────────────────────────────────────

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

// ── get_relationships ────────────────────────────────────────────────

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
    },
    required: ['path', 'nodeId'],
  },
};

export async function handleGetRelationships(input: {
  path: string;
  nodeId: string;
  direction?: 'outbound' | 'inbound' | 'both';
  depth?: number;
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

// ── get_impact ───────────────────────────────────────────────────────

export const getImpactDefinition = {
  name: 'get_impact',
  description:
    'Analyze the impact of changing a node or file. Returns affected tests, docs, code, and other nodes grouped by type.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: { type: 'string', description: 'Path to project root' },
      nodeId: { type: 'string', description: 'ID of the node to analyze impact for' },
      filePath: {
        type: 'string',
        description: 'File path (relative to project root) to analyze impact for',
      },
    },
    required: ['path'],
  },
};

export async function handleGetImpact(input: { path: string; nodeId?: string; filePath?: string }) {
  try {
    if (!input.nodeId && !input.filePath) {
      return {
        content: [
          {
            type: 'text' as const,
            text: 'Error: either nodeId or filePath is required',
          },
        ],
        isError: true,
      };
    }

    const projectPath = sanitizePath(input.path);
    const store = await loadGraphStore(projectPath);
    if (!store) return graphNotFoundError();

    const { ContextQL } = await import('@harness-engineering/graph');

    let targetNodeId = input.nodeId;

    // If filePath provided, resolve to nodeId
    if (!targetNodeId && input.filePath) {
      const fileNodes = store.findNodes({ type: 'file' });
      const match = fileNodes.find(
        (n) => n.path === input.filePath || n.id === `file:${input.filePath}`
      );
      if (!match) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Error: no file node found matching path "${input.filePath}"`,
            },
          ],
          isError: true,
        };
      }
      targetNodeId = match.id;
    }

    const cql = new ContextQL(store);
    const result = cql.execute({
      rootNodeIds: [targetNodeId!],
      bidirectional: true,
      maxDepth: 3,
    });

    // Group result nodes by type
    const groups: Record<string, unknown[]> = {
      tests: [],
      docs: [],
      code: [],
      other: [],
    };

    const testTypes = new Set(['test_result']);
    const docTypes = new Set(['adr', 'decision', 'document', 'learning']);
    const codeTypes = new Set([
      'file',
      'module',
      'class',
      'interface',
      'function',
      'method',
      'variable',
    ]);

    for (const node of result.nodes) {
      // Skip the target node itself
      if (node.id === targetNodeId) continue;

      if (testTypes.has(node.type)) {
        groups['tests']!.push(node);
      } else if (docTypes.has(node.type)) {
        groups['docs']!.push(node);
      } else if (codeTypes.has(node.type)) {
        groups['code']!.push(node);
      } else {
        groups['other']!.push(node);
      }
    }

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            targetNodeId,
            impact: groups,
            stats: result.stats,
            edges: result.edges,
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

// ── ingest_source ────────────────────────────────────────────────────

export const ingestSourceDefinition = {
  name: 'ingest_source',
  description:
    'Ingest sources into the project knowledge graph. Supports code analysis, knowledge documents, git history, or all at once.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: { type: 'string', description: 'Path to project root' },
      source: {
        type: 'string',
        enum: ['code', 'knowledge', 'git', 'all'],
        description: 'Type of source to ingest',
      },
    },
    required: ['path', 'source'],
  },
};

export async function handleIngestSource(input: {
  path: string;
  source: 'code' | 'knowledge' | 'git' | 'all';
}) {
  try {
    const projectPath = sanitizePath(input.path);
    const graphDir = path.join(projectPath, '.harness', 'graph');

    const { GraphStore, CodeIngestor, TopologicalLinker, KnowledgeIngestor, GitIngestor } =
      await import('@harness-engineering/graph');
    const fs = await import('node:fs/promises');

    // Ensure graph directory exists
    await fs.mkdir(graphDir, { recursive: true });

    // Try to load existing graph, or start fresh
    const store = new GraphStore();
    await store.load(graphDir);

    const results: import('@harness-engineering/graph').IngestResult[] = [];

    if (input.source === 'code' || input.source === 'all') {
      const codeIngestor = new CodeIngestor(store);
      const codeResult = await codeIngestor.ingest(projectPath);
      results.push(codeResult);

      const linker = new TopologicalLinker(store);
      linker.link();
    }

    if (input.source === 'knowledge' || input.source === 'all') {
      const knowledgeIngestor = new KnowledgeIngestor(store);
      const knowledgeResult = await knowledgeIngestor.ingestAll(projectPath);
      results.push(knowledgeResult);
    }

    if (input.source === 'git' || input.source === 'all') {
      const gitIngestor = new GitIngestor(store);
      const gitResult = await gitIngestor.ingest(projectPath);
      results.push(gitResult);
    }

    // Save the graph
    await store.save(graphDir);

    // Combine results
    const combined = {
      nodesAdded: results.reduce((s, r) => s + r.nodesAdded, 0),
      nodesUpdated: results.reduce((s, r) => s + r.nodesUpdated, 0),
      edgesAdded: results.reduce((s, r) => s + r.edgesAdded, 0),
      edgesUpdated: results.reduce((s, r) => s + r.edgesUpdated, 0),
      errors: results.flatMap((r) => r.errors),
      durationMs: results.reduce((s, r) => s + r.durationMs, 0),
      graphStats: {
        totalNodes: store.nodeCount,
        totalEdges: store.edgeCount,
      },
    };

    return {
      content: [{ type: 'text' as const, text: JSON.stringify(combined) }],
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
