import type {
  RoadmapFeature,
  Result,
  ExternalTicket,
  ExternalTicketState,
  TrackerSyncConfig,
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

/**
 * Resolve an external ticket's status + labels to a roadmap FeatureStatus
 * using the reverseStatusMap config. Returns null if ambiguous or unmapped.
 * Adapter-agnostic — operates on config data, not adapter-specific state.
 */
export function resolveReverseStatus(
  externalStatus: string,
  labels: string[],
  config: TrackerSyncConfig
): string | null {
  // Direct match first (e.g., "closed" -> "done")
  if (config.reverseStatusMap[externalStatus]) {
    return config.reverseStatusMap[externalStatus]!;
  }

  // Compound key match: "open:label"
  const statusLabels = ['in-progress', 'blocked', 'planned'];
  const matchingLabels = labels.filter((l) => statusLabels.includes(l));

  if (matchingLabels.length === 1) {
    const compoundKey = `${externalStatus}:${matchingLabels[0]}`;
    if (config.reverseStatusMap[compoundKey]) {
      return config.reverseStatusMap[compoundKey]!;
    }
  }

  // Ambiguous (multiple status labels) or no match -> null (preserve current)
  return null;
}
