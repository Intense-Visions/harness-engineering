import { paginate } from '@harness-engineering/core';
import { loadGraphStore } from '../../utils/graph-loader.js';
import { sanitizePath } from '../../utils/sanitize-path.js';
import { graphNotFoundError } from './shared.js';

export const detectAnomaliesDefinition = {
  name: 'detect_anomalies',
  description:
    'Detect structural anomalies — statistical outliers across code metrics and topological single points of failure in the import graph',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: { type: 'string', description: 'Path to project root' },
      threshold: { type: 'number', description: 'Z-score threshold (default 2.0)' },
      metrics: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Metrics to analyze (default: cyclomaticComplexity, fanIn, fanOut, hotspotScore, transitiveDepth)',
      },
      offset: {
        type: 'number',
        description:
          'Number of anomaly entries to skip (pagination). Default: 0. Anomalies are sorted by Z-score desc.',
      },
      limit: {
        type: 'number',
        description: 'Max anomaly entries to return (pagination). Default: 30.',
      },
    },
    required: ['path'],
  },
};

export async function handleDetectAnomalies(input: {
  path: string;
  threshold?: number;
  metrics?: string[];
  offset?: number;
  limit?: number;
}) {
  try {
    const projectPath = sanitizePath(input.path);
    const store = await loadGraphStore(projectPath);
    if (!store) return graphNotFoundError();

    const { GraphAnomalyAdapter } = await import('@harness-engineering/graph');
    const adapter = new GraphAnomalyAdapter(store);
    const report = adapter.detect({
      ...(input.threshold !== undefined && { threshold: input.threshold }),
      ...(input.metrics !== undefined && { metrics: input.metrics }),
    });

    const offset = input.offset ?? 0;
    const limit = input.limit ?? 30;
    const paged = paginate(report.statisticalOutliers, offset, limit);

    const response = {
      ...report,
      statisticalOutliers: paged.items,
      pagination: paged.pagination,
    };

    return {
      content: [{ type: 'text' as const, text: JSON.stringify(response) }],
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
