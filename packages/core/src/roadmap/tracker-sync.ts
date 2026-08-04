import type {
  RoadmapFeature,
  Result,
  ExternalTicket,
  ExternalTicketState,
  TrackerSyncConfig,
  TrackerComment,
} from '@harness-engineering/types';

/**
 * Abstract interface for syncing roadmap features with an external tracker.
 * Each adapter (GitHub, Jira, Linear) implements this interface.
 */
/**
 * Per-write policy handed to an adapter by the sync engine.
 *
 * Adapters must honour these as a hard floor, independent of whatever the
 * caller decided: the engine also refuses to call a write at all in dry run,
 * so a guard has to fail in two places to become destructive.
 */
export interface TicketWriteOptions {
  /**
   * Whether the adapter may patch the ticket's open/closed state.
   * When `false` the adapter MUST omit the state field from the patch body
   * entirely — labels still sync, but no issue is ever closed or reopened.
   * Default (`undefined`) preserves the pre-existing behaviour: state is patched.
   */
  syncIssueState?: boolean;
}

export interface TrackerSyncAdapter {
  /** Push a new roadmap item to the external service */
  createTicket(feature: RoadmapFeature, milestone: string): Promise<Result<ExternalTicket>>;

  /**
   * Update planning fields on an existing ticket.
   * `options` is additive — an adapter that ignores it keeps its previous
   * behaviour, so the engine's own dry-run/allowCreate guards remain the
   * authoritative safety layer.
   */
  updateTicket(
    externalId: string,
    changes: Partial<RoadmapFeature>,
    milestone?: string,
    options?: TicketWriteOptions
  ): Promise<Result<ExternalTicket>>;

  /** Pull current assignment + status from external service */
  fetchTicketState(externalId: string): Promise<Result<ExternalTicketState>>;

  /** Fetch all tickets matching the configured labels (paginated) */
  fetchAllTickets(): Promise<Result<ExternalTicketState[]>>;

  /** Assign a ticket to a person */
  assignTicket(externalId: string, assignee: string): Promise<Result<void>>;

  /** Post a markdown comment to the external ticket */
  addComment(externalId: string, markdownBody: string): Promise<Result<void>>;

  /** Fetch all comments on an external ticket */
  fetchComments(externalId: string): Promise<Result<TrackerComment[]>>;
}

/**
 * Options for sync operations that pull from external.
 * Named ExternalSyncOptions to avoid collision with the existing SyncOptions in sync.ts.
 */
export interface ExternalSyncOptions {
  /** Allow status regressions (e.g., done -> in-progress). Default: false */
  forceSync?: boolean;
  /**
   * Compute and report every intended change while performing ZERO write
   * requests — no ticket create, no ticket patch, no roadmap writeback.
   * Default: false (writes are performed).
   */
  dryRun?: boolean;
  /**
   * Whether rows lacking an externalId may have a ticket created for them.
   * When `false`, each such row is reported in `skippedCreates` rather than
   * silently dropped — an unattended job must not invent issues.
   * Default: true (pre-existing behaviour).
   */
  allowCreate?: boolean;
  /**
   * Whether a status push may change the ticket's open/closed state.
   * When `false`, labels still sync but no issue is ever closed or reopened;
   * every suppressed transition is reported in `skippedStateChanges`.
   * Default: true (pre-existing behaviour).
   */
  syncIssueState?: boolean;
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
  const reverseMap = config.reverseStatusMap;
  if (!reverseMap) return null;

  // Direct match first (e.g., "closed" -> "done")
  if (reverseMap[externalStatus]) {
    return reverseMap[externalStatus]!;
  }

  // Compound key match: "open:label"
  const statusLabels = ['in-progress', 'blocked', 'planned', 'needs-human'];
  const matchingLabels = labels.filter((l) => statusLabels.includes(l));

  if (matchingLabels.length === 1) {
    const compoundKey = `${externalStatus}:${matchingLabels[0]}`;
    if (reverseMap[compoundKey]) {
      return reverseMap[compoundKey]!;
    }
  }

  // Ambiguous (multiple status labels) or no match -> null (preserve current)
  return null;
}
