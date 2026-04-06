import { loadGraphStore } from '../../utils/graph-loader.js';
import { sanitizePath } from '../../utils/sanitize-path.js';
import { graphNotFoundError } from './shared.js';

export const computeBlastRadiusDefinition = {
  name: 'compute_blast_radius',
  description:
    'Simulate cascading failure propagation from a source node using probability-weighted BFS. Returns cumulative failure probability for each affected node.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: { type: 'string', description: 'Path to project root' },
      file: {
        type: 'string',
        description: 'File path (relative to project root) to simulate failure for',
      },
      nodeId: { type: 'string', description: 'Node ID to simulate failure for' },
      probabilityFloor: {
        type: 'number',
        description: 'Minimum cumulative probability to continue traversal (default 0.05)',
      },
      maxDepth: {
        type: 'number',
        description: 'Maximum BFS depth (default 10)',
      },
      mode: {
        type: 'string',
        enum: ['compact', 'detailed'],
        description:
          'Response density: compact returns summary + top 10 highest-risk nodes, detailed returns full layered cascade chain. Default: compact',
      },
    },
    required: ['path'],
  },
};

export async function handleComputeBlastRadius(input: {
  path: string;
  file?: string;
  nodeId?: string;
  probabilityFloor?: number;
  maxDepth?: number;
  mode?: 'compact' | 'detailed';
}) {
  try {
    if (!input.nodeId && !input.file) {
      return {
        content: [
          {
            type: 'text' as const,
            text: 'Error: either nodeId or file is required',
          },
        ],
        isError: true,
      };
    }

    const projectPath = sanitizePath(input.path);
    const store = await loadGraphStore(projectPath);
    if (!store) return graphNotFoundError();

    const { CascadeSimulator } = await import('@harness-engineering/graph');

    let targetNodeId = input.nodeId;

    // If file provided, resolve to nodeId
    if (!targetNodeId && input.file) {
      const fileNodes = store.findNodes({ type: 'file' });
      const match = fileNodes.find((n) => n.path === input.file || n.id === `file:${input.file}`);
      if (!match) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Error: no file node found matching path "${input.file}"`,
            },
          ],
          isError: true,
        };
      }
      targetNodeId = match.id;
    }

    // Validate bounds
    if (
      input.probabilityFloor !== undefined &&
      (input.probabilityFloor <= 0 || input.probabilityFloor >= 1)
    ) {
      return {
        content: [
          {
            type: 'text' as const,
            text: 'Error: probabilityFloor must be between 0 and 1 (exclusive)',
          },
        ],
        isError: true,
      };
    }
    if (input.maxDepth !== undefined && (input.maxDepth < 1 || input.maxDepth > 100)) {
      return {
        content: [{ type: 'text' as const, text: 'Error: maxDepth must be between 1 and 100' }],
        isError: true,
      };
    }

    const simulator = new CascadeSimulator(store);
    const result = simulator.simulate(targetNodeId!, {
      ...(input.probabilityFloor !== undefined && {
        probabilityFloor: input.probabilityFloor,
      }),
      ...(input.maxDepth !== undefined && { maxDepth: input.maxDepth }),
    });

    if (input.mode === 'detailed') {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              mode: 'detailed',
              sourceNodeId: result.sourceNodeId,
              sourceName: result.sourceName,
              layers: result.layers,
              flatSummary: result.flatSummary,
              summary: result.summary,
            }),
          },
        ],
      };
    }

    // compact mode (default): summary + top 10
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            mode: 'compact',
            sourceNodeId: result.sourceNodeId,
            sourceName: result.sourceName,
            topRisks: result.flatSummary.slice(0, 10),
            summary: result.summary,
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
