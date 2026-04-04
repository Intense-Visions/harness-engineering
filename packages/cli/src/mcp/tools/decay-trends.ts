import { sanitizePath } from '../utils/sanitize-path.js';

export const getDecayTrendsDefinition = {
  name: 'get_decay_trends',
  description:
    'Get architecture decay trends over time. Returns stability score history and per-category trend analysis from timeline snapshots. Use to answer questions like "is the architecture decaying?" or "which metrics are getting worse?"',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: { type: 'string', description: 'Path to project root' },
      last: {
        type: 'number',
        description: 'Number of recent snapshots to analyze (default: 10)',
      },
      since: {
        type: 'string',
        description: 'Show trends since this ISO date (e.g., 2026-01-01)',
      },
      category: {
        type: 'string',
        description: 'Filter to a single metric category',
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

export async function handleGetDecayTrends(input: {
  path: string;
  last?: number;
  since?: string;
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
    const core = await import('@harness-engineering/core');
    const { TimelineManager } = core;
    const manager = new TimelineManager(projectPath);
    const timeline = manager.load();

    if (timeline.snapshots.length === 0) {
      return {
        content: [
          {
            type: 'text' as const,
            text: 'No architecture snapshots found. Run `harness snapshot capture` to create the first snapshot.',
          },
        ],
      };
    }

    const trendOptions: { last?: number; since?: string } = {};
    if (input.last !== undefined) trendOptions.last = input.last;
    if (input.since !== undefined) trendOptions.since = input.since;
    const trends = manager.trends(trendOptions);

    // If category filter, extract just that category
    if (input.category) {
      const categoryTrend = trends.categories[input.category as keyof typeof trends.categories];
      if (!categoryTrend) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `No trend data for category "${input.category}".`,
            },
          ],
        };
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                category: input.category,
                trend: categoryTrend,
                snapshotCount: trends.snapshotCount,
                from: trends.from,
                to: trends.to,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(trends, null, 2),
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text' as const,
          text: `Error computing decay trends: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}
