/**
 * Typed client for the Waypoint roadmap-provider HTTP API — the documented
 * contract the pnyon-hosted Waypoint service must satisfy (pnyon ADR-0047).
 *
 * ⚠️ CONTRACT-FIRST: no live Waypoint service exists yet (assumption A1 in
 * the spec). This module IS the normative API contract; the pnyon-side
 * service is built against it, and the contract tests exercise it through an
 * in-memory mock transport. See
 * `docs/changes/waypoint-tracker-kind-pnyon/proposal.md` §"Waypoint HTTP API
 * contract".
 *
 * Surface (base URL = per-Outpost API root, auth = `Bearer <token>`):
 *
 *   GET  /v1/items                    — list (supports ?status=a,b + If-None-Match/ETag/304)
 *   GET  /v1/items/{id}               — read one (404 → null; If-None-Match/ETag/304)
 *   POST /v1/items                    — create (appends sdlc.intent.created.v1)
 *   POST /v1/items/{id}/commands      — mutate via event command; 409 on stale expectedVersion
 *   POST /v1/items/{id}/evidence      — append one evidence-ledger entry
 *   GET  /v1/items/{id}/evidence      — read the ledger (ordered oldest→newest; ?limit=N)
 *
 * Concurrency model: every item carries a monotonically increasing event
 * `version`; commands carry `expectedVersion` and the server appends NOTHING
 * on a mismatch, returning 409 with the current item. The single-item HTTP
 * `ETag` is the stringified version, so the tracker interface's `ifMatch`
 * doubles as the precondition value.
 */
import type { FeatureStatus, Priority } from '@harness-engineering/types';

/** Canonical item shape served by the Waypoint read API (harness projection). */
export interface WaypointItem {
  /** ULID — stable identity; externalId is `pnyon:<id>`. */
  id: string;
  name: string;
  /**
   * Harness six-status projection of Waypoint's lane reducer (assumption A2:
   * the mapping is server-side; `blocked`/`needs-human` arrive as statuses).
   */
  status: FeatureStatus;
  summary: string;
  spec: string | null;
  plans: string[];
  blockedBy: string[];
  /** Current claim holder (opaque principal string), or null when unclaimed. */
  assignee: string | null;
  priority: Priority | null;
  milestone: string | null;
  createdAt: string;
  updatedAt: string | null;
  /** Event version — increments once per ledger event appended to the item. */
  version: number;
}

/** Fields accepted when creating an item (sdlc.intent.created.v1). */
export interface WaypointNewItem {
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

/** Patchable fields for an `sdlc.intent.updated.v1` command. */
export interface WaypointItemPatch {
  name?: string;
  summary?: string;
  status?: FeatureStatus;
  spec?: string | null;
  plans?: string[];
  blockedBy?: string[];
  priority?: Priority | null;
  milestone?: string | null;
  assignee?: string | null;
}

/**
 * Command envelope for POST /v1/items/{id}/commands. `type` follows the
 * pinned `sdlc.*.v1` vocabulary (pnyon sdlc-event-schema):
 *  - update   → sdlc.intent.updated.v1  (carries `patch`)
 *  - claim    → sdlc.claim.opened.v1    (carries `actor`)
 *  - release  → sdlc.claim.released.v1
 *  - complete → sdlc.intent.closed.v1
 *
 * Actor duality (`agent onBehalfOf human`) is resolved server-side from the
 * authenticated token (assumption A3); `actor` is an opaque principal string.
 */
export interface WaypointCommand {
  type:
    | 'sdlc.intent.updated.v1'
    | 'sdlc.claim.opened.v1'
    | 'sdlc.claim.released.v1'
    | 'sdlc.intent.closed.v1';
  /** Event-version precondition — the command applies only at this version. */
  expectedVersion: number;
  patch?: WaypointItemPatch;
  actor?: string;
}

/** One evidence-ledger entry (harness HistoryEvent projection). */
export interface WaypointEvidenceEntry {
  type: string;
  actor: string;
  at: string;
  details?: Record<string, unknown>;
}

/** Result of a command post: applied, or rejected by the version precondition. */
export type WaypointCommandResult =
  | { outcome: 'applied'; item: WaypointItem }
  | { outcome: 'version_conflict'; currentVersion: number; current: WaypointItem };

/** Result of a conditional GET: fresh body, or 304 not-modified. */
export type WaypointConditionalResult<T> =
  | { notModified: false; value: T; etag: string | null }
  | { notModified: true };

/** Structured error for non-contract responses (network, 5xx, auth, shape). */
export class WaypointHttpError extends Error {
  readonly status: number | null;
  readonly url: string;
  constructor(message: string, url: string, status: number | null = null) {
    super(message);
    this.name = 'WaypointHttpError';
    this.status = status;
    this.url = url;
  }
}

export interface WaypointHttpOptions {
  /** Per-Outpost API base URL (e.g. https://waypoint.pnyon.com/o/<outpost>). */
  url: string;
  /** Bearer credential (config token or PNYON_TOKEN env, resolved upstream). */
  token: string;
  fetchFn?: typeof fetch;
}

export class WaypointHttp {
  private readonly base: string;
  private readonly token: string;
  private readonly fetchFn: typeof fetch;

  constructor(opts: WaypointHttpOptions) {
    this.base = opts.url.replace(/\/+$/, '');
    this.token = opts.token;
    this.fetchFn = opts.fetchFn ?? globalThis.fetch;
  }

  private headers(extra?: Record<string, string>): Record<string, string> {
    return {
      Authorization: `Bearer ${this.token}`,
      'Content-Type': 'application/json',
      ...extra,
    };
  }

  private async request(
    method: 'GET' | 'POST',
    path: string,
    init?: { body?: unknown; ifNoneMatch?: string }
  ): Promise<Response> {
    const url = `${this.base}${path}`;
    const headers = this.headers(
      init?.ifNoneMatch !== undefined ? { 'If-None-Match': init.ifNoneMatch } : undefined
    );
    let res: Response;
    try {
      res = await this.fetchFn(url, {
        method,
        headers,
        ...(init?.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
      });
    } catch (err) {
      throw new WaypointHttpError(
        `Waypoint request failed: ${err instanceof Error ? err.message : String(err)}`,
        url
      );
    }
    return res;
  }

  private async fail(res: Response, url: string): Promise<never> {
    const body = await res.text().catch(() => '');
    throw new WaypointHttpError(
      `Waypoint HTTP ${res.status}${body ? `: ${body.slice(0, 300)}` : ''}`,
      url,
      res.status
    );
  }

  /** GET /v1/items — optionally filtered by status, conditional on ETag. */
  async listItems(
    statuses?: FeatureStatus[],
    ifNoneMatch?: string
  ): Promise<WaypointConditionalResult<WaypointItem[]>> {
    const qs = statuses && statuses.length > 0 ? `?status=${statuses.join(',')}` : '';
    const path = `/v1/items${qs}`;
    const res = await this.request('GET', path, {
      ...(ifNoneMatch !== undefined ? { ifNoneMatch } : {}),
    });
    if (res.status === 304) return { notModified: true };
    if (!res.ok) return this.fail(res, `${this.base}${path}`);
    const json = (await res.json()) as { items?: WaypointItem[] };
    return {
      notModified: false,
      value: json.items ?? [],
      etag: res.headers.get('etag'),
    };
  }

  /** GET /v1/items/{id} — null on 404, conditional on ETag. */
  async getItem(
    id: string,
    ifNoneMatch?: string
  ): Promise<WaypointConditionalResult<WaypointItem | null>> {
    const path = `/v1/items/${encodeURIComponent(id)}`;
    const res = await this.request('GET', path, {
      ...(ifNoneMatch !== undefined ? { ifNoneMatch } : {}),
    });
    if (res.status === 304) return { notModified: true };
    if (res.status === 404) return { notModified: false, value: null, etag: null };
    if (!res.ok) return this.fail(res, `${this.base}${path}`);
    const json = (await res.json()) as { item?: WaypointItem };
    if (!json.item) {
      throw new WaypointHttpError('Waypoint item response missing "item"', path, res.status);
    }
    return { notModified: false, value: json.item, etag: res.headers.get('etag') };
  }

  /** POST /v1/items — create (appends sdlc.intent.created.v1). */
  async createItem(input: WaypointNewItem): Promise<WaypointItem> {
    const path = '/v1/items';
    const res = await this.request('POST', path, { body: input });
    if (!res.ok) return this.fail(res, `${this.base}${path}`);
    const json = (await res.json()) as { item?: WaypointItem };
    if (!json.item) {
      throw new WaypointHttpError('Waypoint create response missing "item"', path, res.status);
    }
    return json.item;
  }

  /**
   * POST /v1/items/{id}/commands — apply a mutation command.
   * A 409 (stale expectedVersion, or claim held by a different assignee) is a
   * CONTRACT outcome, not an error: it returns the server's current item so
   * the caller can synthesize the TRACKER_CONFLICT diff without a second GET.
   */
  async postCommand(id: string, command: WaypointCommand): Promise<WaypointCommandResult> {
    const path = `/v1/items/${encodeURIComponent(id)}/commands`;
    const res = await this.request('POST', path, { body: command });
    if (res.status === 409) {
      const json = (await res.json()) as { currentVersion?: number; current?: WaypointItem };
      if (!json.current || typeof json.currentVersion !== 'number') {
        throw new WaypointHttpError(
          'Waypoint 409 response missing "current"/"currentVersion"',
          path,
          409
        );
      }
      return {
        outcome: 'version_conflict',
        currentVersion: json.currentVersion,
        current: json.current,
      };
    }
    if (!res.ok) return this.fail(res, `${this.base}${path}`);
    const json = (await res.json()) as { item?: WaypointItem };
    if (!json.item) {
      throw new WaypointHttpError('Waypoint command response missing "item"', path, res.status);
    }
    return { outcome: 'applied', item: json.item };
  }

  /** POST /v1/items/{id}/evidence — append one ledger entry. */
  async appendEvidence(id: string, entry: WaypointEvidenceEntry): Promise<void> {
    const path = `/v1/items/${encodeURIComponent(id)}/evidence`;
    const res = await this.request('POST', path, { body: entry });
    if (!res.ok) return this.fail(res, `${this.base}${path}`);
  }

  /** GET /v1/items/{id}/evidence — ordered oldest→newest. */
  async listEvidence(id: string, limit?: number): Promise<WaypointEvidenceEntry[]> {
    const qs = typeof limit === 'number' ? `?limit=${limit}` : '';
    const path = `/v1/items/${encodeURIComponent(id)}/evidence${qs}`;
    const res = await this.request('GET', path, {});
    if (!res.ok) return this.fail(res, `${this.base}${path}`);
    const json = (await res.json()) as { events?: WaypointEvidenceEntry[] };
    return json.events ?? [];
  }
}
