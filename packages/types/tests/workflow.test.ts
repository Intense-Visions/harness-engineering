import { describe, it, expect } from 'vitest';
import type { WorkflowExecutionPlan, StageRun } from '../src/workflow';

describe('split-routing Phase 1 types', () => {
  it('WorkflowExecutionPlan + StageRun accept the C1 per-stage shape', () => {
    const run: StageRun = {
      index: 0,
      step: { skill: 's', produces: 'a' },
      sessionId: 'sess-0',
      tokens: { input: 10, output: 5, total: 15 },
      outcome: 'pass',
      attempt: 0,
      durationMs: 1,
    };
    const plan: WorkflowExecutionPlan = {
      coherenceUnit: 'issue-1',
      stages: [run.step, run.step],
    };
    expect(plan.stages).toHaveLength(2);
    expect(run.tokens?.total).toBe(15);
  });
});
