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

// --- Skill Metadata Types ---

export const STANDARD_COGNITIVE_MODES = [
  'adversarial-reviewer',
  'constructive-architect',
  'meticulous-implementer',
  'diagnostic-investigator',
  'advisory-guide',
  'meticulous-verifier',
] as const;

export type CognitiveMode = (typeof STANDARD_COGNITIVE_MODES)[number] | (string & {});

export interface SkillMetadata {
  name: string;
  version: string;
  description: string;
  cognitive_mode?: CognitiveMode;
}

// --- Pipeline Types ---

export interface SkillContext {
  skillName: string;
  phase: string;
  files: string[];
  /** Optional token budget — uses a plain record to avoid cross-package deps. */
  tokenBudget?: Record<string, number>;
  metadata: Record<string, unknown>;
}

export interface TurnContext extends SkillContext {
  turnNumber: number;
  previousResults: unknown[];
}

export type SkillError = {
  code: string;
  message: string;
  phase: string;
};

// --- CI/CD Integration Types ---

export type CICheckName =
  | 'validate'
  | 'deps'
  | 'docs'
  | 'entropy'
  | 'security'
  | 'perf'
  | 'phase-gate';

export type CICheckStatus = 'pass' | 'fail' | 'warn' | 'skip';

export interface CICheckIssue {
  severity: 'error' | 'warning';
  message: string;
  file?: string;
  line?: number;
}

export interface CICheckResult {
  name: CICheckName;
  status: CICheckStatus;
  issues: CICheckIssue[];
  durationMs: number;
}

export interface CICheckSummary {
  total: number;
  passed: number;
  failed: number;
  warnings: number;
  skipped: number;
}

export interface CICheckReport {
  version: 1;
  project: string;
  timestamp: string;
  checks: CICheckResult[];
  summary: CICheckSummary;
  exitCode: 0 | 1 | 2;
}

export type CIFailOnSeverity = 'error' | 'warning';

export interface CICheckOptions {
  skip?: CICheckName[];
  failOn?: CIFailOnSeverity;
  configPath?: string;
}

export type CIPlatform = 'github' | 'gitlab' | 'generic';

export interface CIInitOptions {
  platform?: CIPlatform;
  checks?: CICheckName[];
}

export type SkillResult = {
  success: boolean;
  artifacts: string[];
  summary: string;
};

export interface SkillLifecycleHooks {
  preExecution?: (context: SkillContext) => SkillContext | null;
  perTurn?: (context: TurnContext) => TurnContext | null;
  postExecution?: (context: SkillContext, result: SkillResult) => void;
}
