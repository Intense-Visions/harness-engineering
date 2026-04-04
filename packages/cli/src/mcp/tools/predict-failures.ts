import { sanitizePath } from '../utils/sanitize-path.js';

export const predictFailuresDefinition = {
  name: 'predict_failures',
  description:
    'Predict which architectural constraints will break and when, based on decay trends and planned roadmap features. Requires at least 3 timeline snapshots.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: { type: 'string', description: 'Path to project root' },
      horizon: {
        type: 'number',
        description: 'Forecast horizon in weeks (default: 12)',
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
      includeRoadmap: {
        type: 'boolean',
        description: 'Include roadmap spec impact in forecasts (default: true)',
      },
    },
    required: ['path'],
  },
};

export async function handlePredictFailures(input: {
  path: string;
  horizon?: number;
  category?: string;
  includeRoadmap?: boolean;
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
    const { TimelineManager, PredictionEngine, SpecImpactEstimator } = core;

    const manager = new TimelineManager(projectPath);
    const includeRoadmap = input.includeRoadmap !== false;
    const estimator = includeRoadmap ? new SpecImpactEstimator(projectPath) : null;
    const engine = new PredictionEngine(projectPath, manager, estimator);

    const categories = input.category ? [input.category as string] : undefined;

    const result = engine.predict({
      ...(input.horizon !== undefined ? { horizon: input.horizon as number } : {}),
      includeRoadmap,
      categories: categories as any,
    });

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
