/**
 * A single step in a multi-skill workflow.
 */
export interface WorkflowStep {
  /** The skill to execute (e.g., "detect-doc-drift") */
  skill: string;
  /** Name of the artifact this step produces */
  produces: string;
  /** Name of the artifact this step expects as input */
  expects?: string;
  /** Whether failure of this step stops the workflow */
  gate?: 'pass-required' | 'advisory';
}

/**
 * Definition of a sequence of steps to achieve a goal.
 */
export interface Workflow {
  /** Descriptive name of the workflow */
  name: string;
  /** Ordered list of steps */
  steps: WorkflowStep[];
}

/**
 * Possible outcomes for a single workflow step.
 */
export type StepOutcome = 'pass' | 'fail' | 'skipped';

/**
 * Detailed result of a workflow step execution.
 */
export interface WorkflowStepResult {
  /** The step that was executed */
  step: WorkflowStep;
  /** The outcome of the execution */
  outcome: StepOutcome;
  /** Path to the produced artifact, if any */
  artifact?: string;
  /** Error message if outcome is 'fail' */
  error?: string;
  /** Execution time in milliseconds */
  durationMs: number;
}

/**
 * Final result of a complete workflow execution.
 */
export interface WorkflowResult {
  /** The workflow that was executed */
  workflow: Workflow;
  /** Results for each step in the workflow */
  stepResults: WorkflowStepResult[];
  /** Whether the overall workflow passed (all required gates passed) */
  pass: boolean;
  /** Total execution time in milliseconds */
  totalDurationMs: number;
}
