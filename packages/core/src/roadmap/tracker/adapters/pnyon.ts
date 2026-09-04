/**
 * Pnyon (Waypoint) tracker adapter — implements {@link RoadmapTrackerClient}
 * over the Waypoint roadmap-provider HTTP API (pnyon ADR-0047: a hosted,
 * event-sourced SDLC ledger; harness consumes it through this existing seam).
 *
 * ⚠️ CONTRACT-FIRST: the Waypoint service ships later in pnyon; the typed
 * contract lives in `./waypoint-http.ts` and the behavior here is proven
 * against an in-memory mock of that contract (spec assumption A1).
 *
 * Mapping decisions:
 *  - `externalId` is `pnyon:<item-ULID>` (dual-key identity: the ULID is the
 *    stable half; slugs are a Waypoint-side concern).
 *  - Claims are ledger events, not field writes: `claim` → `sdlc.claim.opened.v1`,
 *    `release` → `sdlc.claim.released.v1`, `complete` → `sdlc.intent.closed.v1`,
 *    `update` → `sdlc.intent.updated.v1`. Every command carries an
 *    event-version precondition; a stale version is rejected server-side and
 *    surfaced as {@link ConflictError} code `TRACKER_CONFLICT` — the same
 *    contract consumers handle today. First-claim-wins CAS is preserved.
 *  - `appendHistory`/`fetchHistory` ride the item's **evidence ledger**
 *    (durable, ordered) instead of tracker-comment scraping.
 *  - The single-item ETag doubles as the event version, so the interface's
 *    `ifMatch` is the precondition value verbatim.
 *  - **Zero GitHub writes** (harness #640): this module performs no GitHub
 *    API calls of any kind and never pushes machine actors to GitHub's
 *    assignee field. In pnyon mode the GitHub projection (issues, labels,
 *    the human-reserved assignee field) is Waypoint-side scope, downstream
 *    of the ledger — never this adapter's.
 */
import type { Result, FeatureStatus } from '@harness-engineering/types';
import { Ok, Err } from '@harness-engineering/types';
import type {
  RoadmapTrackerClient,
  TrackedFeature,
  NewFeatureInput,
  FeaturePatch,
  HistoryEvent,
  HistoryEventType,
} from '../client';
import { ConflictError } from '../client';
import { refetchAndCompare } from '../conflict';
import { ETagStore } from '../etag-store';
import {
  WaypointHttp,
  WaypointHttpError,
  type WaypointCommand,
  type WaypointItem,
  type WaypointItemPatch,
} from './waypoint-http';

const EXTERNAL_PREFIX = 'pnyon:';

const HISTORY_EVENT_TYPES: ReadonlySet<string> = new Set([
  'created',
  'claimed',
  'released',
  'completed',
  'updated',
  'reopened',
]);

export interface PnyonTrackerOptions {
  /** Waypoint per-Outpost API base URL. */
  url: string;
  /** Bearer credential (resolved upstream: config token or PNYON_TOKEN env). */
  token: string;
  fetchFn?: typeof fetch;
  etagStore?: ETagStore;
}

/**
 * Factory-facing config for `roadmap.tracker.kind: "pnyon"`. Declared here
 * (not in factory.ts) so the registry can reference it without an import
 * cycle: factory → registry → this module → client.
 */
export interface PnyonTrackerClientConfig {
  kind: 'pnyon';
  /** Waypoint per-Outpost API base URL. */
  url: string;
  /** Bearer credential; falls back to the PNYON_TOKEN env var. */
  token?: string;
  etagStore?: ETagStore;
}

function featureFromItem(item: WaypointItem): TrackedFeature {
  return {
    externalId: `${EXTERNAL_PREFIX}${item.id}`,
    name: item.name,
    status: item.status,
    summary: item.summary,
    spec: item.spec,
    plans: item.plans,
    blockedBy: item.blockedBy,
    assignee: item.assignee,
    priority: item.priority,
    milestone: item.milestone,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

function patchToWaypoint(patch: FeaturePatch): WaypointItemPatch {
  const out: WaypointItemPatch = {};
  if (patch.name !== undefined) out.name = patch.name;
  if (patch.summary !== undefined) out.summary = patch.summary;
  if (patch.status !== undefined) out.status = patch.status;
  if (patch.spec !== undefined) out.spec = patch.spec;
  if (patch.plans !== undefined) out.plans = patch.plans;
  if (patch.blockedBy !== undefined) out.blockedBy = patch.blockedBy;
  if (patch.priority !== undefined) out.priority = patch.priority;
  if (patch.milestone !== undefined) out.milestone = patch.milestone;
  if (patch.assignee !== undefined) out.assignee = patch.assignee;
  return out;
}

function asError(err: unknown): Error {
  if (err instanceof Error) return err;
  return new Error(String(err));
}

export class PnyonTrackerAdapter implements RoadmapTrackerClient {
  private readonly http: WaypointHttp;
  private readonly cache: ETagStore;

  constructor(opts: PnyonTrackerOptions) {
    const httpOpts: ConstructorParameters<typeof WaypointHttp>[0] = {
      url: opts.url,
      token: opts.token,
    };
    if (opts.fetchFn !== undefined) httpOpts.fetchFn = opts.fetchFn;
    this.http = new WaypointHttp(httpOpts);
    this.cache = opts.etagStore ?? new ETagStore(500);
  }

  private toItemId(externalId: string): string {
    return externalId.startsWith(EXTERNAL_PREFIX)
      ? externalId.slice(EXTERNAL_PREFIX.length)
      : externalId;
  }

  // ── Reads ──────────────────────────────────────────────────────────────

  async fetchAll(): Promise<Result<{ features: TrackedFeature[]; etag: string | null }, Error>> {
    try {
      const cached = this.cache.get('list:all');
      const r = await this.http.listItems(undefined, cached?.etag);
      if (r.notModified) {
        const items = (cached!.data as WaypointItem[]) ?? [];
        return Ok({ features: items.map(featureFromItem), etag: cached!.etag });
      }
      if (r.etag) this.cache.set('list:all', r.etag, r.value);
      return Ok({ features: r.value.map(featureFromItem), etag: r.etag });
    } catch (err) {
      return Err(asError(err));
    }
  }

  async fetchById(
    externalId: string
  ): Promise<Result<{ feature: TrackedFeature; etag: string } | null, Error>> {
    try {
      const item = await this.getItemCached(externalId);
      if (!item) return Ok(null);
      return Ok({ feature: featureFromItem(item), etag: String(item.version) });
    } catch (err) {
      return Err(asError(err));
    }
  }

  async fetchByStatus(statuses: FeatureStatus[]): Promise<Result<TrackedFeature[], Error>> {
    try {
      const r = await this.http.listItems(statuses);
      if (r.notModified) {
        // Unreachable by contract (no If-None-Match sent); defend anyway.
        return Err(new Error('Waypoint returned 304 to an unconditional list'));
      }
      return Ok(r.value.map(featureFromItem));
    } catch (err) {
      return Err(asError(err));
    }
  }

  /** Conditional single-item GET through the ETag cache (`feature:<externalId>`). */
  private async getItemCached(externalId: string): Promise<WaypointItem | null> {
    const key = `feature:${externalId}`;
    const cached = this.cache.get(key);
    const r = await this.http.getItem(this.toItemId(externalId), cached?.etag);
    if (r.notModified) return cached!.data as WaypointItem;
    if (r.value === null) {
      this.cache.invalidate(key);
      return null;
    }
    if (r.etag) this.cache.set(key, r.etag, r.value);
    return r.value;
  }

  // ── Writes (event commands with version preconditions) ─────────────────

  async create(feature: NewFeatureInput): Promise<Result<TrackedFeature, Error>> {
    try {
      const item = await this.http.createItem({
        name: feature.name,
        summary: feature.summary,
        ...(feature.status !== undefined ? { status: feature.status } : {}),
        ...(feature.spec !== undefined ? { spec: feature.spec } : {}),
        ...(feature.plans !== undefined ? { plans: feature.plans } : {}),
        ...(feature.blockedBy !== undefined ? { blockedBy: feature.blockedBy } : {}),
        ...(feature.priority !== undefined ? { priority: feature.priority } : {}),
        ...(feature.milestone !== undefined ? { milestone: feature.milestone } : {}),
        ...(feature.assignee !== undefined ? { assignee: feature.assignee } : {}),
      });
      this.cache.invalidatePrefix('list:');
      return Ok(featureFromItem(item));
    } catch (err) {
      return Err(asError(err));
    }
  }

  async update(
    externalId: string,
    patch: FeaturePatch,
    ifMatch?: string
  ): Promise<Result<TrackedFeature, ConflictError | Error>> {
    return this.command(
      externalId,
      { type: 'sdlc.intent.updated.v1', patch: patchToWaypoint(patch) },
      patch,
      ifMatch
    );
  }

  async claim(
    externalId: string,
    assignee: string,
    ifMatch?: string
  ): Promise<Result<TrackedFeature, ConflictError | Error>> {
    return this.command(
      externalId,
      { type: 'sdlc.claim.opened.v1', actor: assignee },
      { assignee, status: 'in-progress' },
      ifMatch
    );
  }

  async release(
    externalId: string,
    ifMatch?: string
  ): Promise<Result<TrackedFeature, ConflictError | Error>> {
    return this.command(
      externalId,
      { type: 'sdlc.claim.released.v1' },
      { assignee: null },
      ifMatch
    );
  }

  async complete(
    externalId: string,
    ifMatch?: string
  ): Promise<Result<TrackedFeature, ConflictError | Error>> {
    return this.command(externalId, { type: 'sdlc.intent.closed.v1' }, { status: 'done' }, ifMatch);
  }

  /**
   * Shared command path. `intent` is the patch-equivalent of the command,
   * used only to shape the TRACKER_CONFLICT diff on rejection (via the shared
   * `refetchAndCompare` policy — same rules as the GitHub adapter).
   *
   * Version precondition: `ifMatch` (the interface etag = event version) when
   * given; otherwise the item's current version is read first. Either way the
   * SERVER enforces the precondition, so the read-modify-write race is closed
   * — the losing writer gets a 409, never a silent overwrite, and exactly one
   * event lands for the winner (never a destructive retry).
   */
  private async command(
    externalId: string,
    command: Omit<WaypointCommand, 'expectedVersion'>,
    intent: FeaturePatch,
    ifMatch?: string
  ): Promise<Result<TrackedFeature, ConflictError | Error>> {
    try {
      const versionR = await this.resolveExpectedVersion(externalId, ifMatch);
      if (!versionR.ok) return versionR;
      const r = await this.http.postCommand(this.toItemId(externalId), {
        ...command,
        expectedVersion: versionR.value,
      });
      if (r.outcome === 'version_conflict') {
        const server = featureFromItem(r.current);
        const compare = refetchAndCompare(server, intent);
        if (compare.ok && compare.idempotent) {
          // The server already holds exactly the state this command intended
          // (e.g. our earlier attempt landed). Not a conflict; no retry.
          this.invalidateWrite(externalId);
          return Ok(server);
        }
        return Err(
          new ConflictError(
            externalId,
            compare.diff ?? {
              version: { ours: versionR.value, theirs: r.currentVersion },
            },
            server.updatedAt
          )
        );
      }
      this.invalidateWrite(externalId);
      const feature = featureFromItem(r.item);
      this.cache.set(`feature:${externalId}`, String(r.item.version), r.item);
      return Ok(feature);
    } catch (err) {
      return Err(asError(err));
    }
  }

  private async resolveExpectedVersion(
    externalId: string,
    ifMatch?: string
  ): Promise<Result<number, Error>> {
    if (ifMatch !== undefined) {
      const v = Number.parseInt(ifMatch, 10);
      if (Number.isNaN(v)) {
        return Err(new Error(`pnyon tracker: ifMatch is not an event version: "${ifMatch}"`));
      }
      return Ok(v);
    }
    const item = await this.getItemCached(externalId);
    if (!item) return Err(new Error(`pnyon tracker: item not found: ${externalId}`));
    return Ok(item.version);
  }

  private invalidateWrite(externalId: string): void {
    this.cache.invalidate(`feature:${externalId}`);
    this.cache.invalidatePrefix('list:');
  }

  // ── History (evidence ledger) ──────────────────────────────────────────

  async appendHistory(externalId: string, event: HistoryEvent): Promise<Result<void, Error>> {
    try {
      await this.http.appendEvidence(this.toItemId(externalId), {
        type: event.type,
        actor: event.actor,
        at: event.at,
        ...(event.details !== undefined ? { details: event.details } : {}),
      });
      return Ok(undefined);
    } catch (err) {
      return Err(asError(err));
    }
  }

  async fetchHistory(externalId: string, limit?: number): Promise<Result<HistoryEvent[], Error>> {
    try {
      const entries = await this.http.listEvidence(this.toItemId(externalId), limit);
      const events: HistoryEvent[] = [];
      for (const e of entries) {
        // The ledger may carry richer Waypoint evidence types; harness's
        // history view keeps only the interface's event vocabulary.
        if (!HISTORY_EVENT_TYPES.has(e.type)) continue;
        events.push({
          type: e.type as HistoryEventType,
          actor: e.actor,
          at: e.at,
          ...(e.details !== undefined ? { details: e.details } : {}),
        });
      }
      return Ok(typeof limit === 'number' ? events.slice(0, limit) : events);
    } catch (err) {
      return Err(asError(err));
    }
  }
}

export { WaypointHttpError };
