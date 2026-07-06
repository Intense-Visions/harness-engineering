import { z } from 'zod';

/**
 * A single task in an implementation plan, used as the input unit for
 * parallelization planning.
 *
 * `dependsOn` is the explicit dependency edge (task ids) introduced by the
 * standardize-parallel-execution feature. `owns` is READ if present but
 * OWNED/DEFINED by roadmap #601 — do not treat its presence here as this
 * feature adopting `owns:[paths]` authoring.
 */
export const PlanTaskSchema = z
  .object({
    /** Stable, unique task id within a plan. */
    id: z.string().min(1),
    /** Files the task is expected to touch — the independence-checking input. */
    files: z.array(z.string()),
    /** Ids of tasks that must complete before this one (explicit DAG edges). */
    dependsOn: z.array(z.string()).optional(),
    /** Path globs the task claims ownership of. Consumed if present; defined by #601. */
    owns: z.array(z.string()).optional(),
  })
  .strict();

export type PlanTask = z.infer<typeof PlanTaskSchema>;
