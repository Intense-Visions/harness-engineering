import { loadGraphStore } from '../../utils/graph-loader.js';
import { sanitizePath } from '../../utils/sanitize-path.js';
import { graphNotFoundError } from './shared.js';

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
      mode: {
        type: 'string',
        enum: ['summary', 'detailed'],
        description:
          'Response density: summary returns impacted file count by category + highest-risk items, detailed returns full impact tree. Default: detailed',
      },
    },
    required: ['path'],
  },
};

export async function handleGetImpact(input: {
  path: string;
  nodeId?: string;
  filePath?: string;
  mode?: 'summary' | 'detailed';
}) {
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

    if (input.mode === 'summary') {
      const highestRiskItems = [
        ...groups['tests']!.slice(0, 2),
        ...groups['code']!.slice(0, 2),
        ...groups['docs']!.slice(0, 2),
      ].map((n) => {
        const node = n as { id: string; type: string };
        return { id: node.id, type: node.type };
      });
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              mode: 'summary',
              targetNodeId,
              impactCounts: {
                tests: groups['tests']!.length,
                docs: groups['docs']!.length,
                code: groups['code']!.length,
                other: groups['other']!.length,
              },
              highestRiskItems,
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
