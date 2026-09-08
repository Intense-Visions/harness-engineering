/**
 * `TrackerSyncAdapter` over a Waypoint (pnyon) event ledger — the second half
 * of #1863 (`docs/changes/pnyon-tracker-sync-adapter/proposal.md`).
 *
 * There are two adapter families in this codebase and they are not
 * interchangeable: `RoadmapTrackerClient` (items and evidence) backs the
 * file-less roadmap seam, while `TrackerSyncAdapter` (tickets and comments)
 * backs `roadmap sync` and `roadmap reconcile`. #1816 implemented the first for
 * Waypoint; sync consumes the second, which is why a `kind: "pnyon"` config was
 * refused. This is the translation between them.
 *
 * It deliberately owns no protocol of its own. Every call delegates to
 * {@link PnyonTrackerAdapter}, which already speaks the Waypoint HTTP API
 * including the versioned command path whose `version_conflict` →
 * refetch-and-compare → idempotent-or-`ConflictError` behaviour gives this
 * adapter its concurrency story for free.
 *
 * Two interface methods are NOT implemented: `fetchTicketState` and
 * `assignTicket` have zero call sites across core and cli, and inventing
 * behaviour for a caller that does not exist would be speculation. They refuse
 * with a message naming the operation and the backend rather than no-oping,
 * because a silent no-op in a sync adapter is a data-loss bug wearing a
 * "limitation" label.
 */
import type {
  ExternalTicket,
  ExternalTicketState,
  RoadmapFeature,
  Result,
  TrackerComment,
} from '@harness-engineering/types';
import { Ok, Err } from '@harness-engineering/types';
import type { TicketWriteOptions, TrackerSyncAdapter } from '../tracker-sync';
import { PnyonTrackerAdapter, waypointItemUrl } from '../tracker/adapters/pnyon';
import type { HistoryEvent } from '../tracker/client';

/** Constructor dependencies. */
export interface PnyonSyncAdapterOptions {
  /** The client adapter this delegates to; supplied by the factory. */
  readonly client: PnyonTrackerAdapter;
  /**
   * The Waypoint API base — the same `url` the tracker config carries.
   *
   * Passed in rather than read off the client because the client keeps it
   * private, and widening its surface just to report a link would be the wrong
   * trade.
   */
  readonly apiBaseUrl: string;
}

/**
 * The refusal for an operation Waypoint does not model.
 *
 * Names the operation AND the backend, so the reader knows both what was asked
 * and why it could not be answered — an "unsupported" with neither is a dead
 * end.
 */
function unsupported<T>(operation: string): Result<T, Error> {
  return Err(
    new Error(
      `${operation} is not supported by the Waypoint (pnyon) tracker backend. ` +
        'It has no call sites in harness today; if you need it, that is a ' +
        'feature request rather than a missing branch.'
    )
  );
}

/** A comment's evidence entry carries its body under `details.body`. */
function bodyOf(event: HistoryEvent): string {
  const body = event.details?.body;
  return typeof body === 'string' ? body : '';
}

/**
 * Waypoint evidence has no comment id, so one is synthesized from the fields
 * that DO identify an entry: its actor and instant. Stable for a given entry,
 * which is what a caller de-duplicating comments needs; not a server-assigned
 * id, which Waypoint does not mint.
 */
function commentIdFor(externalId: string, event: HistoryEvent): string {
  return `${externalId}@${event.at}:${event.actor}`;
}

/** `TrackerSyncAdapter` backed by a Waypoint event ledger. */
export class PnyonSyncAdapter implements TrackerSyncAdapter {
  private readonly client: PnyonTrackerAdapter;
  private readonly apiBaseUrl: string;

  constructor(options: PnyonSyncAdapterOptions) {
    this.client = options.client;
    this.apiBaseUrl = options.apiBaseUrl;
  }

  private ticket(externalId: string): ExternalTicket {
    return { externalId, url: waypointItemUrl(this.apiBaseUrl, externalId) };
  }

  async createTicket(feature: RoadmapFeature, milestone: string): Promise<Result<ExternalTicket>> {
    // Every field is forwarded, nulls included: the client's input type accepts
    // them, and `null` is a real value here ("no assignee") rather than an
    // absence to be filtered out. Dropping any one of these would be silent
    // data loss on create.
    const created = await this.client.create({
      name: feature.name,
      summary: feature.summary,
      status: feature.status,
      spec: feature.spec,
      plans: feature.plans,
      blockedBy: feature.blockedBy,
      assignee: feature.assignee,
      priority: feature.priority,
      milestone,
    });
    return created.ok ? Ok(this.ticket(created.value.externalId)) : Err(created.error);
  }

  /**
   * `options.syncIssueState` is deliberately not consulted. It exists to stop
   * an adapter patching a GitHub issue's open/closed state, which is a second
   * piece of state alongside the roadmap status. Waypoint has no such second
   * state — status IS the item's state — so there is nothing the flag could
   * suppress here, and honouring it would mean refusing to write `status` at
   * all.
   */
  async updateTicket(
    externalId: string,
    changes: Partial<RoadmapFeature>,
    milestone?: string,
    _options?: TicketWriteOptions
  ): Promise<Result<ExternalTicket>> {
    // Here `undefined` DOES mean "leave alone" — `changes` is a partial — so
    // each key is spread only when present. `null` still passes through as an
    // intentional clear.
    const updated = await this.client.update(externalId, {
      ...(changes.name !== undefined ? { name: changes.name } : {}),
      ...(changes.summary !== undefined ? { summary: changes.summary } : {}),
      ...(changes.status !== undefined ? { status: changes.status } : {}),
      ...(changes.spec !== undefined ? { spec: changes.spec } : {}),
      ...(changes.plans !== undefined ? { plans: changes.plans } : {}),
      ...(changes.blockedBy !== undefined ? { blockedBy: changes.blockedBy } : {}),
      ...(changes.assignee !== undefined ? { assignee: changes.assignee } : {}),
      ...(changes.priority !== undefined ? { priority: changes.priority } : {}),
      ...(milestone !== undefined ? { milestone } : {}),
    });
    return updated.ok ? Ok(this.ticket(updated.value.externalId)) : Err(updated.error);
  }

  /** Zero call sites in harness — see the module note. */
  async fetchTicketState(_externalId: string): Promise<Result<ExternalTicketState>> {
    void _externalId;
    return unsupported<ExternalTicketState>('fetchTicketState');
  }

  async fetchAllTickets(): Promise<Result<ExternalTicketState[]>> {
    const all = await this.client.fetchAll();
    if (!all.ok) return Err(all.error);
    return Ok(
      all.value.features.map((feature) => ({
        externalId: feature.externalId,
        title: feature.name,
        // Waypoint carries the roadmap status natively, so there is nothing to
        // translate — which is exactly why its config needs no status map.
        status: feature.status,
        labels: [],
        assignee: feature.assignee,
      }))
    );
  }

  /** Zero call sites in harness — see the module note. */
  async assignTicket(_externalId: string, _assignee: string): Promise<Result<void>> {
    void _externalId;
    void _assignee;
    return unsupported<void>('assignTicket');
  }

  /**
   * A comment is a first-class `commented` evidence entry, not commentary
   * smuggled into an `updated` one. An evidence ledger's whole value is that
   * every entry means what it says; a consumer counting `updated` events must
   * not silently be counting comments too.
   */
  async addComment(externalId: string, markdownBody: string): Promise<Result<void>> {
    return this.client.appendHistory(externalId, {
      type: 'commented',
      actor: 'harness',
      at: new Date().toISOString(),
      details: { body: markdownBody },
    });
  }

  async fetchComments(externalId: string): Promise<Result<TrackerComment[]>> {
    const history = await this.client.fetchHistory(externalId);
    if (!history.ok) return Err(history.error);
    return Ok(
      history.value
        .filter((event) => event.type === 'commented')
        .map((event) => ({
          id: commentIdFor(externalId, event),
          body: bodyOf(event),
          createdAt: event.at,
          author: event.actor,
          // Waypoint evidence is append-only: an entry is never edited, so
          // there is no "updated" instant to report. Null is the honest answer
          // the interface documents for exactly this case.
          updatedAt: null,
        }))
    );
  }
}
