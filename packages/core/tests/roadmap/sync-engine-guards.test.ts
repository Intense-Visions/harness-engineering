import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  syncToExternal,
  syncFromExternal,
  fullSync,
  _resetSyncMutex,
} from '../../src/roadmap/sync-engine';
import type { TrackerSyncAdapter } from '../../src/roadmap/tracker-sync';
import type {
  Roadmap,
  RoadmapFeature,
  ExternalTicketState,
  TrackerSyncConfig,
} from '@harness-engineering/types';
import { Ok } from '@harness-engineering/types';
import { serializeRoadmap } from '../../src/roadmap/serialize';

/**
 * CI-safety guards on the roadmap↔tracker sync.
 *
 * These cover the two destructive powers an unattended nightly sync must be
 * able to switch off — closing/reopening issues, and creating them — plus the
 * dry-run mode that switches off every write at once. The dry-run assertion
 * (zero adapter write calls) is the load-bearing one: it is what makes the
 * command safe to point at a real repo by default.
 */

const CONFIG: TrackerSyncConfig = {
  kind: 'github',
  repo: 'owner/repo',
  labels: ['harness-managed'],
  statusMap: {
    backlog: 'open',
    planned: 'open',
    'in-progress': 'open',
    done: 'closed',
    blocked: 'open',
  },
  reverseStatusMap: {
    closed: 'done',
    'open:in-progress': 'in-progress',
    'open:blocked': 'blocked',
    'open:planned': 'planned',
  },
};

function makeFeature(overrides?: Partial<RoadmapFeature>): RoadmapFeature {
  return {
    name: 'Test Feature',
    status: 'planned',
    spec: null,
    plans: [],
    blockedBy: [],
    summary: 'A test feature',
    assignee: null,
    priority: null,
    externalId: null,
    updatedAt: null,
    ...overrides,
  };
}

function makeRoadmap(features: RoadmapFeature[]): Roadmap {
  return {
    frontmatter: {
      project: 'test',
      version: 1,
      lastSynced: '2026-04-01T00:00:00Z',
      lastManualEdit: '2026-04-01T00:00:00Z',
    },
    milestones: [{ name: 'M1', isBacklog: false, features }],
    assignmentHistory: [],
  };
}

function ticket(overrides: Partial<ExternalTicketState> = {}): ExternalTicketState {
  return {
    externalId: 'github:owner/repo#1',
    title: 'Test Feature',
    status: 'open',
    labels: ['harness-managed'],
    assignee: null,
    ...overrides,
  };
}

/** A mock adapter whose every write is a spy, so "zero writes" is assertable. */
function mockAdapter(overrides?: Partial<TrackerSyncAdapter>): TrackerSyncAdapter {
  let counter = 0;
  return {
    createTicket: vi.fn(async () => {
      counter++;
      return Ok({
        externalId: `github:owner/repo#${counter}`,
        url: `https://github.com/owner/repo/issues/${counter}`,
      });
    }),
    updateTicket: vi.fn(async (id: string) =>
      Ok({ externalId: id, url: `https://github.com/owner/repo/issues/1` })
    ),
    fetchTicketState: vi.fn(async () => Ok(ticket())),
    fetchAllTickets: vi.fn(async () => Ok([] as ExternalTicketState[])),
    assignTicket: vi.fn(async () => Ok(undefined)),
    addComment: vi.fn(async () => Ok(undefined)),
    fetchComments: vi.fn(async () => Ok([])),
    ...overrides,
  } as TrackerSyncAdapter;
}

describe('syncToExternal() — back-compat (no options)', () => {
  it('behaves exactly as before when no options are passed', async () => {
    const feature = makeFeature();
    const roadmap = makeRoadmap([feature]);
    const adapter = mockAdapter();

    const result = await syncToExternal(roadmap, adapter, CONFIG);

    expect(adapter.createTicket).toHaveBeenCalledOnce();
    expect(result.created).toHaveLength(1);
    expect(feature.externalId).toBe('github:owner/repo#1');
    expect(result.dryRun).toBe(false);
    expect(result.skippedCreates).toEqual([]);
    expect(result.skippedStateChanges).toEqual([]);
  });

  it('still patches existing tickets and passes state-sync through by default', async () => {
    const roadmap = makeRoadmap([makeFeature({ externalId: 'github:owner/repo#42' })]);
    const adapter = mockAdapter();

    const result = await syncToExternal(roadmap, adapter, CONFIG);

    expect(result.updated).toEqual(['github:owner/repo#42']);
    // The 4th arg is the write policy; the default must permit state changes.
    const call = vi.mocked(adapter.updateTicket).mock.calls[0]!;
    expect(call[3]).toEqual({ syncIssueState: true });
  });
});

describe('syncToExternal() — dryRun', () => {
  it('performs ZERO write calls on the adapter', async () => {
    const roadmap = makeRoadmap([
      makeFeature({ name: 'Needs a ticket' }),
      makeFeature({ name: 'Has a ticket', externalId: 'github:owner/repo#7' }),
    ]);
    const adapter = mockAdapter();

    const result = await syncToExternal(roadmap, adapter, CONFIG, [], { dryRun: true });

    expect(adapter.createTicket).not.toHaveBeenCalled();
    expect(adapter.updateTicket).not.toHaveBeenCalled();
    expect(adapter.assignTicket).not.toHaveBeenCalled();
    expect(adapter.addComment).not.toHaveBeenCalled();

    // ...and it still reports what it WOULD have done.
    expect(result.dryRun).toBe(true);
    expect(result.planned.creates).toEqual([{ feature: 'Needs a ticket', milestone: 'M1' }]);
    expect(result.planned.updates).toEqual(['github:owner/repo#7']);
    expect(result.created).toEqual([]);
    expect(result.updated).toEqual([]);
  });

  it('does not mutate the feature externalId (no phantom link from a dry run)', async () => {
    const feature = makeFeature();
    const roadmap = makeRoadmap([feature]);

    await syncToExternal(roadmap, mockAdapter(), CONFIG, [], { dryRun: true });

    expect(feature.externalId).toBeNull();
  });
});

describe('syncToExternal() — allowCreate: false', () => {
  it('skips creation and REPORTS each skipped row rather than dropping it', async () => {
    const roadmap = makeRoadmap([
      makeFeature({ name: 'Unlinked A' }),
      makeFeature({ name: 'Unlinked B' }),
      makeFeature({ name: 'Linked', externalId: 'github:owner/repo#9' }),
    ]);
    const adapter = mockAdapter();

    const result = await syncToExternal(roadmap, adapter, CONFIG, [], { allowCreate: false });

    expect(adapter.createTicket).not.toHaveBeenCalled();
    expect(result.created).toEqual([]);
    expect(result.skippedCreates).toEqual([
      { feature: 'Unlinked A', milestone: 'M1', reason: 'create-disabled' },
      { feature: 'Unlinked B', milestone: 'M1', reason: 'create-disabled' },
    ]);
    // The linked row is still patched — the guard is scoped to creation only.
    expect(result.updated).toEqual(['github:owner/repo#9']);
  });

  it('still links a row by title dedup rather than reporting a skip', async () => {
    const feature = makeFeature({ name: 'Test Feature' });
    const roadmap = makeRoadmap([feature]);
    const adapter = mockAdapter();

    const result = await syncToExternal(roadmap, adapter, CONFIG, [ticket()], {
      allowCreate: false,
    });

    expect(result.skippedCreates).toEqual([]);
    expect(feature.externalId).toBe('github:owner/repo#1');
    expect(result.updated).toEqual(['github:owner/repo#1']);
  });
});

describe('syncToExternal() — syncIssueState: false', () => {
  it('passes the guard down to the adapter write policy', async () => {
    const roadmap = makeRoadmap([makeFeature({ externalId: 'github:owner/repo#1' })]);
    const adapter = mockAdapter();

    await syncToExternal(roadmap, adapter, CONFIG, [ticket()], { syncIssueState: false });

    const call = vi.mocked(adapter.updateTicket).mock.calls[0]!;
    expect(call[3]).toEqual({ syncIssueState: false });
  });

  it('reports the open->closed transition it suppressed', async () => {
    const roadmap = makeRoadmap([
      makeFeature({ externalId: 'github:owner/repo#1', status: 'done' }),
    ]);
    const adapter = mockAdapter();

    const result = await syncToExternal(roadmap, adapter, CONFIG, [ticket({ status: 'open' })], {
      syncIssueState: false,
    });

    expect(result.skippedStateChanges).toEqual([
      { externalId: 'github:owner/repo#1', from: 'open', to: 'closed' },
    ]);
  });

  it('reports nothing when the mapped state already matches (no transition suppressed)', async () => {
    const roadmap = makeRoadmap([
      makeFeature({ externalId: 'github:owner/repo#1', status: 'planned' }),
    ]);
    const result = await syncToExternal(
      makeRoadmap(roadmap.milestones[0]!.features),
      mockAdapter(),
      CONFIG,
      [ticket({ status: 'open' })],
      { syncIssueState: false }
    );

    expect(result.skippedStateChanges).toEqual([]);
  });
});

describe('syncToExternal() — denominator', () => {
  it('reports rows compared and tickets fetched', async () => {
    const roadmap = makeRoadmap([
      makeFeature({ name: 'A', externalId: 'github:owner/repo#1' }),
      makeFeature({ name: 'B', externalId: 'github:owner/repo#2' }),
    ]);

    const result = await syncToExternal(roadmap, mockAdapter(), CONFIG, [
      ticket({ externalId: 'github:owner/repo#1' }),
      ticket({ externalId: 'github:owner/repo#2' }),
      ticket({ externalId: 'github:owner/repo#3' }),
    ]);

    expect(result.examined).toEqual({ roadmapRows: 2, ticketsFetched: 3 });
  });

  it('reports ticketsFetched: null when no ticket set was supplied', async () => {
    const result = await syncToExternal(makeRoadmap([makeFeature()]), mockAdapter(), CONFIG);
    expect(result.examined.ticketsFetched).toBeNull();
  });
});

describe('fullSync() — dryRun end to end', () => {
  let tmpDir: string;
  let roadmapPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fullsync-guards-'));
    fs.mkdirSync(path.join(tmpDir, 'docs'), { recursive: true });
    roadmapPath = path.join(tmpDir, 'docs', 'roadmap.md');
    _resetSyncMutex();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('issues no adapter write AND leaves the roadmap file byte-identical', async () => {
    const roadmap = makeRoadmap([makeFeature({ name: 'My Feature' })]);
    fs.writeFileSync(roadmapPath, serializeRoadmap(roadmap), 'utf-8');
    const before = fs.readFileSync(roadmapPath, 'utf-8');

    const adapter = mockAdapter();
    const result = await fullSync(tmpDir, adapter, CONFIG, { dryRun: true });

    expect(adapter.createTicket).not.toHaveBeenCalled();
    expect(adapter.updateTicket).not.toHaveBeenCalled();
    expect(fs.readFileSync(roadmapPath, 'utf-8')).toBe(before);
    expect(result.dryRun).toBe(true);
    expect(result.planned.creates).toEqual([{ feature: 'My Feature', milestone: 'M1' }]);
    expect(result.errors).toEqual([]);
  });

  it('reports the local rows it would have rewritten', async () => {
    const roadmap = makeRoadmap([
      makeFeature({ name: 'My Feature', externalId: 'github:owner/repo#1', status: 'planned' }),
    ]);
    fs.writeFileSync(roadmapPath, serializeRoadmap(roadmap), 'utf-8');

    // Tracker says closed -> the pull would flip the row to done locally.
    const adapter = mockAdapter({
      fetchAllTickets: vi.fn(async () => Ok([ticket({ status: 'closed', title: 'My Feature' })])),
    });

    const result = await fullSync(tmpDir, adapter, CONFIG, { dryRun: true });

    expect(result.planned.localWrites).toEqual(['My Feature']);
    // ...and nothing landed on disk.
    expect(fs.readFileSync(roadmapPath, 'utf-8')).toContain('planned');
  });

  it('still reports dryRun on the load-failure path', async () => {
    // A malformed roadmap source makes store.load() fail before any sync runs.
    // The result must still say dryRun, or a dry run gets reported to the
    // operator as an applied run — the mode line would lie about what happened.
    fs.writeFileSync(roadmapPath, 'not a roadmap at all', 'utf-8');

    const result = await fullSync(tmpDir, mockAdapter(), CONFIG, { dryRun: true });

    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.dryRun).toBe(true);
  });

  it('threads the denominator through (rows parsed + tickets fetched)', async () => {
    const roadmap = makeRoadmap([
      makeFeature({ name: 'A', externalId: 'github:owner/repo#1' }),
      makeFeature({ name: 'B', externalId: 'github:owner/repo#2' }),
    ]);
    fs.writeFileSync(roadmapPath, serializeRoadmap(roadmap), 'utf-8');

    const adapter = mockAdapter({
      fetchAllTickets: vi.fn(async () =>
        Ok([
          ticket({ externalId: 'github:owner/repo#1', title: 'A' }),
          ticket({ externalId: 'github:owner/repo#2', title: 'B' }),
        ])
      ),
    });

    const result = await fullSync(tmpDir, adapter, CONFIG, { dryRun: true });

    expect(result.examined).toEqual({ roadmapRows: 2, ticketsFetched: 2 });
  });

  it('records ticketsFetched: 0 (not null) when the tracker returns an empty set', async () => {
    fs.writeFileSync(
      roadmapPath,
      serializeRoadmap(makeRoadmap([makeFeature({ externalId: 'github:owner/repo#1' })])),
      'utf-8'
    );

    const result = await fullSync(tmpDir, mockAdapter(), CONFIG, { dryRun: true });

    expect(result.examined.ticketsFetched).toBe(0);
  });

  it('applies writes when dryRun is omitted (back-compat)', async () => {
    fs.writeFileSync(roadmapPath, serializeRoadmap(makeRoadmap([makeFeature()])), 'utf-8');

    const adapter = mockAdapter();
    const result = await fullSync(tmpDir, adapter, CONFIG);

    expect(adapter.createTicket).toHaveBeenCalledOnce();
    expect(result.dryRun).toBe(false);
    expect(fs.readFileSync(roadmapPath, 'utf-8')).toContain('github:owner/repo#1');
  });
});

describe('applyTicketToFeature() — tracker silence is not tracker opinion (assignee)', () => {
  function ownedRow() {
    return makeFeature({
      name: 'Owned Row',
      status: 'in-progress',
      assignee: '@alice',
      externalId: 'github:owner/repo#1',
    });
  }

  /** Ticket that agrees on status but reports nobody assigned. */
  function silentTicket() {
    return ticket({
      title: 'Owned Row',
      assignee: null,
      labels: ['harness-managed', 'in-progress'],
    });
  }

  it('does not clear a non-null local assignee when the ticket reports none', async () => {
    const feature = ownedRow();
    const roadmap = makeRoadmap([feature]);
    const adapter = mockAdapter({ fetchAllTickets: vi.fn(async () => Ok([silentTicket()])) });

    const result = await syncFromExternal(roadmap, adapter, CONFIG);

    expect(feature.assignee).toBe('@alice');
    expect(result.assignmentChanges).toEqual([]);
  });

  it('records the suppression rather than dropping it', async () => {
    const feature = ownedRow();
    const roadmap = makeRoadmap([feature]);
    const adapter = mockAdapter({ fetchAllTickets: vi.fn(async () => Ok([silentTicket()])) });

    const result = await syncFromExternal(roadmap, adapter, CONFIG);

    expect(result.suppressedInbound).toEqual([
      {
        feature: 'Owned Row',
        field: 'assignee',
        from: '@alice',
        to: null,
        reason: 'tracker-reports-no-assignee',
      },
    ]);
  });

  it('still clears the assignee under forceSync (escape hatch intact)', async () => {
    const feature = ownedRow();
    const roadmap = makeRoadmap([feature]);
    const adapter = mockAdapter({ fetchAllTickets: vi.fn(async () => Ok([silentTicket()])) });

    const result = await syncFromExternal(roadmap, adapter, CONFIG, { forceSync: true });

    expect(feature.assignee).toBeNull();
    expect(result.suppressedInbound).toEqual([]);
    expect(result.assignmentChanges).toEqual([{ feature: 'Owned Row', from: '@alice', to: null }]);
  });

  it('still applies an inbound assignment (null → someone) and a reassignment', async () => {
    const unassigned = makeFeature({
      name: 'Owned Row',
      status: 'planned',
      assignee: null,
      externalId: 'github:owner/repo#1',
    });
    const roadmap = makeRoadmap([unassigned]);
    const adapter = mockAdapter({
      fetchAllTickets: vi.fn(async () =>
        Ok([
          ticket({
            title: 'Owned Row',
            assignee: '@bob',
            labels: ['harness-managed', 'planned'],
          }),
        ])
      ),
    });

    const result = await syncFromExternal(roadmap, adapter, CONFIG);

    expect(unassigned.assignee).toBe('@bob');
    expect(result.suppressedInbound).toEqual([]);
  });
});
