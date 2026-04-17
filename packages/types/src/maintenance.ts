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
