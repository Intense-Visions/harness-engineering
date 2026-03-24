import { sanitizePath } from '../utils/sanitize-path.js';

export const detectStaleConstraintsDefinition = {
  name: 'detect_stale_constraints',
  description:
    'Detect architectural constraint rules that have not been violated within a configurable time window. Surfaces stale constraints as candidates for removal or relaxation.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: { type: 'string', description: 'Path to project root' },
      windowDays: {
        type: 'number',
        description:
          'Number of days without violation to consider a constraint stale (default: 30)',
      },
      category: {
        type: 'string',
        description: 'Optional filter by constraint category',
        enum: [
          'circular-deps',
          'layer-violations',
          'complexity',
          'coupling',
          'forbidden-imports',
          'module-size',
          'dependency-depth',
        ],
      },
    },
    required: ['path'],
  },
};

export async function handleDetectStaleConstraints(input: {
  path: string;
  windowDays?: number;
  category?: string;
}) {
  let projectPath: string;
  try {
    projectPath = sanitizePath(input.path);
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

  try {
    // Validate windowDays bounds
    const windowDays = input.windowDays ?? 30;
    if (!Number.isFinite(windowDays) || windowDays < 1) {
      return {
        content: [
          {
            type: 'text' as const,
            text: 'Error: windowDays must be a finite number >= 1',
          },
        ],
        isError: true,
      };
    }

    const { loadGraphStore } = await import('../utils/graph-loader.js');
    const store = await loadGraphStore(projectPath);

    if (!store) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                staleConstraints: [],
                totalConstraints: 0,
                windowDays,
                note: 'No graph available. Run ingest_source first to populate the knowledge graph.',
              },
              null,
              2
            ),
          },
        ],
      };
    }

    const { detectStaleConstraints } = await import('@harness-engineering/core');
    type ConstraintNodeStore = import('@harness-engineering/core').ConstraintNodeStore;
    type ArchMetricCategory = import('@harness-engineering/core').ArchMetricCategory;
    const result = detectStaleConstraints(
      store as unknown as ConstraintNodeStore,
      windowDays,
      input.category as ArchMetricCategory | undefined
    );

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(result, null, 2),
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
