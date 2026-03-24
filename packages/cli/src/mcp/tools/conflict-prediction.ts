import { loadGraphStore } from '../utils/graph-loader.js';
import { sanitizePath } from '../utils/sanitize-path.js';

// ── predict_conflicts ────────────────────────────────────────────

export const predictConflictsDefinition = {
  name: 'predict_conflicts',
  description:
    'Predict conflict severity for task pairs with automatic parallel group recomputation. Returns severity-classified conflicts, revised groups, and human-readable reasoning.',
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
        description: 'summary omits overlap details from conflicts. Default: detailed',
      },
    },
    required: ['path', 'tasks'],
  },
};

export async function handlePredictConflicts(input: {
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

    const { ConflictPredictor } = await import('@harness-engineering/graph');
    const predictor = new ConflictPredictor(store ?? undefined);

    const result = predictor.predict({
      tasks: input.tasks,
      ...(input.depth !== undefined && { depth: input.depth }),
      ...(input.edgeTypes !== undefined && { edgeTypes: input.edgeTypes }),
    });

    if (input.mode === 'summary') {
      // Strip overlap details from conflicts for summary mode
      const summaryConflicts = result.conflicts.map((c) => ({
        taskA: c.taskA,
        taskB: c.taskB,
        severity: c.severity,
        reason: c.reason,
        mitigation: c.mitigation,
      }));

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              mode: 'summary',
              tasks: result.tasks,
              analysisLevel: result.analysisLevel,
              depth: result.depth,
              conflicts: summaryConflicts,
              groups: result.groups,
              summary: result.summary,
              verdict: result.verdict,
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
