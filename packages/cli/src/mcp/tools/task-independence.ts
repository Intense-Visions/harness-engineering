import { loadGraphStore } from '../utils/graph-loader.js';
import { sanitizePath } from '../utils/sanitize-path.js';

// ── check_task_independence ─────────────────────────────────────────

export const checkTaskIndependenceDefinition = {
  name: 'check_task_independence',
  description:
    'Check whether N tasks can safely run in parallel by detecting file overlaps and transitive dependency conflicts. Returns pairwise independence matrix and parallel groupings.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: { type: 'string', description: 'Path to project root' },
      tasks: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            files: { type: 'array', items: { type: 'string' } },
          },
          required: ['id', 'files'],
        },
        minItems: 2,
        description: 'Tasks to check. Each task has an id and a list of file paths.',
      },
      depth: {
        type: 'number',
        description: 'Expansion depth (0=file-only, 1=default, 2-3=thorough)',
      },
      edgeTypes: {
        type: 'array',
        items: { type: 'string' },
        description: 'Edge types for graph expansion. Default: imports, calls, references',
      },
      mode: {
        type: 'string',
        enum: ['summary', 'detailed'],
        description: 'summary omits overlap details. Default: detailed',
      },
    },
    required: ['path', 'tasks'],
  },
};

export async function handleCheckTaskIndependence(input: {
  path: string;
  tasks: Array<{ id: string; files: string[] }>;
  depth?: number;
  edgeTypes?: string[];
  mode?: 'summary' | 'detailed';
}) {
  try {
    const projectPath = sanitizePath(input.path);

    // Graceful degradation: load graph but do not error if absent
    const store = await loadGraphStore(projectPath);

    const { TaskIndependenceAnalyzer } = await import('@harness-engineering/graph');
    const analyzer = new TaskIndependenceAnalyzer(store ?? undefined);

    const result = analyzer.analyze({
      tasks: input.tasks,
      ...(input.depth !== undefined && { depth: input.depth }),
      ...(input.edgeTypes !== undefined && { edgeTypes: input.edgeTypes }),
    });

    if (input.mode === 'summary') {
      // Strip overlap details from pairs for summary mode
      const summaryPairs = result.pairs.map((p) => ({
        taskA: p.taskA,
        taskB: p.taskB,
        independent: p.independent,
      }));

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              mode: 'summary',
              verdict: result.verdict,
              analysisLevel: result.analysisLevel,
              depth: result.depth,
              groups: result.groups,
              pairs: summaryPairs,
            }),
          },
        ],
      };
    }

    // Detailed mode (default): return full result
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
