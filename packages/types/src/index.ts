/**
 * @harness-engineering/types
 *
 * Core types and interfaces for Harness Engineering toolkit
 */

/**
 * Result type for consistent error handling across the toolkit.
 */
export type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E };

/**
 * Creates a successful Result.
 */
export function Ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

/**
 * Creates a failed Result.
 */
export function Err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

/**
 * Type guard to check if a Result is successful.
 */
export function isOk<T, E>(result: Result<T, E>): result is { ok: true; value: T } {
  return result.ok === true;
}

/**
 * Type guard to check if a Result is failed.
 */
export function isErr<T, E>(result: Result<T, E>): result is { ok: false; error: E } {
  return result.ok === false;
}

// Workflow orchestration types

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

// --- Skill Metadata Types ---

/**
 * Predefined cognitive modes for skills.
 */
export const STANDARD_COGNITIVE_MODES = [
  'adversarial-reviewer',
  'constructive-architect',
  'meticulous-implementer',
  'diagnostic-investigator',
  'advisory-guide',
  'meticulous-verifier',
] as const;

/**
 * Cognitive mode of a skill, determining its behavior and persona.
 */
export type CognitiveMode = (typeof STANDARD_COGNITIVE_MODES)[number] | (string & {});

/**
 * Static metadata for a skill.
 */
export interface SkillMetadata {
  /** Unique name of the skill */
  name: string;
  /** Semantic version string */
  version: string;
  /** Brief description of what the skill does */
  description: string;
  /** The cognitive mode this skill operates in */
  cognitive_mode?: CognitiveMode;
}

// --- Pipeline Types ---

/**
 * Contextual information for a skill execution.
 */
export interface SkillContext {
  /** Name of the executing skill */
  skillName: string;
  /** Current pipeline phase */
  phase: string;
  /** Files relevant to the current execution */
  files: string[];
  /** Optional token budget — uses a plain record to avoid cross-package deps. */
  tokenBudget?: Record<string, number>;
  /** Additional metadata */
  metadata: Record<string, unknown>;
}

/**
 * Context for a single turn in a multi-turn skill interaction.
 */
export interface TurnContext extends SkillContext {
  /** Current turn number (1-indexed) */
  turnNumber: number;
  /** Results from previous turns in the same session */
  previousResults: unknown[];
}

/**
 * Error reported by a skill.
 */
export type SkillError = {
  /** Machine-readable error code */
  code: string;
  /** Human-readable error message */
  message: string;
  /** Phase in which the error occurred */
  phase: string;
};

// --- CI/CD Integration Types ---

/**
 * Names of standard CI checks.
 */
export type CICheckName =
  | 'validate'
  | 'deps'
  | 'docs'
  | 'entropy'
  | 'security'
  | 'perf'
  | 'phase-gate'
  | 'arch';

/**
 * Status of a CI check.
 */
export type CICheckStatus = 'pass' | 'fail' | 'warn' | 'skip';

/**
 * A specific issue found during a CI check.
 */
export interface CICheckIssue {
  /** Severity level */
  severity: 'error' | 'warning';
  /** Descriptive message */
  message: string;
  /** Path to the affected file */
  file?: string;
  /** Line number in the affected file */
  line?: number;
}

/**
 * Result of a single CI check execution.
 */
export interface CICheckResult {
  /** Name of the check */
  name: CICheckName;
  /** Final status of the check */
  status: CICheckStatus;
  /** List of issues discovered */
  issues: CICheckIssue[];
  /** Execution time in milliseconds */
  durationMs: number;
}

/**
 * Summary counts for a set of CI checks.
 */
export interface CICheckSummary {
  /** Total number of checks run */
  total: number;
  /** Number of passing checks */
  passed: number;
  /** Number of failing checks */
  failed: number;
  /** Number of checks with warnings */
  warnings: number;
  /** Number of skipped checks */
  skipped: number;
}

/**
 * Final report for a CI run.
 */
export interface CICheckReport {
  /** Schema version */
  version: 1;
  /** Name of the project */
  project: string;
  /** ISO timestamp of the run */
  timestamp: string;
  /** Detailed results for each check */
  checks: CICheckResult[];
  /** Aggregated summary */
  summary: CICheckSummary;
  /** Process exit code suggested for the CI runner */
  exitCode: 0 | 1 | 2;
}

/**
 * Severity level that should trigger a CI failure.
 */
export type CIFailOnSeverity = 'error' | 'warning';

/**
 * Configuration options for the CI command.
 */
export interface CICheckOptions {
  /** Checks to skip */
  skip?: CICheckName[];
  /** Severity level that causes failure */
  failOn?: CIFailOnSeverity;
  /** Custom config file path */
  configPath?: string;
}

/**
 * Supported CI platforms.
 */
export type CIPlatform = 'github' | 'gitlab' | 'generic';

/**
 * Options for initializing CI configuration.
 */
export interface CIInitOptions {
  /** Target CI platform */
  platform?: CIPlatform;
  /** Checks to enable */
  checks?: CICheckName[];
}

/**
 * Result of a skill execution.
 */
export type SkillResult = {
  /** Whether the skill achieved its goal */
  success: boolean;
  /** List of artifact paths produced */
  artifacts: string[];
  /** One-line summary of the outcome */
  summary: string;
};

/**
 * Lifecycle hooks for skills.
 */
export interface SkillLifecycleHooks {
  /** Called before the skill starts execution */
  preExecution?: (context: SkillContext) => SkillContext | null;
  /** Called before each turn in a multi-turn interaction */
  perTurn?: (context: TurnContext) => TurnContext | null;
  /** Called after the skill completes execution */
  postExecution?: (context: SkillContext, result: SkillResult) => void;
}

// --- Roadmap Types ---

/**
 * Valid statuses for a roadmap feature.
 */
export type FeatureStatus = 'backlog' | 'planned' | 'in-progress' | 'done' | 'blocked';

/**
 * A feature entry in the project roadmap.
 */
export interface RoadmapFeature {
  /** Feature name (from the H3 heading, without "Feature:" prefix) */
  name: string;
  /** Current status */
  status: FeatureStatus;
  /** Relative path to the spec file, or null if none */
  spec: string | null;
  /** Relative paths to plan files */
  plans: string[];
  /** Names of blocking features (textual references) */
  blockedBy: string[];
  /** One-line summary */
  summary: string;
}

/**
 * A milestone grouping in the roadmap. The special "Backlog" milestone
 * has `isBacklog: true` and appears as `## Backlog` instead of `## Milestone: <name>`.
 */
export interface RoadmapMilestone {
  /** Milestone name (e.g., "MVP Release") or "Backlog" */
  name: string;
  /** True for the special Backlog section */
  isBacklog: boolean;
  /** Features in this milestone, in document order */
  features: RoadmapFeature[];
}

/**
 * YAML frontmatter of the roadmap file.
 */
export interface RoadmapFrontmatter {
  /** Project name */
  project: string;
  /** Schema version (currently 1) */
  version: number;
  /** ISO date when roadmap was created */
  created?: string;
  /** ISO date when roadmap was last updated */
  updated?: string;
  /** ISO timestamp of last automated sync */
  lastSynced: string;
  /** ISO timestamp of last manual edit */
  lastManualEdit: string;
}

/**
 * Parsed roadmap document.
 */
export interface Roadmap {
  /** Parsed frontmatter */
  frontmatter: RoadmapFrontmatter;
  /** Milestones in document order (including Backlog) */
  milestones: RoadmapMilestone[];
}

// --- Session State Types ---
export { SESSION_SECTION_NAMES } from './session-state';
export type {
  SessionSectionName,
  SessionEntryStatus,
  SessionEntry,
  SessionSections,
} from './session-state';

// --- Orchestrator Types ---
export type {
  TokenUsage,
  BlockerRef,
  Issue,
  AgentErrorCategory,
  AgentError,
  SessionStartParams,
  AgentSession,
  TurnParams,
  AgentEvent,
  TurnResult,
  AgentBackend,
  IssueTrackerClient,
  TrackerConfig,
  PollingConfig,
  WorkspaceConfig,
  HooksConfig,
  AgentConfig,
  ServerConfig,
  WorkflowConfig,
  WorkflowDefinition,
} from './orchestrator';
