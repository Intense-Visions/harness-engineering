import { describe, it, expect } from 'vitest';
import { planParallelizationDefinition, handlePlanParallelization } from './parallelization';

describe('plan_parallelization tool', () => {
  it('exposes a well-formed definition', () => {
    expect(planParallelizationDefinition.name).toBe('plan_parallelization');
    expect(planParallelizationDefinition.inputSchema.required).toContain('path');
    expect(planParallelizationDefinition.inputSchema.required).toContain('tasks');
  });

  it('returns a ParallelizationPlan for a fixture task set (Truth #7)', async () => {
    const res = await handlePlanParallelization({
      path: process.cwd(),
      tasks: [
        { id: 'a', files: ['a.ts'] },
        { id: 'b', files: ['b.ts'], dependsOn: ['a'] },
      ],
    });
    expect(res.isError).toBeFalsy();
    const plan = JSON.parse(res.content[0]!.text);
    expect(Array.isArray(plan.waves)).toBe(true);
    expect(plan).toHaveProperty('serialized');
    expect(plan).toHaveProperty('cyclic');
    expect(typeof plan.narration).toBe('string');
  });
});
