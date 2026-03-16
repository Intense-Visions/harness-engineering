import type {
  Workflow,
  WorkflowStep,
  WorkflowResult,
  WorkflowStepResult,
} from '@harness-engineering/types';

export type StepExecutor = (
  step: WorkflowStep,
  previousArtifact?: string
) => Promise<WorkflowStepResult>;

export async function executeWorkflow(
  workflow: Workflow,
  executor: StepExecutor
): Promise<WorkflowResult> {
  const stepResults: WorkflowStepResult[] = [];
  const startTime = Date.now();
  let previousArtifact: string | undefined;
  let stopped = false;

  for (const step of workflow.steps) {
    if (stopped) {
      stepResults.push({
        step,
        outcome: 'skipped',
        durationMs: 0,
      });
      continue;
    }

    const stepResult = await executor(step, previousArtifact);
    stepResults.push(stepResult);

    if (stepResult.outcome === 'pass') {
      previousArtifact = stepResult.artifact;
    } else {
      const gate = step.gate ?? 'pass-required';
      if (gate === 'pass-required') {
        stopped = true;
      }
    }
  }

  const hasFailure = stepResults.some((r) => r.outcome === 'fail');

  return {
    workflow,
    stepResults,
    pass: !hasFailure,
    totalDurationMs: Date.now() - startTime,
  };
}
