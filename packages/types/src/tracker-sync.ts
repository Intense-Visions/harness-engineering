import type { FeatureStatus } from './roadmap';

/**
 * Represents a ticket created in an external tracking service.
 */
export interface ExternalTicket {
  /** External identifier, e.g., "github:owner/repo#42" */
  externalId: string;
  /** URL to the ticket in the external service */
  url: string;
}

/**
 * Current state of a ticket in the external service.
 * Pulled during syncFromExternal.
 */
export interface ExternalTicketState {
  /** External identifier */
  externalId: string;
  /** Ticket title in the external service */
  title: string;
  /** External status (e.g., "open", "closed") */
  status: string;
  /**
   * Why the ticket reached its current status, when the tracker distinguishes it.
   * GitHub issues expose `state_reason`: `completed` | `not_planned` | `reopened`.
   * Optional — adapters that cannot supply it leave it `undefined`, and consumers
   * must treat absence conservatively (do not assume a non-`completed` close).
   * Used by the offline auto-done reconciler to avoid flipping a row to `done`
   * when its issue was closed as `not_planned`/`wontfix` rather than completed.
   */
  stateReason?: 'completed' | 'not_planned' | 'reopened';
  /** External labels (used for status disambiguation on GitHub) */
  labels: string[];
  /** Current assignee in the external service, or null */
  assignee: string | null;
}

/**
 * A create that was computed but not performed, with the reason it was withheld.
 * `create-disabled` = `allowCreate: false`; `dry-run` = no writes were issued at all.
 */
export interface SkippedCreate {
  /** Roadmap feature name that has no externalId */
  feature: string;
  /** Milestone the feature belongs to */
  milestone: string;
  /** Why creation was withheld */
  reason: 'create-disabled' | 'dry-run';
}

/**
 * An issue open/closed state transition that was computed but deliberately not
 * pushed because `syncIssueState: false` was in force. This is the count that
 * answers "how many live issues would an unattended sync have closed or
 * reopened?" — it must never be silently dropped.
 */
export interface SkippedStateChange {
  /** External identifier of the ticket whose state was left alone */
  externalId: string;
  /** Current external state (e.g. "open") */
  from: string;
  /** External state the roadmap status maps to (e.g. "closed") */
  to: string;
}

/**
 * Denominator record for a sync run: what was actually looked at.
 *
 * A sync that compared zero rows or fetched zero tickets has ABSTAINED, not
 * succeeded — callers are expected to fail loudly on a zero denominator rather
 * than report a pass. `ticketsFetched: null` means the fetch itself failed
 * (distinct from a successful fetch that returned nothing).
 */
export interface SyncDenominator {
  /** Roadmap rows loaded and compared */
  roadmapRows: number;
  /** Tickets fetched from the tracker, or null when the fetch failed */
  ticketsFetched: number | null;
}

/**
 * Changes a dry run computed but did not perform. Populated only when
 * `dryRun: true`; empty otherwise (a real run reports through
 * {@link SyncResult.created} / {@link SyncResult.updated} instead).
 */
export interface PlannedSyncChanges {
  /** Tickets that would have been created */
  creates: Array<{ feature: string; milestone: string }>;
  /** External IDs of tickets that would have been patched */
  updates: string[];
  /** Roadmap feature names whose local row would have been rewritten */
  localWrites: string[];
}

/**
 * An inbound (tracker → roadmap) write that was computed but deliberately
 * withheld because the tracker had no opinion to assert. The sync module's
 * stated convention is that a withheld action lands somewhere, never nowhere
 * — without this, an operator debugging "why did my GitHub unassign not take
 * effect" gets silence.
 */
export interface SuppressedInbound {
  /** Roadmap feature name whose local field was kept */
  feature: string;
  /** Which local field the inbound write would have touched */
  field: 'assignee' | 'status';
  /** Local value that was kept */
  from: string | null;
  /** Value the tracker would have written */
  to: string | null;
  /** Why the write was withheld */
  reason: string;
}

/**
 * Result of a sync operation. Collects successes and errors per-feature.
 */
export interface SyncResult {
  /** Tickets created during this sync */
  created: ExternalTicket[];
  /** External IDs of tickets that were updated */
  updated: string[];
  /** Assignment changes detected during pull */
  assignmentChanges: Array<{ feature: string; from: string | null; to: string | null }>;
  /** Per-feature errors (sync never throws) */
  errors: Array<{ featureOrId: string; error: Error }>;
  /** True when the run issued zero write requests (dry run) */
  dryRun: boolean;
  /** Changes a dry run computed but did not perform */
  planned: PlannedSyncChanges;
  /** Creates withheld (by `allowCreate: false` or by dry run) */
  skippedCreates: SkippedCreate[];
  /** Issue state transitions withheld by `syncIssueState: false` */
  skippedStateChanges: SkippedStateChange[];
  /** Inbound writes withheld because the tracker had no opinion (see applyTicketToFeature) */
  suppressedInbound: SuppressedInbound[];
  /** What the run actually examined — the denominator behind every count above */
  examined: SyncDenominator;
}

/**
 * Result of a **row-scoped** push (one roadmap row), which additionally reports
 * the field that actually decides whether the row is linked.
 *
 * `created` / `updated` cannot answer that question: a row that dedup-links to
 * an existing ticket has its `externalId` stamped and written to disk even when
 * the follow-up patch fails, leaving both arrays empty while the row IS linked.
 * Classifying on those arrays therefore reports "unlinked" for a row that is
 * linked on disk. `externalId` is the post-push value of `feature.externalId` —
 * correct on the create path, the dedup path, and the already-linked path alike.
 *
 * Distinguishing "the tracker linked it but disk did not record it" from a
 * tracker-side error: a **writeback** failure is reported under the `'*'`
 * envelope in {@link SyncResult.errors} (the same convention `fullSync` uses),
 * while every tracker-side error is keyed by feature name or external id.
 */
export interface RowSyncResult extends SyncResult {
  /** The row's `externalId` after the push, or null when it is still unlinked. */
  externalId: string | null;
}

/**
 * Configuration for external tracker sync.
 */
export interface TrackerSyncConfig {
  /** Adapter kind -- narrowed to GitHub-only for now */
  kind: 'github';
  /** Repository in "owner/repo" format (for GitHub) */
  repo?: string;
  /** Labels auto-applied to created tickets for filtering + identification */
  labels?: string[];
  /** Maps roadmap status -> external status string */
  statusMap: Record<FeatureStatus, string>;
  /**
   * Maps external status (+ optional label) -> roadmap status.
   * Compound keys like "open:in-progress" express state + label.
   * Optional — when absent, syncFromExternal preserves current roadmap status.
   */
  reverseStatusMap?: Record<string, FeatureStatus>;
}

/**
 * A comment on an external tracker ticket.
 * Used by fetchComments to return raw comment data for analysis sync.
 */
export interface TrackerComment {
  /** Tracker-native comment ID */
  id: string;
  /** Raw markdown body of the comment */
  body: string;
  /** ISO timestamp when the comment was created */
  createdAt: string;
  /** Author who posted the comment */
  author: string;
  /** ISO timestamp when the comment was last updated, or null if tracker does not support it */
  updatedAt: string | null;
}
