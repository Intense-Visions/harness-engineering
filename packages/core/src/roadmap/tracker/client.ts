/**
 * Phase 2 wide tracker interface (file-less roadmap mode).
 * See docs/changes/roadmap-tracker-only/proposal.md §"IssueTrackerClient interface".
 *
 * Named `RoadmapTrackerClient` (not `IssueTrackerClient`) to avoid colliding
 * with the small interface lifted in Phase 1 (decision D-P2-A).
 */
import type { Result, FeatureStatus, Priority } from '@harness-engineering/types';

export interface TrackedFeature {
  externalId: string; // "github:owner/repo#42"
  name: string;
  status: FeatureStatus;
  summary: string;
  spec: string | null;
  plans: string[];
  /**
   * Feature **names** (NOT externalIds) authored in the body-meta `blocked_by:`
   * field. The body-meta block is the canonical source for blockers per spec
   * §"Body metadata block" — the adapter reads the names verbatim and writes
   * them verbatim. Translation to externalIds (when needed) is a caller concern.
   */
  blockedBy: string[];
  assignee: string | null;
  priority: Priority | null;
  milestone: string | null;
  createdAt: string;
  updatedAt: string | null;
}

export interface NewFeatureInput {
  name: string;
  summary: string;
  status?: FeatureStatus;
  spec?: string | null;
  plans?: string[];
  blockedBy?: string[];
  priority?: Priority | null;
  milestone?: string | null;
  assignee?: string | null;
}

export type FeaturePatch = Partial<Omit<TrackedFeature, 'externalId' | 'createdAt' | 'updatedAt'>>;

export type HistoryEventType =
  | 'created'
  | 'claimed'
  | 'released'
  | 'completed'
  | 'updated'
  | 'reopened';

export interface HistoryEvent {
  type: HistoryEventType;
  actor: string;
  at: string; // ISO timestamp
  details?: Record<string, unknown>;
}

/**
 * ConflictError signals that a write would clobber an external change.
 * Synthesized via refetch-and-compare on writes (D-P2-B); GitHub REST does
 * not natively return 412 on issue PATCH.
 *
 * `serverUpdatedAt` carries the server-side `updatedAt` from the refetched
 * state when available (null when the server omits it or when the adapter
 * cannot determine it). Callers can use this to decide merge-vs-abort by
 * recency (e.g. a recent server change favors abort; a stale one favors
 * merge after a fresh refetch).
 */
export class ConflictError extends Error {
  readonly code = 'TRACKER_CONFLICT' as const;
  readonly externalId: string;
  readonly diff: Record<string, { ours: unknown; theirs: unknown }>;
  readonly serverUpdatedAt: string | null;
  constructor(
    externalId: string,
    diff: Record<string, { ours: unknown; theirs: unknown }>,
    serverUpdatedAt: string | null = null,
    message?: string
  ) {
    super(message ?? `Conflict on ${externalId}: ${Object.keys(diff).join(', ')}`);
    this.name = 'ConflictError';
    this.externalId = externalId;
    this.diff = diff;
    this.serverUpdatedAt = serverUpdatedAt;
  }
}

export interface RoadmapTrackerClient {
  // Reads
  fetchAll(): Promise<Result<{ features: TrackedFeature[]; etag: string | null }, Error>>;
  fetchById(
    externalId: string
  ): Promise<Result<{ feature: TrackedFeature; etag: string } | null, Error>>;
  fetchByStatus(statuses: FeatureStatus[]): Promise<Result<TrackedFeature[], Error>>;

  // Writes (ifMatch is forward-compatible; current GitHub backend uses refetch-and-compare)
  create(feature: NewFeatureInput): Promise<Result<TrackedFeature, Error>>;
  update(
    externalId: string,
    patch: FeaturePatch,
    ifMatch?: string
  ): Promise<Result<TrackedFeature, ConflictError | Error>>;
  claim(
    externalId: string,
    assignee: string,
    ifMatch?: string
  ): Promise<Result<TrackedFeature, ConflictError | Error>>;
  release(
    externalId: string,
    ifMatch?: string
  ): Promise<Result<TrackedFeature, ConflictError | Error>>;
  complete(
    externalId: string,
    ifMatch?: string
  ): Promise<Result<TrackedFeature, ConflictError | Error>>;

  // History
  appendHistory(externalId: string, event: HistoryEvent): Promise<Result<void, Error>>;
  fetchHistory(externalId: string, limit?: number): Promise<Result<HistoryEvent[], Error>>;
}
