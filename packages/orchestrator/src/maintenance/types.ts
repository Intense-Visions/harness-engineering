/**
 * Internal types for the maintenance module.
 * Public config types (MaintenanceConfig, TaskOverride, CustomTaskDefinition,
 * CheckScriptDefinition, OutputRetentionConfig) live in @harness-engineering/types.
 */
import type { CheckScriptDefinition, OutputRetentionConfig } from '@harness-engineering/types';

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
 * Hermes Phase 2 — Provenance tag identifying the trigger source of a run.
 *
 * Set by the entry point, never user-configurable:
 *   - 'cron'                      — scheduled by MaintenanceScheduler
 *   - 'cli'                       — `harness maintenance run <id>`
 *   - { kind: 'api', tokenName }  — Gateway API trigger (Phase 0)
 *   - { kind: 'chain', upstreamTaskId } — fired by a downstream `contextFrom`
 *                                          dependency (reserved; not yet wired)
 */
export type RunOrigin =
  | 'cron'
  | 'cli'
  | { kind: 'api'; tokenName: string }
  | { kind: 'chain'; upstreamTaskId: string };

/**
 * Run mode for a maintenance task (on-demand pipeline, D4).
 *
 * - 'fix'    — current cron behavior: mechanical-ai dispatches on findings,
 *              pure-ai always dispatches, PRs may be opened. Default.
 * - 'report' — read-only sweep: run the check step, record findings, and take
 *              the no-dispatch branch — never dispatch a fix agent or open a PR.
 */
export type RunMode = 'report' | 'fix';

/**
 * Per-task cost ceiling (Hermes Phase 5).
 *
 * When set, the orchestrator's `CostCeilingMonitor` tracks cumulative
 * agent spend for the task and aborts dispatch on exceed (D6 — abort
 * is advisory at the turn boundary).
 */
export interface TaskCostCeiling {
  /** Hard cap in USD. Cumulative spend > maxUsd fires the abort path. */
  maxUsd: number;
  /** Warn threshold expressed as a percentage of `maxUsd` (1–99). */
  warnAtPct?: number;
}

/**
 * Definition of a maintenance task (built-in or Phase 2 custom).
 *
 * Custom-task-only fields (`checkScript`, `inlineSkills`, `inlineSkillsBudgetTokens`,
 * `contextFrom`, `contextFromMaxAgeMinutes`, `outputRetention`, `isCustom`) are
 * populated by the scheduler when merging `MaintenanceConfig.customTasks` into the
 * resolved task list. Built-ins leave them unset and the runner falls through to
 * the legacy execution paths unchanged.
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
  /**
   * Per-task cost ceiling (Hermes Phase 5). When set, cumulative agent
   * spend across all turns dispatched for this task is tracked; the
   * orchestrator aborts dispatch on `maxUsd` exceedance with
   * `RunResult.error === 'cost_ceiling_exceeded'`. Default: unset = no cap.
   */
  costCeiling?: TaskCostCeiling;
  /**
   * Hermes Phase 2 — Arbitrary-executable check (replaces `checkCommand`).
   * Mutually-exclusive with `checkCommand`; validator rejects both.
   */
  checkScript?: CheckScriptDefinition;
  /** Hermes Phase 2 — Skill names whose markdown is inlined into the agent prompt. */
  inlineSkills?: string[];
  /** Hermes Phase 2 — Token-budget cap for inlined skills. Default: 8000. */
  inlineSkillsBudgetTokens?: number;
  /** Hermes Phase 2 — Upstream task IDs whose latest output feeds prompt context. */
  contextFrom?: string[];
  /** Hermes Phase 2 — Max upstream-output age (minutes). Default: 1440. */
  contextFromMaxAgeMinutes?: number;
  /** Hermes Phase 2 — Output retention overrides. */
  outputRetention?: OutputRetentionConfig;
  /** Hermes Phase 2 — Marks tasks originating from `customTasks` config. */
  isCustom?: boolean;
  /**
   * On-demand maintenance pipeline (D5). When `true`, the task is excluded
   * from the human "overdue" sweep computed by `selectTasks` — used for
   * git-mutating housekeeping (`main-sync`, `perf-baselines`,
   * `session-cleanup`) and one-shot backfills (`proposal-provenance-backfill`)
   * that are infra hygiene, not developer-facing health signals.
   * `undefined` (default) → sweep-eligible.
   */
  excludeFromHumanSweep?: boolean;
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
  /**
   * Cumulative agent spend in USD for this run (Hermes Phase 5).
   *
   * Always present (defaults to 0). Populated by the
   * `CostCeilingMonitor` from per-turn `TokenUsage` × `ModelPricing`.
   * When the run aborted on cost-ceiling exceed, `status === 'failure'`
   * and `error === 'cost_ceiling_exceeded'`.
   */
  costUsd?: number;
  /**
   * Hermes Phase 2 — Provenance tag set by the entry point.
   * Older orchestrators may emit this field absent; renderers should fall
   * back to `'—'` rather than crash.
   */
  origin?: RunOrigin;
}

/**
 * Schedule entry for a single task, used in MaintenanceStatus.
 */
export interface ScheduleEntry {
  /** Task identifier */
  taskId: string;
  /**
   * Task type (mechanical-ai | pure-ai | report-only | housekeeping).
   *
   * Optional on the WIRE shape so that a newer dashboard rendering data from
   * an older orchestrator (which did not yet emit this field) does not
   * produce empty cells of unknown semantics. The current orchestrator
   * always populates this field via `MaintenanceScheduler.getStatus()`.
   * Newer dashboards must render `row.type ?? '—'` (or similar fallback).
   */
  type?: TaskType;
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
