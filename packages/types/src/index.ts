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
  | 'phase-gate'
  | 'arch';

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
