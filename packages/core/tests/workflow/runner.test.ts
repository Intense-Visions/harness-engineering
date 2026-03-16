import { describe, it, expect } from 'vitest';
import { executeWorkflow } from '../../src/workflow/runner';
import type { Workflow, WorkflowStep, WorkflowStepResult } from '@harness-engineering/types';

const makeStep = (overrides: Partial<WorkflowStep> = {}): WorkflowStep => ({
  skill: 'test-skill',
  produces: 'test-artifact',
  ...overrides,
});

const passingExecutor = async (step: WorkflowStep): Promise<WorkflowStepResult> => ({
  step,
  outcome: 'pass',
  artifact: `${step.produces}-output`,
  durationMs: 10,
});

const failingExecutor = async (step: WorkflowStep): Promise<WorkflowStepResult> => ({
  step,
  outcome: 'fail',
  error: 'Step failed',
  durationMs: 10,
});

describe('workflow runner', () => {
  describe('executeWorkflow', () => {
    it('executes all steps in sequence and returns pass', async () => {
      const workflow: Workflow = {
        name: 'test-workflow',
        steps: [
          makeStep({ skill: 'plan', produces: 'plan-doc' }),
          makeStep({ skill: 'implement', produces: 'code', expects: 'plan-doc' }),
          makeStep({ skill: 'verify', produces: 'report', expects: 'code' }),
        ],
      };

      const result = await executeWorkflow(workflow, passingExecutor);

      expect(result.pass).toBe(true);
      expect(result.stepResults).toHaveLength(3);
      expect(result.stepResults.every((r) => r.outcome === 'pass')).toBe(true);
      expect(result.workflow).toBe(workflow);
      expect(result.totalDurationMs).toBeGreaterThanOrEqual(0);
    });

    it('stops on pass-required gate failure', async () => {
      const workflow: Workflow = {
        name: 'gated-workflow',
        steps: [
          makeStep({ skill: 'plan', produces: 'plan-doc', gate: 'pass-required' }),
          makeStep({ skill: 'implement', produces: 'code', expects: 'plan-doc' }),
        ],
      };

      const result = await executeWorkflow(workflow, failingExecutor);

      expect(result.pass).toBe(false);
      expect(result.stepResults).toHaveLength(2);
      expect(result.stepResults[0].outcome).toBe('fail');
      expect(result.stepResults[1].outcome).toBe('skipped');
    });

    it('continues past advisory gate failure', async () => {
      const callLog: string[] = [];
      const loggingExecutor = async (step: WorkflowStep): Promise<WorkflowStepResult> => {
        callLog.push(step.skill);
        if (step.skill === 'lint') {
          return { step, outcome: 'fail', error: 'Lint warnings', durationMs: 10 };
        }
        return { step, outcome: 'pass', artifact: step.produces, durationMs: 10 };
      };

      const workflow: Workflow = {
        name: 'advisory-workflow',
        steps: [
          makeStep({ skill: 'implement', produces: 'code' }),
          makeStep({ skill: 'lint', produces: 'lint-report', expects: 'code', gate: 'advisory' }),
          makeStep({ skill: 'test', produces: 'test-report', expects: 'code' }),
        ],
      };

      const result = await executeWorkflow(workflow, loggingExecutor);

      expect(callLog).toEqual(['implement', 'lint', 'test']);
      expect(result.pass).toBe(false);
      expect(result.stepResults[1].outcome).toBe('fail');
      expect(result.stepResults[2].outcome).toBe('pass');
    });

    it('handles empty workflow', async () => {
      const workflow: Workflow = { name: 'empty', steps: [] };
      const result = await executeWorkflow(workflow, passingExecutor);

      expect(result.pass).toBe(true);
      expect(result.stepResults).toHaveLength(0);
    });

    it('passes previous artifact to executor', async () => {
      const receivedArtifacts: (string | undefined)[] = [];
      const trackingExecutor = async (
        step: WorkflowStep,
        previousArtifact?: string
      ): Promise<WorkflowStepResult> => {
        receivedArtifacts.push(previousArtifact);
        return { step, outcome: 'pass', artifact: `${step.produces}-out`, durationMs: 10 };
      };

      const workflow: Workflow = {
        name: 'artifact-chain',
        steps: [
          makeStep({ skill: 'plan', produces: 'plan-doc' }),
          makeStep({ skill: 'implement', produces: 'code', expects: 'plan-doc' }),
          makeStep({ skill: 'verify', produces: 'report', expects: 'code' }),
        ],
      };

      await executeWorkflow(workflow, trackingExecutor);

      expect(receivedArtifacts).toEqual([undefined, 'plan-doc-out', 'code-out']);
    });
  });
});
