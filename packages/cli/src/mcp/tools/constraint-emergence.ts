import { sanitizePath } from '../utils/sanitize-path.js';

export const detectConstraintEmergenceDefinition = {
  name: 'detect_constraint_emergence',
  description:
    'Cluster recurring violations by pattern and suggest new constraint rules. When N similar violations appear in M weeks, suggests emergent architectural norms learned from team behavior.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: { type: 'string', description: 'Path to project root' },
      windowWeeks: {
        type: 'number',
        description: 'Time window in weeks to analyze (default: 4)',
      },
      minOccurrences: {
        type: 'number',
        description: 'Minimum number of similar violations to trigger a suggestion (default: 3)',
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

export async function handleDetectConstraintEmergence(input: {
  path: string;
  windowWeeks?: number;
  minOccurrences?: number;
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
    const windowWeeks = input.windowWeeks ?? 4;
    if (!Number.isFinite(windowWeeks) || windowWeeks < 1) {
      return {
        content: [
          {
            type: 'text' as const,
            text: 'Error: windowWeeks must be a finite number >= 1',
          },
        ],
        isError: true,
      };
    }

    const minOccurrences = input.minOccurrences ?? 3;
    if (!Number.isFinite(minOccurrences) || minOccurrences < 2) {
      return {
        content: [
          {
            type: 'text' as const,
            text: 'Error: minOccurrences must be a finite number >= 2',
          },
        ],
        isError: true,
      };
    }

    const nodePath = await import('node:path');
    const historyPath = nodePath.resolve(projectPath, '.harness/arch/violation-history.json');

    const { ViolationHistoryManager, detectEmergentConstraints } =
      await import('@harness-engineering/core');
    type ArchMetricCategory = import('@harness-engineering/core').ArchMetricCategory;

    const manager = new ViolationHistoryManager(historyPath);
    const history = manager.load();

    const options: {
      windowWeeks: number;
      minOccurrences: number;
      category?: ArchMetricCategory;
    } = { windowWeeks, minOccurrences };
    if (input.category) {
      options.category = input.category as ArchMetricCategory;
    }
    const result = detectEmergentConstraints(history, options);

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
