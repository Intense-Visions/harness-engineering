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

/** MCP error result carrying human-readable validation messages. */
function validationError(messages: readonly string[]) {
  return {
    content: [{ type: 'text' as const, text: `Validation failed: ${messages.join('; ')}` }],
    isError: true,
  };
}

export async function handlePlanParallelization(input: PlanParallelizationToolInput) {
  try {
    const projectPath = sanitizePath(input.path);

    const { PlanTaskSchema } = await import('@harness-engineering/types');
    const { planParallelization, validatePlanTasks } = await import('@harness-engineering/core');

    // Trust boundary: parse the incoming tasks through the strict schema, then
    // run validatePlanTasks. Hard errors (unknown dependsOn id, dependency
    // cycle) are surfaced as an MCP error rather than silently dropping
    // orphaned edges or returning a cyclic plan with isError:false.
    const parsed = PlanTaskSchema.array().safeParse(input.tasks);
    if (!parsed.success) {
      return validationError(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`));
    }
    const tasks = parsed.data;

    const { errors } = validatePlanTasks(tasks);
    if (errors.length > 0) return validationError(errors);

    const store = await loadGraphStore(projectPath);
    const { ConflictPredictor } = await import('@harness-engineering/graph');

    const predictor = new ConflictPredictor(store ?? undefined);
    const conflicts = predictor.predict({
      tasks: tasks.map((t) => ({ id: t.id, files: t.files })),
      ...(input.depth !== undefined && { depth: input.depth }),
    });

    const plan = planParallelization({
      tasks,
      conflicts,
      ...(input.minWaveSize !== undefined && { minWaveSize: input.minWaveSize }),
    });

    return { content: [{ type: 'text' as const, text: JSON.stringify(plan) }], isError: false };
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
