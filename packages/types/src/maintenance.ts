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
}
