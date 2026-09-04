/**
 * In-memory mock of the Waypoint roadmap-provider HTTP API — the reference
 * implementation of the contract documented in
 * `src/roadmap/tracker/adapters/waypoint-http.ts` (spec:
 * docs/changes/waypoint-tracker-kind-pnyon/proposal.md §"Waypoint HTTP API
 * contract"). Injected into the adapter as a `fetchFn`; zero real network.
 *
 * Behavior implemented (normative):
 *  - GET  /v1/items            — ?status= filter, If-None-Match/ETag/304
 *  - GET  /v1/items/{id}       — 404, If-None-Match (= item version)/304
 *  - POST /v1/items            — create (+ sdlc.intent.created.v1 ledger event)
 *  - POST /v1/items/{id}/commands — expectedVersion precondition → 409
 *    { currentVersion, current }; same-assignee claim is an idempotent no-op
 *    (200, no event appended); different-assignee claim is a 409.
 *  - POST/GET /v1/items/{id}/evidence — ordered evidence ledger.
 *
 * Inspection surface for tests: `sdlcLedger(id)`, `evidence(id)`,
 * `requests` (every URL seen), `fullListResponses`, `fullItemResponses`.
 */
import type {
  WaypointItem,
  WaypointNewItem,
  WaypointCommand,
  WaypointEvidenceEntry,
} from '../../../../src/roadmap/tracker/adapters/waypoint-http';

interface LedgerEvent {
  type: string;
  version: number;
  actor?: string;
}

let ulidCounter = 0;
function nextId(): string {
  ulidCounter += 1;
  return `01MOCKULID${String(ulidCounter).padStart(16, '0')}`;
}

const json = (status: number, body: unknown, headers?: Record<string, string>): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });

export class MockWaypointApi {
  readonly baseUrl: string;
  private readonly items = new Map<string, WaypointItem>();
  private readonly sdlc = new Map<string, LedgerEvent[]>();
  private readonly evidenceLedgers = new Map<string, WaypointEvidenceEntry[]>();
  /** Bumped on every mutation; drives the list ETag. */
  private listRevision = 0;

  /** Every URL this mock served, in order (host-audit surface). */
  readonly requests: string[] = [];
  /** Count of full (non-304) list bodies served. */
  fullListResponses = 0;
  /** Count of full (non-304) single-item bodies served. */
  fullItemResponses = 0;

  constructor(baseUrl = 'https://waypoint.test/o/outpost-1') {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  /** The injectable fetch implementation. */
  readonly fetchFn: typeof fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    this.requests.push(url);
    const method = (init?.method ?? 'GET').toUpperCase();
    const headers = new Headers(init?.headers);
    const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined;

    if (!url.startsWith(this.baseUrl)) return json(404, { error: 'unknown host' });
    const path = url.slice(this.baseUrl.length).split('?')[0]!;
    const query = new URL(url).searchParams;

    if (method === 'GET' && path === '/v1/items') {
      return this.handleList(query, headers.get('if-none-match'));
    }
    if (method === 'POST' && path === '/v1/items') {
      return this.handleCreate(body as WaypointNewItem);
    }
    const itemMatch = /^\/v1\/items\/([^/]+)$/.exec(path);
    if (method === 'GET' && itemMatch) {
      return this.handleGet(itemMatch[1]!, headers.get('if-none-match'));
    }
    const cmdMatch = /^\/v1\/items\/([^/]+)\/commands$/.exec(path);
    if (method === 'POST' && cmdMatch) {
      return this.handleCommand(cmdMatch[1]!, body as WaypointCommand);
    }
    const evMatch = /^\/v1\/items\/([^/]+)\/evidence$/.exec(path);
    if (evMatch && method === 'POST') {
      return this.handleAppendEvidence(evMatch[1]!, body as WaypointEvidenceEntry);
    }
    if (evMatch && method === 'GET') {
      return this.handleListEvidence(evMatch[1]!, query.get('limit'));
    }
    return json(404, { error: `no route: ${method} ${path}` });
  };

  // ── Inspection ──────────────────────────────────────────────────────────

  /** All sdlc.* events appended for an item (the mutation ledger). */
  sdlcLedger(id: string): LedgerEvent[] {
    return this.sdlc.get(this.stripPrefix(id)) ?? [];
  }

  /** The item's evidence ledger (history entries). */
  evidence(id: string): WaypointEvidenceEntry[] {
    return this.evidenceLedgers.get(this.stripPrefix(id)) ?? [];
  }

  item(id: string): WaypointItem | undefined {
    return this.items.get(this.stripPrefix(id));
  }

  /** Seed an item directly (bypassing HTTP), returning it. */
  seed(partial: Partial<WaypointItem> & { name: string }): WaypointItem {
    const id = partial.id ?? nextId();
    const item: WaypointItem = {
      id,
      name: partial.name,
      status: partial.status ?? 'backlog',
      summary: partial.summary ?? '',
      spec: partial.spec ?? null,
      plans: partial.plans ?? [],
      blockedBy: partial.blockedBy ?? [],
      assignee: partial.assignee ?? null,
      priority: partial.priority ?? null,
      milestone: partial.milestone ?? null,
      createdAt: partial.createdAt ?? new Date().toISOString(),
      updatedAt: partial.updatedAt ?? null,
      version: partial.version ?? 1,
    };
    this.items.set(id, item);
    this.sdlc.set(id, [{ type: 'sdlc.intent.created.v1', version: item.version }]);
    this.listRevision += 1;
    return item;
  }

  private stripPrefix(id: string): string {
    return id.startsWith('pnyon:') ? id.slice('pnyon:'.length) : id;
  }

  // ── Routes ──────────────────────────────────────────────────────────────

  private handleList(query: URLSearchParams, ifNoneMatch: string | null): Response {
    const listEtag = `W/"list-${this.listRevision}"`;
    const statusFilter = query.get('status');
    // Only the unfiltered list participates in ETag caching (contract).
    if (!statusFilter && ifNoneMatch === listEtag) return new Response(null, { status: 304 });
    let items = [...this.items.values()];
    if (statusFilter) {
      const wanted = new Set(statusFilter.split(','));
      items = items.filter((i) => wanted.has(i.status));
    }
    this.fullListResponses += 1;
    return json(200, { items }, { ETag: listEtag });
  }

  private handleGet(id: string, ifNoneMatch: string | null): Response {
    const item = this.items.get(id);
    if (!item) return json(404, { error: 'not found' });
    const etag = String(item.version);
    if (ifNoneMatch === etag) return new Response(null, { status: 304 });
    this.fullItemResponses += 1;
    return json(200, { item }, { ETag: etag });
  }

  private handleCreate(input: WaypointNewItem): Response {
    const item = this.seed({
      name: input.name,
      summary: input.summary,
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.spec !== undefined && input.spec !== null ? { spec: input.spec } : {}),
      ...(input.plans !== undefined ? { plans: input.plans } : {}),
      ...(input.blockedBy !== undefined ? { blockedBy: input.blockedBy } : {}),
      ...(input.priority !== undefined && input.priority !== null
        ? { priority: input.priority }
        : {}),
      ...(input.milestone !== undefined && input.milestone !== null
        ? { milestone: input.milestone }
        : {}),
      ...(input.assignee !== undefined && input.assignee !== null
        ? { assignee: input.assignee }
        : {}),
    });
    return json(201, { item }, { ETag: String(item.version) });
  }

  private handleCommand(id: string, command: WaypointCommand): Response {
    const item = this.items.get(id);
    if (!item) return json(404, { error: 'not found' });

    const conflict = (): Response =>
      json(409, { code: 'version_conflict', currentVersion: item.version, current: item });

    if (command.type === 'sdlc.claim.opened.v1') {
      const actor = command.actor ?? '';
      // Idempotent no-op: already claimed by the same assignee — no event.
      if (item.assignee === actor) return json(200, { item }, { ETag: String(item.version) });
      // First-claim-wins: a different current claimant conflicts regardless
      // of the presented version.
      if (item.assignee !== null) return conflict();
      if (command.expectedVersion !== item.version) return conflict();
      return this.apply(item, command.type, { assignee: actor, status: 'in-progress' }, actor);
    }

    if (command.expectedVersion !== item.version) return conflict();

    if (command.type === 'sdlc.claim.released.v1') {
      return this.apply(item, command.type, { assignee: null, status: 'planned' });
    }
    if (command.type === 'sdlc.intent.closed.v1') {
      return this.apply(item, command.type, { status: 'done' });
    }
    // sdlc.intent.updated.v1
    return this.apply(item, command.type, command.patch ?? {});
  }

  private apply(
    item: WaypointItem,
    type: string,
    patch: Partial<WaypointItem>,
    actor?: string
  ): Response {
    Object.assign(item, patch);
    item.version += 1;
    item.updatedAt = new Date().toISOString();
    this.listRevision += 1;
    const events = this.sdlc.get(item.id) ?? [];
    events.push({ type, version: item.version, ...(actor !== undefined ? { actor } : {}) });
    this.sdlc.set(item.id, events);
    return json(200, { item }, { ETag: String(item.version) });
  }

  private handleAppendEvidence(id: string, entry: WaypointEvidenceEntry): Response {
    if (!this.items.has(id)) return json(404, { error: 'not found' });
    const ledger = this.evidenceLedgers.get(id) ?? [];
    ledger.push(entry);
    this.evidenceLedgers.set(id, ledger);
    return new Response(null, { status: 204 });
  }

  private handleListEvidence(id: string, limit: string | null): Response {
    if (!this.items.has(id)) return json(404, { error: 'not found' });
    let events = this.evidenceLedgers.get(id) ?? [];
    if (limit !== null) events = events.slice(0, Number.parseInt(limit, 10));
    return json(200, { events });
  }
}
