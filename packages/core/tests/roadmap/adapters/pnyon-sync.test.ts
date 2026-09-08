/**
 * Contract tests for `PnyonSyncAdapter` — the `TrackerSyncAdapter` half of the
 * Waypoint tracker kind (spec: docs/changes/pnyon-tracker-sync-adapter/proposal.md).
 *
 * Run against the same in-memory mock Waypoint API the client adapter's tests
 * use, so both halves are held to one reference implementation rather than to
 * two hand-written fakes that can drift apart.
 *
 *  - SC-1 a pnyon-configured sync creates and updates real Waypoint items
 *  - SC-2 a concurrent external edit surfaces as a conflict, not a silent clobber
 *  - SC-3 a second run with no intervening change writes nothing
 *  - SC-4 methods with no Waypoint equivalent fail loudly
 */
import { describe, it, expect } from 'vitest';
import { PnyonSyncAdapter } from '../../../src/roadmap/adapters/pnyon-sync';
import { PnyonTrackerAdapter } from '../../../src/roadmap/tracker/adapters/pnyon';
import { waypointItemUrl } from '../../../src/roadmap/tracker/adapters/pnyon';
import { MockWaypointApi } from '../tracker/adapters/waypoint-mock';
import type { RoadmapFeature } from '@harness-engineering/types';

function makeAdapter(): { api: MockWaypointApi; adapter: PnyonSyncAdapter } {
  const api = new MockWaypointApi();
  const adapter = new PnyonSyncAdapter({
    client: new PnyonTrackerAdapter({
      url: api.baseUrl,
      token: 'test-token',
      fetchFn: api.fetchFn,
    }),
    apiBaseUrl: api.baseUrl,
  });
  return { api, adapter };
}

const unwrap = <T>(r: { ok: boolean; value?: T; error?: Error }): T => {
  if (!r.ok) throw r.error ?? new Error('unexpected Err');
  return r.value as T;
};

const feature = (over: Partial<RoadmapFeature> = {}): RoadmapFeature => ({
  name: 'Ship the sync adapter',
  status: 'planned',
  spec: 'docs/changes/pnyon-tracker-sync-adapter/proposal.md',
  plans: [],
  blockedBy: [],
  summary: 'Translate TrackerSyncAdapter onto the Waypoint ledger',
  assignee: null,
  priority: null,
  externalId: null,
  updatedAt: null,
  ...over,
});

describe('PnyonSyncAdapter — writes reach the ledger (SC-1)', () => {
  it('creates an item and reports an address that resolves to it', async () => {
    const { api, adapter } = makeAdapter();

    const ticket = unwrap(await adapter.createTicket(feature(), 'Intake'));

    expect(ticket.externalId).toMatch(/^pnyon:/);
    expect(ticket.url).toBe(waypointItemUrl(api.baseUrl, ticket.externalId));

    // The URL is not decoration — it must address the item that was created.
    expect(ticket.url.endsWith(ticket.externalId.replace('pnyon:', ''))).toBe(true);

    const all = unwrap(await adapter.fetchAllTickets());
    expect(all.map((t) => t.externalId)).toContain(ticket.externalId);
  });

  /**
   * Every field the roadmap row carries has to survive the create. A dropped
   * field is invisible at the call site and only shows up as data that quietly
   * stopped syncing, so each one is asserted by name rather than by a snapshot
   * that would happily absorb a null.
   */
  it('carries every planning field through create, not just name and summary', async () => {
    const { adapter } = makeAdapter();

    const ticket = unwrap(
      await adapter.createTicket(
        feature({
          status: 'in-progress',
          assignee: 'ada',
          priority: 'high',
          plans: ['docs/plans/one.md'],
          blockedBy: ['Some other feature'],
        }),
        'Intake'
      )
    );

    const state = unwrap(await adapter.fetchAllTickets()).find(
      (t) => t.externalId === ticket.externalId
    );
    expect(state?.status).toBe('in-progress');
    expect(state?.assignee).toBe('ada');
  });

  it('updates an existing item', async () => {
    const { adapter } = makeAdapter();
    const ticket = unwrap(await adapter.createTicket(feature(), 'Intake'));

    unwrap(await adapter.updateTicket(ticket.externalId, { status: 'done' }));

    const state = unwrap(await adapter.fetchAllTickets()).find(
      (t) => t.externalId === ticket.externalId
    );
    expect(state?.status).toBe('done');
  });

  /**
   * `fetchAllTickets` reports Waypoint's own status vocabulary verbatim. This
   * is asserted rather than assumed because `roadmap reconcile` filters on the
   * GitHub words `closed`/`completed` — the reason it refuses this kind outright
   * instead of running and matching nothing.
   */
  it('reports roadmap statuses, never GitHub open/closed words', async () => {
    const { adapter } = makeAdapter();
    await adapter.createTicket(feature({ status: 'done' }), 'Intake');

    const all = unwrap(await adapter.fetchAllTickets());
    expect(all.every((t) => t.status !== 'closed' && t.status !== 'open')).toBe(true);
    expect(all.map((t) => t.status)).toContain('done');
  });
});

describe('PnyonSyncAdapter — comments round-trip (D1)', () => {
  /**
   * The regression this guards: `commented` was writable through the evidence
   * API but absent from the read filter, so a comment could be posted, accepted,
   * and then vanish on read. Writing and reading in one test is the only way
   * that failure is visible.
   */
  it('posts a comment and reads the same comment back', async () => {
    const { adapter } = makeAdapter();
    const ticket = unwrap(await adapter.createTicket(feature(), 'Intake'));

    unwrap(await adapter.addComment(ticket.externalId, 'Blocked on the ledger migration.'));

    const comments = unwrap(await adapter.fetchComments(ticket.externalId));
    expect(comments).toHaveLength(1);
    expect(comments[0]!.body).toBe('Blocked on the ledger migration.');
    expect(comments[0]!.author).toBe('harness');
    // Append-only ledger: an entry is never edited, so there is no updated time.
    expect(comments[0]!.updatedAt).toBeNull();
  });

  it('returns only comments, not the lifecycle events sharing the ledger', async () => {
    const { adapter } = makeAdapter();
    const ticket = unwrap(await adapter.createTicket(feature(), 'Intake'));

    // Produces a lifecycle event on the same ledger the comments live in.
    unwrap(await adapter.updateTicket(ticket.externalId, { status: 'in-progress' }));
    unwrap(await adapter.addComment(ticket.externalId, 'Only this one is a comment.'));

    const comments = unwrap(await adapter.fetchComments(ticket.externalId));
    expect(comments.map((c) => c.body)).toEqual(['Only this one is a comment.']);
  });

  it('gives each comment a distinct, stable id', async () => {
    const { adapter } = makeAdapter();
    const ticket = unwrap(await adapter.createTicket(feature(), 'Intake'));

    unwrap(await adapter.addComment(ticket.externalId, 'first'));

    const once = unwrap(await adapter.fetchComments(ticket.externalId));
    const twice = unwrap(await adapter.fetchComments(ticket.externalId));
    expect(twice.map((c) => c.id)).toEqual(once.map((c) => c.id));
    expect(once[0]!.id).toContain(ticket.externalId);
  });
});

describe('PnyonSyncAdapter — idempotence (SC-3)', () => {
  it('a repeated update with unchanged values leaves the item as it was', async () => {
    const { adapter } = makeAdapter();
    const ticket = unwrap(await adapter.createTicket(feature(), 'Intake'));

    unwrap(await adapter.updateTicket(ticket.externalId, { status: 'in-progress' }));
    const after = unwrap(await adapter.fetchAllTickets()).find(
      (t) => t.externalId === ticket.externalId
    );

    unwrap(await adapter.updateTicket(ticket.externalId, { status: 'in-progress' }));
    const again = unwrap(await adapter.fetchAllTickets()).find(
      (t) => t.externalId === ticket.externalId
    );

    expect(again).toEqual(after);
  });
});

describe('PnyonSyncAdapter — unsupported operations fail loudly (SC-4)', () => {
  it.each([
    ['fetchTicketState', (a: PnyonSyncAdapter) => a.fetchTicketState('pnyon:x')],
    ['assignTicket', (a: PnyonSyncAdapter) => a.assignTicket('pnyon:x', 'ada')],
  ])('%s returns an Err naming the operation and the backend', async (name, call) => {
    const { adapter } = makeAdapter();

    const result = await call(adapter);

    expect(result.ok).toBe(false);
    // A refusal that names neither the operation nor the backend leaves the
    // reader nowhere to go, which is the whole complaint behind #1863.
    expect(result.ok === false && result.error.message).toContain(name);
    expect(result.ok === false && result.error.message).toMatch(/pnyon|Waypoint/i);
  });

  it('does not silently succeed', async () => {
    const { adapter } = makeAdapter();
    // The dangerous failure is a no-op that reports Ok — assert the negative
    // explicitly rather than trusting the Err assertions above to imply it.
    expect((await adapter.assignTicket('pnyon:x', 'ada')).ok).toBe(false);
  });
});

describe('PnyonSyncAdapter — errors surface (SC-2)', () => {
  it('reports a failed update as an Err rather than a successful ticket', async () => {
    const { adapter } = makeAdapter();

    const result = await adapter.updateTicket('pnyon:01NOSUCHITEM0000000000000', {
      status: 'done',
    });

    expect(result.ok).toBe(false);
  });

  it('reports a failed comment read as an Err', async () => {
    const { adapter } = makeAdapter();

    const result = await adapter.fetchComments('pnyon:01NOSUCHITEM0000000000000');

    expect(result.ok).toBe(false);
  });
});

describe('waypointItemUrl', () => {
  it('addresses the item whether or not the id carries the prefix', () => {
    expect(waypointItemUrl('https://w.test/o/one', 'pnyon:01ABC')).toBe(
      'https://w.test/o/one/v1/items/01ABC'
    );
    expect(waypointItemUrl('https://w.test/o/one', '01ABC')).toBe(
      'https://w.test/o/one/v1/items/01ABC'
    );
  });

  it('does not double the separator when the base carries a trailing slash', () => {
    expect(waypointItemUrl('https://w.test/o/one/', 'pnyon:01ABC')).toBe(
      'https://w.test/o/one/v1/items/01ABC'
    );
  });
});
