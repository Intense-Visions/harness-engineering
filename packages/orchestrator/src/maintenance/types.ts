/**
 * Internal types for the maintenance module.
 * Public config types (MaintenanceConfig, TaskOverride) live in @harness-engineering/types.
 */

/**
 * Classification of maintenance task execution strategy.
 *
 * - mechanical-ai: Run a check command first; dispatch AI agent only if fixable issues are found.
 * - pure-ai: Always dispatch an AI agent on schedule regardless of preconditions.
 * - report-only: Run a command and record metrics; never create branches or PRs.
 * - housekeeping: Run a mechanical command directly; no AI, no PR.
 */
export type TaskType = 'mechanical-ai' | 'pure-ai' | 'report-only' | 'housekeeping';

/**
 * Definition of a built-in maintenance task.
 */
export interface TaskDefinition {
  /** Unique identifier for this task (e.g., 'arch-violations') */
  id: string;
  /** Execution strategy */
  type: TaskType;
  /** Human-readable description */
  description: string;
  /** Default cron expression (e.g., '0 2 * * *' for daily at 2am) */
  schedule: string;
  /** Branch name for PRs, or null for report-only/housekeeping tasks */
  branch: string | null;
  /** CLI command args for the mechanical check step (mechanical-ai and report-only) */
  checkCommand?: string[];
  /** Skill name to dispatch for AI fix (mechanical-ai and pure-ai) */
  fixSkill?: string;
}

/**
 * Result of a single maintenance task run.
 */
export interface RunResult {
  /** ID of the task that was run */
  taskId: string;
  /** ISO timestamp when the run started */
  startedAt: string;
  /** ISO timestamp when the run completed */
  completedAt: string;
  /** Outcome of the run */
  status: 'success' | 'failure' | 'skipped' | 'no-issues';
  /** Number of issues/findings detected */
  findings: number;
  /** Number of issues fixed */
  fixed: number;
  /** URL of the created/updated PR, or null if no PR was created */
  prUrl: string | null;
  /** Whether an existing PR was updated (vs newly created) */
  prUpdated: boolean;
  /** Error message if status is 'failure' */
  error?: string;
}

/**
 * Schedule entry for a single task, used in MaintenanceStatus.
 */
export interface ScheduleEntry {
  /** Task identifier */
  taskId: string;
  /** Task type (mechanical-ai | pure-ai | report-only | housekeeping). */
  type: string;
  /** ISO timestamp of the next scheduled run */
  nextRun: string;
  /** Result of the most recent run, or null if never run */
  lastRun: RunResult | null;
}

/**
 * Overall maintenance module status, exposed via dashboard API.
 */
export interface MaintenanceStatus {
  /** Whether this orchestrator instance is the maintenance leader */
  isLeader: boolean;
  /** ISO timestamp of the last successful leader claim, or null */
  lastLeaderClaim: string | null;
  /** Schedule state for all enabled tasks */
  schedule: ScheduleEntry[];
  /** Currently executing task, or null if idle */
  activeRun: { taskId: string; startedAt: string } | null;
  /** History of completed runs (most recent first) */
  history: RunResult[];
}
