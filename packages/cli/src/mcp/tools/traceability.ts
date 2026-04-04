import type { McpToolResponse } from '../utils/result-adapter.js';
import { loadGraphStore } from '../utils/graph-loader.js';
import { sanitizePath } from '../utils/sanitize-path.js';

export const checkTraceabilityDefinition = {
  name: 'check_traceability',
  description: 'Check requirement-to-code-to-test traceability for a spec or all specs',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: { type: 'string', description: 'Path to project root' },
      spec: { type: 'string', description: 'Specific spec file path to check' },
      feature: { type: 'string', description: 'Feature name filter' },
      mode: {
        type: 'string',
        enum: ['summary', 'detailed'],
        description:
          'Response density: summary returns coverage stats only, detailed returns full requirement list. Default: summary',
      },
    },
    required: ['path'],
  },
};

export async function handleCheckTraceability(input: {
  path: string;
  spec?: string;
  feature?: string;
  mode?: 'summary' | 'detailed';
}): Promise<McpToolResponse> {
  try {
    const projectPath = sanitizePath(input.path);
    const store = await loadGraphStore(projectPath);
    if (!store) {
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

    const { queryTraceability } = await import('@harness-engineering/graph');

    const options: { specPath?: string; featureName?: string } = {};
    if (input.spec) options.specPath = input.spec;
    if (input.feature) options.featureName = input.feature;

    const results = queryTraceability(store, options);

    if (results.length === 0) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              status: 'no-requirements',
              message:
                'No requirement nodes found in graph. Ingest specs with RequirementIngestor first.',
            }),
          },
        ],
      };
    }

    const mode = input.mode ?? 'summary';

    if (mode === 'summary') {
      const summaries = results.map((r) => ({
        specPath: r.specPath,
        featureName: r.featureName,
        ...r.summary,
      }));

      const totals = summaries.reduce(
        (acc, s) => ({
          total: acc.total + s.total,
          withCode: acc.withCode + s.withCode,
          withTests: acc.withTests + s.withTests,
          fullyTraced: acc.fullyTraced + s.fullyTraced,
          untraceable: acc.untraceable + s.untraceable,
        }),
        { total: 0, withCode: 0, withTests: 0, fullyTraced: 0, untraceable: 0 }
      );

      const overallCoverage =
        totals.total > 0 ? Math.round((totals.fullyTraced / totals.total) * 100) : 0;

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              mode: 'summary',
              overallCoverage,
              totals,
              specs: summaries,
            }),
          },
        ],
      };
    }

    // detailed mode: return full requirement list
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            mode: 'detailed',
            results,
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
