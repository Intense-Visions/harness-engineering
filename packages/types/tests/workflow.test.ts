import { describe, it, expect } from 'vitest';
import type { WorkflowExecutionPlan, StageRun } from '../src/workflow';
import type {
  RoutingDecision,
  CapabilityTier,
  WorkflowConfig,
  StagedWorkflowDecl,
} from '../src/orchestrator';

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

describe('split-routing Phase 4 producer decl (D7)', () => {
  // A minimal WorkflowConfig subset for the additive/optional compile assertion.
  // We only need to prove the `workflows` field is optional (SC4/adopter-portable):
  // a config with NO `workflows` must type-check, and one WITH a valid decl too.
  it('WorkflowConfig without a `workflows` field still type-checks (additive/optional; SC4)', () => {
    // Pick<> keeps the fixture small while still exercising `workflows?` optionality
    // on the real interface (the omitted required sections don't affect the check).
    const cfg: Pick<WorkflowConfig, 'workflows'> = {};
    expect(cfg.workflows).toBeUndefined();
  });

  it('WorkflowConfig accepts a valid `workflows` array of StagedWorkflowDecl', () => {
    const decl: StagedWorkflowDecl = {
      name: 'review-then-implement',
      match: { identifierPrefix: 'REV-', labels: ['staged'] },
      stages: [
        { skill: 'review', produces: 'review-notes' },
        { skill: 'implement', produces: 'patch', expects: 'review-notes', gate: 'pass-required' },
      ],
      stageDeadlineMs: 90_000,
    };
    const cfg: Pick<WorkflowConfig, 'workflows'> = { workflows: [decl] };
    expect(cfg.workflows).toHaveLength(1);
    expect(cfg.workflows?.[0]?.stages).toHaveLength(2);
    expect(cfg.workflows?.[0]?.match.identifierPrefix).toBe('REV-');
  });
});
