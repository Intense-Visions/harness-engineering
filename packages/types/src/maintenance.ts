/**
 * Wire-shape entry returned by the dashboard `GET /api/maintenance/history` endpoint.
 *
 * This is the serialized form of an internal `RunResult` adapted for the
 * Maintenance dashboard page. It is the single source of truth for the wire
 * contract between the orchestrator's history route and the dashboard client.
 *
 * Note: `status: 'failed'` is the dashboard convention; the internal
 * `RunResult.status === 'failure'` is renamed during serialization.
 */
export interface MaintenanceHistoryEntry {
  /** Task identifier (mapped from `RunResult.taskId`) */
  task: string;
  /** ISO timestamp when the run started */
  startedAt: string;
  /** Total run duration in ms (computed from `completedAt - startedAt`); 0 if missing */
  durationMs: number;
  /** Run outcome (dashboard convention: `'failed'` instead of `'failure'`) */
  status: 'success' | 'failed' | 'skipped' | 'no-issues';
  /** Number of issues/findings detected (defaults to 0 when undefined) */
  findings: number;
  /** URL of the created/updated PR, or null if no PR */
  prUrl: string | null;
  /** Error message if status is 'failed' */
  error?: string;
}

/**
 * Per-task overrides in the maintenance configuration.
 */
export interface TaskOverride {
  /** Whether this task is enabled (default: true) */
  enabled?: boolean;
  /** Cron expression override for this task's schedule */
  schedule?: string;
  /** Backend name override for AI tasks (e.g., 'local', 'claude') */
  aiBackend?: string;
}

/**
 * Hermes Phase 2 — Cost ceiling (mirror of orchestrator `TaskCostCeiling`).
 * Re-declared in the public package to keep type-only access available
 * to consumers that don't depend on `@harness-engineering/orchestrator`.
 */
export interface TaskCostCeilingConfig {
  maxUsd: number;
  warnAtPct?: number;
}

/**
 * Hermes Phase 2 — Output retention policy for a custom maintenance task.
 *
 * Both bounds apply (whichever fires first removes the entry). Defaults:
 * `runs = 50`, `maxAgeDays = 30`.
 */
export interface OutputRetentionConfig {
  /** Keep at most this many runs per task. */
  runs?: number;
  /** Drop entries older than this many days. */
  maxAgeDays?: number;
}

/**
 * Hermes Phase 2 — Arbitrary-executable check script for custom tasks.
 *
 * Replaces `checkCommand: string[]` for user-defined tasks. The runner
 * spawns `path` with `args`, captures stdout + stderr, and (when
 * `parseStdoutJson` is true / unset) parses the last non-empty stdout
 * line as a structured status envelope. See the proposal §D6 for the
 * recognized JSON shape.
 */
export interface CheckScriptDefinition {
  /** Executable path (absolute or project-root relative). */
  path: string;
  /** CLI args appended verbatim. */
  args?: string[];
  /** Parse the last non-empty stdout line as JSON. Default: true. */
  parseStdoutJson?: boolean;
  /** Execution timeout in ms. Default: 120_000. */
  timeoutMs?: number;
}

/**
 * Hermes Phase 2 — A user-defined maintenance task in `harness.config.json`'s
 * `maintenance.customTasks` section.
 *
 * Honors the same 4-task-type taxonomy as `BUILT_IN_TASKS`; per-type
 * required-field invariants are enforced by `validateCustomTasks` at
 * config-load time (cycle detection, skill/script existence, type-specific
 * field presence). See `docs/changes/hermes-phase-2-custom-jobs/proposal.md`.
 */
export interface CustomTaskDefinition {
  /** Execution strategy (matches built-in TaskType). */
  type: 'mechanical-ai' | 'pure-ai' | 'report-only' | 'housekeeping';
  /** Human-readable description (shown in CLI/dashboard). */
  description: string;
  /** Cron expression for the schedule (e.g. '0 2 * * *'). */
  schedule: string;
  /** Branch name for PR-producing tasks; null for report-only/housekeeping. */
  branch: string | null;
  /** Legacy CLI args (parity with built-ins). Mutually-exclusive with `checkScript`. */
  checkCommand?: string[];
  /** Arbitrary executable invocation. Mutually-exclusive with `checkCommand`. */
  checkScript?: CheckScriptDefinition;
  /** Skill name dispatched after a positive check (mechanical-ai, pure-ai). */
  fixSkill?: string;
  /** Skill names whose markdown bodies are inlined into the agent prompt. */
  inlineSkills?: string[];
  /** Budget cap for inlined skills in tokens (warns-then-truncates). Default: 8000. */
  inlineSkillsBudgetTokens?: number;
  /** Upstream task IDs whose latest outputs feed this task's prompt context. */
  contextFrom?: string[];
  /** Max age (minutes) of upstream outputs to inject. Default: 1440 (24h). */
  contextFromMaxAgeMinutes?: number;
  /** Per-task output retention overrides. */
  outputRetention?: OutputRetentionConfig;
  /** Per-task cost ceiling. */
  costCeiling?: TaskCostCeilingConfig;
  /**
   * Exclude this custom task from the on-demand human "overdue" sweep
   * (parity with built-ins). Default (`undefined`) → sweep-eligible.
   */
  excludeFromHumanSweep?: boolean;
}

/**
 * Hermes Phase 2 — Per-directory cleanup rules consumed by
 * `harness cleanup-sessions --all`.
 *
 * Keys correspond to entries in the `cleanup-sessions` registered-target
 * table; values override the default TTL hours. Unknown keys are ignored
 * (forward-compatible with future targets).
 */
export interface CleanupConfig {
  /**
   * Per-target TTL overrides keyed by registered target name
   * (e.g. `sessions`, `cache`, `maintenance`, `dashboard-state`,
   * `snapshots`, `analyzer-output`).
   */
  ttlHours?: Record<string, number>;
}

/**
 * Hermes Phase 2 — Pre-launch OSV malware guard configuration.
 *
 * When `enabled !== false`, the guard runs as part of `setup-mcp` and is
 * also exposed via `harness mcp-guard check`. `strict` reverses the
 * default fail-open posture on network failure.
 */
export interface OsvGuardConfig {
  /** Whether the guard is enabled. Default: true. */
  enabled?: boolean;
  /** Fail closed on network errors. Default: false. */
  strict?: boolean;
  /** Advisory cache TTL in hours. Default: 24. */
  cacheTtlHours?: number;
}

/**
 * Configuration for the scheduled maintenance module.
 * Added as an optional property on WorkflowConfig.
 */
export interface MaintenanceConfig {
  /** Whether scheduled maintenance is enabled */
  enabled: boolean;
  /** Default AI backend name for maintenance tasks (default: 'local') */
  aiBackend?: string;
  /** Base branch for maintenance PRs (default: 'main') */
  baseBranch?: string;
  /** Prefix for maintenance branch names (default: 'harness-maint/') */
  branchPrefix?: string;
  /** TTL in ms for the leader election claim (default: 300000) */
  leaderClaimTTLMs?: number;
  /** How often in ms to evaluate cron schedules (default: 60000) */
  checkIntervalMs?: number;
  /** Per-task overrides keyed by task ID */
  tasks?: Record<string, TaskOverride>;
  /**
   * Hermes Phase 2 — User-defined tasks alongside the 21 built-ins.
   *
   * Keys are task IDs (kebab-case, `^[a-z0-9-]+$`). Values describe the
   * full task. Validated at config-load by `validateCustomTasks` in the
   * orchestrator package; invalid entries surface as a startup error with
   * the offending field path.
   */
  customTasks?: Record<string, CustomTaskDefinition>;
}
