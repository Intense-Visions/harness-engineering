/**
 * Contract tests for the pnyon (Waypoint) tracker adapter against the
 * in-memory mock Waypoint API (`waypoint-mock.ts` — the reference
 * implementation of the documented contract; zero real network).
 *
 * Spec: docs/changes/waypoint-tracker-kind-pnyon/proposal.md
 *  - SC3 interface parity (every RoadmapTrackerClient method round-trips)
 *  - SC4 conflict contract (TRACKER_CONFLICT; no destructive retry)
 *  - SC5 claim idempotency (same assignee re-claim appends no event)
 *  - SC6 ETag caching (304 reuse, request-count asserted)
 *  - SC7 zero GitHub dependency (module + request-host audit; harness #640)
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PnyonTrackerAdapter } from '../../../../src/roadmap/tracker/adapters/pnyon';
import { ConflictError } from '../../../../src/roadmap/tracker/client';
import type { HistoryEvent } from '../../../../src/roadmap/tracker/client';
import { MockWaypointApi } from './waypoint-mock';

function makeAdapter(api?: MockWaypointApi): {
  api: MockWaypointApi;
  adapter: PnyonTrackerAdapter;
} {
  const mock = api ?? new MockWaypointApi();
  const adapter = new PnyonTrackerAdapter({
    url: mock.baseUrl,
    token: 'test-token',
    fetchFn: mock.fetchFn,
  });
  return { api: mock, adapter };
}

const unwrap = <T>(r: { ok: boolean; value?: T; error?: Error }): T => {
  if (!r.ok) throw r.error ?? new Error('unexpected Err');
  return r.value as T;
};

describe('PnyonTrackerAdapter — interface parity (SC3)', () => {
  it('round-trips create → fetchAll → fetchById → fetchByStatus → update → claim → release → complete', async () => {
    const { api, adapter } = makeAdapter();

    // create
    const created = unwrap(
      await adapter.create({
        name: 'Waypoint slice 1',
        summary: 'First checkpoint',
        status: 'backlog',
        spec: 'docs/spec.md',
        plans: ['docs/plan.md'],
        blockedBy: ['Other feature'],
        priority: 'P1',
        milestone: 'checkpoint-1',
      })
    );
    expect(created.externalId).toMatch(/^pnyon:/);
    expect(created.status).toBe('backlog');
    expect(created.spec).toBe('docs/spec.md');
    expect(created.plans).toEqual(['docs/plan.md']);
    expect(created.blockedBy).toEqual(['Other feature']);
    expect(created.priority).toBe('P1');
    expect(created.milestone).toBe('checkpoint-1');
    expect(api.sdlcLedger(created.externalId)).toHaveLength(1); // intent.created

    // fetchAll
    const all = unwrap(await adapter.fetchAll());
    expect(all.features.map((f) => f.externalId)).toContain(created.externalId);
    expect(all.etag).not.toBeNull();

    // fetchById
    const byId = unwrap(await adapter.fetchById(created.externalId));
    expect(byId).not.toBeNull();
    expect(byId!.feature.name).toBe('Waypoint slice 1');
    expect(byId!.etag).toBe('1');

    // fetchByStatus (server-side filter)
    const backlog = unwrap(await adapter.fetchByStatus(['backlog']));
    expect(backlog.map((f) => f.externalId)).toContain(created.externalId);
    expect(unwrap(await adapter.fetchByStatus(['done']))).toHaveLength(0);

    // update → sdlc.intent.updated.v1
    const updated = unwrap(
      await adapter.update(created.externalId, { status: 'planned', priority: 'P0' })
    );
    expect(updated.status).toBe('planned');
    expect(updated.priority).toBe('P0');
    expect(api.sdlcLedger(created.externalId).at(-1)!.type).toBe('sdlc.intent.updated.v1');

    // claim → sdlc.claim.opened.v1 (assignee + in-progress)
    const claimed = unwrap(await adapter.claim(created.externalId, 'agent://claude/roadmap-fleet'));
    expect(claimed.assignee).toBe('agent://claude/roadmap-fleet');
    expect(claimed.status).toBe('in-progress');
    expect(api.sdlcLedger(created.externalId).at(-1)!.type).toBe('sdlc.claim.opened.v1');

    // release → sdlc.claim.released.v1 (assignee cleared)
    const released = unwrap(await adapter.release(created.externalId));
    expect(released.assignee).toBeNull();
    expect(api.sdlcLedger(created.externalId).at(-1)!.type).toBe('sdlc.claim.released.v1');

    // complete → sdlc.intent.closed.v1 (done)
    const completed = unwrap(await adapter.complete(created.externalId));
    expect(completed.status).toBe('done');
    expect(api.sdlcLedger(created.externalId).at(-1)!.type).toBe('sdlc.intent.closed.v1');
  });

  it('fetchById returns Ok(null) for a missing item', async () => {
    const { adapter } = makeAdapter();
    expect(unwrap(await adapter.fetchById('pnyon:missing'))).toBeNull();
  });

  it('returns Err (not throw) when the transport fails', async () => {
    const adapter = new PnyonTrackerAdapter({
      url: 'https://waypoint.test/o/x',
      token: 't',
      fetchFn: async () => {
        throw new Error('ECONNREFUSED');
      },
    });
    const r = await adapter.fetchAll();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toMatch(/ECONNREFUSED/);
  });
});

describe('PnyonTrackerAdapter — conflict contract (SC4)', () => {
  it('surfaces a stale-version update as ConflictError code TRACKER_CONFLICT', async () => {
    const { api, adapter } = makeAdapter();
    const item = api.seed({ name: 'contested', status: 'planned' });
    const externalId = `pnyon:${item.id}`;

    // Another writer moves the item ahead of our stale ifMatch.
    unwrap(await adapter.update(externalId, { status: 'in-progress' }));
    const eventsBefore = api.sdlcLedger(externalId).length;

    const r = await adapter.update(externalId, { status: 'backlog' }, '1');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toBeInstanceOf(ConflictError);
      const conflict = r.error as ConflictError;
      expect(conflict.code).toBe('TRACKER_CONFLICT');
      expect(Object.keys(conflict.diff).length).toBeGreaterThan(0);
      expect(conflict.serverUpdatedAt).not.toBeNull();
    }
    // No destructive retry: the loser appended nothing.
    expect(api.sdlcLedger(externalId)).toHaveLength(eventsBefore);
  });

  it('grants exactly one of two racing claims; the loser gets TRACKER_CONFLICT', async () => {
    const { api, adapter } = makeAdapter();
    const item = api.seed({ name: 'raced', status: 'planned' });
    const externalId = `pnyon:${item.id}`;

    const winner = await adapter.claim(externalId, 'agent://fleet/lane-a');
    const loser = await adapter.claim(externalId, 'agent://fleet/lane-b');

    expect(winner.ok).toBe(true);
    expect(loser.ok).toBe(false);
    if (!loser.ok) {
      expect(loser.error).toBeInstanceOf(ConflictError);
      expect((loser.error as ConflictError).code).toBe('TRACKER_CONFLICT');
      expect((loser.error as ConflictError).diff).toHaveProperty('assignee');
    }
    // Exactly one claim event in the ledger for the winner.
    const claims = api.sdlcLedger(externalId).filter((e) => e.type === 'sdlc.claim.opened.v1');
    expect(claims).toHaveLength(1);
    expect(claims[0]!.actor).toBe('agent://fleet/lane-a');
    expect(api.item(externalId)!.assignee).toBe('agent://fleet/lane-a');
  });

  it('treats a stale-version command whose intent the server already holds as idempotent success', async () => {
    const { api, adapter } = makeAdapter();
    const item = api.seed({ name: 'converged', status: 'planned' });
    const externalId = `pnyon:${item.id}`;
    unwrap(await adapter.update(externalId, { status: 'in-progress' }));
    const eventsBefore = api.sdlcLedger(externalId).length;

    // Stale version, but the server already IS in-progress: not a conflict.
    const r = await adapter.update(externalId, { status: 'in-progress' }, '1');
    expect(r.ok).toBe(true);
    expect(api.sdlcLedger(externalId)).toHaveLength(eventsBefore);
  });
});

describe('PnyonTrackerAdapter — claim idempotency (SC5)', () => {
  it('re-claiming with the same assignee succeeds without a second claim event', async () => {
    const { api, adapter } = makeAdapter();
    const item = api.seed({ name: 'idempotent', status: 'planned' });
    const externalId = `pnyon:${item.id}`;

    unwrap(await adapter.claim(externalId, 'agent://fleet/lane-a'));
    const again = unwrap(await adapter.claim(externalId, 'agent://fleet/lane-a'));
    expect(again.assignee).toBe('agent://fleet/lane-a');

    const claims = api.sdlcLedger(externalId).filter((e) => e.type === 'sdlc.claim.opened.v1');
    expect(claims).toHaveLength(1);
  });
});

describe('PnyonTrackerAdapter — ETag caching (SC6)', () => {
  it('serves an unchanged fetchAll from cache via If-None-Match/304', async () => {
    const { api, adapter } = makeAdapter();
    api.seed({ name: 'cached-a' });
    api.seed({ name: 'cached-b' });

    const first = unwrap(await adapter.fetchAll());
    const second = unwrap(await adapter.fetchAll());
    expect(second.features.map((f) => f.name).sort()).toEqual(
      first.features.map((f) => f.name).sort()
    );
    // One full list body; the second read was a 304 revalidation.
    expect(api.fullListResponses).toBe(1);
  });

  it('serves an unchanged fetchById from cache and invalidates after a write', async () => {
    const { api, adapter } = makeAdapter();
    const item = api.seed({ name: 'cached-item' });
    const externalId = `pnyon:${item.id}`;

    unwrap(await adapter.fetchById(externalId));
    unwrap(await adapter.fetchById(externalId));
    expect(api.fullItemResponses).toBe(1);

    unwrap(await adapter.update(externalId, { status: 'planned' }));
    const after = unwrap(await adapter.fetchById(externalId));
    expect(after!.feature.status).toBe('planned');
  });
});

describe('PnyonTrackerAdapter — zero GitHub dependency (SC7, harness #640)', () => {
  it('adapter modules import nothing GitHub-related', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const srcDir = join(here, '../../../../src/roadmap/tracker/adapters');
    for (const file of ['pnyon.ts', 'waypoint-http.ts']) {
      const source = readFileSync(join(srcDir, file), 'utf-8');
      const imports = source
        .split('\n')
        .filter((l) => /^\s*import\b/.test(l))
        .join('\n');
      expect(imports).not.toMatch(/github/i);
      expect(source).not.toMatch(/api\.github\.com/);
    }
  });

  it('a full method sweep touches only the configured Waypoint host', async () => {
    const { api, adapter } = makeAdapter();
    const created = unwrap(await adapter.create({ name: 'audited', summary: 's' }));
    await adapter.fetchAll();
    await adapter.fetchById(created.externalId);
    await adapter.fetchByStatus(['backlog']);
    await adapter.update(created.externalId, { priority: 'P2' });
    await adapter.claim(created.externalId, 'agent://fleet/lane-a');
    await adapter.release(created.externalId);
    await adapter.complete(created.externalId);
    await adapter.appendHistory(created.externalId, {
      type: 'completed',
      actor: 'agent://fleet/lane-a',
      at: new Date().toISOString(),
    });
    await adapter.fetchHistory(created.externalId);

    expect(api.requests.length).toBeGreaterThan(0);
    for (const url of api.requests) {
      expect(url.startsWith(api.baseUrl)).toBe(true);
    }
  });
});

describe('PnyonTrackerAdapter — history rides the evidence ledger', () => {
  it('round-trips ≥10 entries with order and content preserved', async () => {
    const { adapter } = makeAdapter();
    const created = unwrap(await adapter.create({ name: 'historied', summary: 's' }));

    const events: HistoryEvent[] = [];
    for (let i = 0; i < 12; i++) {
      const event: HistoryEvent = {
        type: i % 2 === 0 ? 'updated' : 'claimed',
        actor: `actor-${i}`,
        at: new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString(),
        details: { seq: i },
      };
      events.push(event);
      unwrap(await adapter.appendHistory(created.externalId, event));
    }

    const history = unwrap(await adapter.fetchHistory(created.externalId));
    expect(history).toEqual(events);

    const limited = unwrap(await adapter.fetchHistory(created.externalId, 5));
    expect(limited).toEqual(events.slice(0, 5));
  });

  it('filters non-harness evidence types out of fetchHistory', async () => {
    const { api, adapter } = makeAdapter();
    const created = unwrap(await adapter.create({ name: 'rich-ledger', summary: 's' }));
    unwrap(
      await adapter.appendHistory(created.externalId, {
        type: 'claimed',
        actor: 'a',
        at: new Date().toISOString(),
      })
    );
    // A richer Waypoint-native evidence entry lands in the same ledger.
    api.evidence(created.externalId).push({
      type: 'sdlc.verify.graded.v1',
      actor: 'agent://verifier',
      at: new Date().toISOString(),
    });

    const history = unwrap(await adapter.fetchHistory(created.externalId));
    expect(history).toHaveLength(1);
    expect(history[0]!.type).toBe('claimed');
  });
});
