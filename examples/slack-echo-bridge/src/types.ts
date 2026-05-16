/**
 * Wire-contract types for harness Gateway API webhook deliveries.
 *
 * INTENTIONALLY duplicated from packages/types/src/webhooks.ts:35-42 —
 * this bridge MUST be installable by an external author with no
 * harness-engineering source in scope. The duplication is the cost of
 * proving the wire contract is sufficient.
 *
 * If the orchestrator's GatewayEvent shape evolves, this file MUST be
 * updated and the README's example payload regenerated.
 */

/** A single envelope delivered to the bridge URL. */
export interface GatewayEvent {
  /** Unique delivery envelope id: "evt_" + hex. Also sent as X-Harness-Delivery-Id. */
  id: string;
  /** Event type: "maintenance.completed" for this bridge. */
  type: string;
  /** ISO-8601 timestamp at orchestrator emit time. */
  timestamp: string;
  /** Event-specific payload. For maintenance.completed: a MaintenanceResult. */
  data: unknown;
  /** Optional correlation id linking related events (e.g., a maintenance run + its children). */
  correlationId?: string;
}

/**
 * Shape of `data` for `maintenance.completed` events.
 *
 * Source: packages/orchestrator/src/maintenance/types.ts:39-58 (`RunResult`)
 * — the orchestrator emits the RunResult verbatim at
 * packages/orchestrator/src/orchestrator.ts:680-681. The fields below
 * mirror that interface; additional fields are tolerated (the bridge
 * does not validate unknown keys).
 */
export interface MaintenanceCompletedData {
  /** ID of the task that was run (e.g., 'arch-violations'). */
  taskId: string;
  /** ISO timestamp when the run started. */
  startedAt: string;
  /** ISO timestamp when the run completed. */
  completedAt: string;
  /** Outcome of the run. */
  status: 'success' | 'failure' | 'skipped' | 'no-issues';
  /** Number of issues/findings detected. */
  findings: number;
  /** Number of issues fixed. */
  fixed: number;
  /** URL of the created/updated PR, or null if no PR was created. */
  prUrl: string | null;
  /** Whether an existing PR was updated (vs newly created). */
  prUpdated: boolean;
  /** Error message if status is 'failure'. */
  error?: string;
}
