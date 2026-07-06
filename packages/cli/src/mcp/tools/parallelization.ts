import { loadGraphStore } from '../utils/graph-loader.js';
import { sanitizePath } from '../utils/sanitize-path.js';

// ── plan_parallelization ────────────────────────────────────────────

export const planParallelizationDefinition = {
  name: 'plan_parallelization',
  description:
    'Plan safe parallel execution for a set of plan tasks. Builds a task DAG from dependsOn plus file/owns overlap, wave-groups it, annotates each wave with conflict severity and a firing decision, and returns a ParallelizationPlan (waves, serialized, cyclic, narration).',
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
            dependsOn: { type: 'array', items: { type: 'string' } },
            owns: { type: 'array', items: { type: 'string' } },
          },
          required: ['id', 'files'],
        },
        minItems: 1,
        description: 'Plan tasks. Each has id, files, and optional dependsOn/owns.',
      },
      depth: {
        type: 'number',
        description: 'Conflict expansion depth (0=file-only, 1=default)',
      },
      minWaveSize: {
        type: 'number',
        description: 'Minimum independent tasks in a wave to justify parallel dispatch. Default 3.',
      },
    },
    required: ['path', 'tasks'],
  },
};

type PlanParallelizationToolInput = {
  path: string;
  tasks: Array<{ id: string; files: string[]; dependsOn?: string[]; owns?: string[] }>;
  depth?: number;
  minWaveSize?: number;
};

export async function handlePlanParallelization(input: PlanParallelizationToolInput) {
  try {
    const projectPath = sanitizePath(input.path);
    const store = await loadGraphStore(projectPath);

    const { ConflictPredictor } = await import('@harness-engineering/graph');
    const { planParallelization } = await import('@harness-engineering/core');

    const predictor = new ConflictPredictor(store ?? undefined);
    const conflicts = predictor.predict({
      tasks: input.tasks.map((t) => ({ id: t.id, files: t.files })),
      ...(input.depth !== undefined && { depth: input.depth }),
    });

    const plan = planParallelization({
      tasks: input.tasks,
      conflicts,
      ...(input.minWaveSize !== undefined && { minWaveSize: input.minWaveSize }),
    });

    return { content: [{ type: 'text' as const, text: JSON.stringify(plan) }] };
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
