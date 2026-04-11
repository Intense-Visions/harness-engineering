import { paginate } from '@harness-engineering/core';
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
      offset: {
        type: 'number',
        description:
          'Number of trend entries to skip (pagination). Default: 0. Trends are sorted by decay magnitude (absolute delta) desc.',
      },
      limit: {
        type: 'number',
        description: 'Max trend entries to return (pagination). Default: 20.',
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
  offset?: number;
  limit?: number;
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

    // Convert categories record to sorted array for pagination
    const categoryEntries = Object.entries(trends.categories).map(([name, trend]) => ({
      category: name,
      ...trend,
    }));
    // Sort by decay magnitude (absolute delta) descending
    categoryEntries.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

    // If category filter, find it in the sorted array
    if (input.category) {
      const match = categoryEntries.find((e) => e.category === input.category);
      if (!match) {
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
                trend: {
                  current: match.current,
                  previous: match.previous,
                  delta: match.delta,
                  direction: match.direction,
                },
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

    const paged = paginate(categoryEntries, input.offset ?? 0, input.limit ?? 20);

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(
            {
              stability: trends.stability,
              categories: paged.items,
              snapshotCount: trends.snapshotCount,
              from: trends.from,
              to: trends.to,
              pagination: paged.pagination,
            },
            null,
            2
          ),
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
