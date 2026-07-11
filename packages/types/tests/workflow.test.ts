import { describe, it, expect } from 'vitest';
import type { WorkflowExecutionPlan, StageRun } from '../src/workflow';
import type { RoutingDecision, CapabilityTier } from '../src/orchestrator';

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

describe('split-routing Phase 2 StageRun routing fields', () => {
  it('StageRun accepts a resolved decision + tier', () => {
    const tier: CapabilityTier = 'strong';
    const decision = { backendName: 'strong-backend', tierRequired: tier } as RoutingDecision;
    const run: StageRun = {
      index: 0,
      step: { skill: 's', produces: 'a' },
      decision,
      tier,
    };
    expect(run.decision?.backendName).toBe('strong-backend');
    expect(run.tier).toBe('strong');
  });
});
