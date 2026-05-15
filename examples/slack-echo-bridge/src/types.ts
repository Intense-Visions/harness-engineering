/**
 * Wire-contract types for harness Gateway API webhook deliveries.
 *
 * INTENTIONALLY duplicated from packages/types/src/webhooks.ts:35-42 —
 * this bridge MUST be installable by an external author with no
 * harness-engineering source in scope. The duplication is the cost of
 * proving the wire contract is sufficient.
 *
 * If the orchestrator's GatewayEvent shape evolves, this file MUST be
 * updated and the README's example payload regenerated. Drift is caught
 * by webhook-handler.test.ts's parse step.
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
 * Source: packages/orchestrator/src/orchestrator.ts:672-681 emits the
 * MaintenanceResult verbatim. The fields below are the load-bearing
 * subset; additional fields are tolerated (the bridge does not validate
 * unknown keys).
 */
export interface MaintenanceCompletedData {
  taskId: string;
  status: 'success' | 'failure' | string;
  findings?: Array<{ severity?: string; message?: string }>;
  fixed?: Array<unknown>;
}
