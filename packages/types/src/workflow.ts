import type { ComplexityVerdict, RoutingRisk } from './orchestrator';

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
  /** Drives the per-stage RoutingUseCase (Phase 2 consumer). */
  cognitiveMode?: string;
  /**
   * Deterministic routing hint (S3): when present, Phase 2 seeds
   * RoutingRequest.complexity/risk so a fixture's `strong` and `fast`
   * stages resolve differently without live text classification.
   * No runtime consumer in Phase 1 (types are additive).
   */
  routingHint?: { complexity?: ComplexityVerdict; risk?: RoutingRisk };
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

/** A resolved plan the stage-execution engine runs (split-routing). */
export interface WorkflowExecutionPlan {
  /** One coherence unit across all stages (= issue.id). */
  coherenceUnit: string;
  /** Ordered stages; the engine runs them sequentially on one worktree. */
  stages: WorkflowStep[];
}

/** Per-stage execution record — carries per-stage session + cost (C1/D3). */
export interface StageRun {
  index: number;
  step: WorkflowStep;
  /** C1: this stage's own session id — NOT the issue's. */
  sessionId?: string;
  /** C1: per-stage token cost, so split-routing cost is attributable. */
  tokens?: { input: number; output: number; total: number };
  outcome?: 'pass' | 'fail' | 'error';
  /** 0 or 1 (Phase 3 engine retry cap); always 0 in Phase 1. */
  attempt?: number;
  durationMs?: number;
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
