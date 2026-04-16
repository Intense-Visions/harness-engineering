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
  /** External labels (used for status disambiguation on GitHub) */
  labels: string[];
  /** Current assignee in the external service, or null */
  assignee: string | null;
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
