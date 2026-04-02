import type {
  RoadmapFeature,
  Result,
  ExternalTicket,
  ExternalTicketState,
} from '@harness-engineering/types';

/**
 * Abstract interface for syncing roadmap features with an external tracker.
 * Each adapter (GitHub, Jira, Linear) implements this interface.
 */
export interface TrackerSyncAdapter {
  /** Push a new roadmap item to the external service */
  createTicket(feature: RoadmapFeature, milestone: string): Promise<Result<ExternalTicket>>;

  /** Update planning fields on an existing ticket */
  updateTicket(
    externalId: string,
    changes: Partial<RoadmapFeature>
  ): Promise<Result<ExternalTicket>>;

  /** Pull current assignment + status from external service */
  fetchTicketState(externalId: string): Promise<Result<ExternalTicketState>>;

  /** Fetch all tickets matching the configured labels (paginated) */
  fetchAllTickets(): Promise<Result<ExternalTicketState[]>>;

  /** Assign a ticket to a person */
  assignTicket(externalId: string, assignee: string): Promise<Result<void>>;
}

/**
 * Options for sync operations that pull from external.
 * Named ExternalSyncOptions to avoid collision with the existing SyncOptions in sync.ts.
 */
export interface ExternalSyncOptions {
  /** Allow status regressions (e.g., done -> in-progress). Default: false */
  forceSync?: boolean;
}
