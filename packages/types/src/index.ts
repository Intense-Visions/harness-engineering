/**
 * @harness-engineering/types
 *
 * Core types and interfaces for Harness Engineering toolkit
 */

// Result type for consistent error handling
export type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E };

/**
 * Creates a successful Result
 */
export function Ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

/**
 * Creates a failed Result
 */
export function Err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

/**
 * Type guard to check if a Result is successful
 */
export function isOk<T, E>(result: Result<T, E>): result is { ok: true; value: T } {
  return result.ok === true;
}

/**
 * Type guard to check if a Result is failed
 */
export function isErr<T, E>(result: Result<T, E>): result is { ok: false; error: E } {
  return result.ok === false;
}

// Workflow orchestration types

export interface WorkflowStep {
  skill: string;
  produces: string;
  expects?: string;
  gate?: 'pass-required' | 'advisory';
}

export interface Workflow {
  name: string;
  steps: WorkflowStep[];
}

export type StepOutcome = 'pass' | 'fail' | 'skipped';

export interface WorkflowStepResult {
  step: WorkflowStep;
  outcome: StepOutcome;
  artifact?: string;
  error?: string;
  durationMs: number;
}

export interface WorkflowResult {
  workflow: Workflow;
  stepResults: WorkflowStepResult[];
  pass: boolean;
  totalDurationMs: number;
}
