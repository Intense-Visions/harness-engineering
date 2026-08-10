import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  syncToExternal,
  syncFromExternal,
  fullSync,
  syncRowToExternal,
  _resetSyncMutex,
} from '../../src/roadmap/sync-engine';
import type { TrackerSyncAdapter } from '../../src/roadmap/tracker-sync';
import type {
  Roadmap,
  RoadmapFeature,
  ExternalTicketState,
  TrackerSyncConfig,
} from '@harness-engineering/types';
import { Ok, Err } from '@harness-engineering/types';
import { serializeRoadmap } from '../../src/roadmap/serialize';
import { assigneeInvariantHolds } from '../../src/roadmap/assignee-lifecycle';

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

describe('applyTicketToFeature() — RMH005 holds after an inbound move off in-progress', () => {
  it('releases a HUMAN assignee through setStatus when the ticket closes', async () => {
    const feature = makeFeature({
      name: 'Owned Row',
      status: 'in-progress',
      assignee: '@alice',
      externalId: 'github:owner/repo#1',
    });
    const roadmap = makeRoadmap([feature]);
    const adapter = mockAdapter({
      fetchAllTickets: vi.fn(async () =>
        Ok([
          ticket({
            title: 'Owned Row',
            status: 'closed',
            assignee: null,
            labels: ['harness-managed'],
          }),
        ])
      ),
    });

    await syncFromExternal(roadmap, adapter, CONFIG);

    expect(feature.status).toBe('done');
    expect(feature.assignee).toBeNull();
    expect(assigneeInvariantHolds(feature)).toBe(true);
    expect(roadmap.assignmentHistory.length).toBeGreaterThan(0);
  });

  it('still releases a MACHINE claim (pre-existing behaviour preserved)', async () => {
    const feature = makeFeature({
      name: 'Owned Row',
      status: 'in-progress',
      assignee: 'orchestrator-1234abcd',
      externalId: 'github:owner/repo#1',
    });
    const roadmap = makeRoadmap([feature]);
    const adapter = mockAdapter({
      fetchAllTickets: vi.fn(async () =>
        Ok([ticket({ title: 'Owned Row', status: 'closed', labels: ['harness-managed'] })])
      ),
    });

    await syncFromExternal(roadmap, adapter, CONFIG);

    expect(feature.status).toBe('done');
    expect(assigneeInvariantHolds(feature)).toBe(true);
  });
});

/**
 * This repo's own reverseStatusMap shape: a DIRECT `open` key, which
 * resolveReverseStatus matches before it ever reaches the compound branch.
 * A bare OPEN and an explicitly `planned`-labelled OPEN both resolve to
 * `planned` here — which is exactly why the backlog guard must be gated on
 * the LABEL, not on the resolved status.
 */
const CONFIG_DIRECT_OPEN: TrackerSyncConfig = {
  ...CONFIG,
  reverseStatusMap: { ...CONFIG.reverseStatusMap, open: 'planned' },
};

describe('applyTicketToFeature() — bare OPEN is not an opinion about backlog', () => {
  function backlogRow() {
    return makeFeature({
      name: 'Idea Row',
      status: 'backlog',
      assignee: null,
      externalId: 'github:owner/repo#5',
    });
  }

  it('does not overwrite backlog when the ticket carries no status label', async () => {
    const feature = backlogRow();
    const roadmap = makeRoadmap([feature]);
    const adapter = mockAdapter({
      fetchAllTickets: vi.fn(async () =>
        Ok([
          ticket({
            externalId: 'github:owner/repo#5',
            title: 'Idea Row',
            status: 'open',
            labels: ['harness-managed'],
          }),
        ])
      ),
    });

    const result = await syncFromExternal(roadmap, adapter, CONFIG_DIRECT_OPEN);

    expect(feature.status).toBe('backlog');
    expect(result.suppressedInbound).toEqual([
      {
        feature: 'Idea Row',
        field: 'status',
        from: 'backlog',
        to: 'planned',
        reason: 'tracker-open-without-status-label',
      },
    ]);
  });

  it('DOES promote backlog when the ticket carries an explicit planned label', async () => {
    const feature = backlogRow();
    const roadmap = makeRoadmap([feature]);
    const adapter = mockAdapter({
      fetchAllTickets: vi.fn(async () =>
        Ok([
          ticket({
            externalId: 'github:owner/repo#5',
            title: 'Idea Row',
            status: 'open',
            labels: ['harness-managed', 'planned'],
          }),
        ])
      ),
    });

    const result = await syncFromExternal(roadmap, adapter, CONFIG_DIRECT_OPEN);

    expect(feature.status).toBe('planned');
    expect(result.suppressedInbound).toEqual([]);
  });

  it('still overwrites backlog under forceSync (escape hatch intact)', async () => {
    const feature = backlogRow();
    const roadmap = makeRoadmap([feature]);
    const adapter = mockAdapter({
      fetchAllTickets: vi.fn(async () =>
        Ok([
          ticket({
            externalId: 'github:owner/repo#5',
            title: 'Idea Row',
            status: 'open',
            labels: ['harness-managed'],
          }),
        ])
      ),
    });

    const result = await syncFromExternal(roadmap, adapter, CONFIG_DIRECT_OPEN, {
      forceSync: true,
    });

    expect(feature.status).toBe('planned');
    expect(result.suppressedInbound).toEqual([]);
  });

  it('leaves the pre-existing blocked guard untouched', async () => {
    const feature = makeFeature({
      name: 'Idea Row',
      status: 'blocked',
      externalId: 'github:owner/repo#5',
    });
    const roadmap = makeRoadmap([feature]);
    const adapter = mockAdapter({
      fetchAllTickets: vi.fn(async () =>
        Ok([
          ticket({
            externalId: 'github:owner/repo#5',
            title: 'Idea Row',
            status: 'open',
            labels: ['harness-managed'],
          }),
        ])
      ),
    });

    const result = await syncFromExternal(roadmap, adapter, CONFIG_DIRECT_OPEN);

    expect(feature.status).toBe('blocked');
    expect(result.suppressedInbound).toEqual([]);
  });
});

describe('syncRowToExternal() — row identity guard', () => {
  let tmpDir: string;
  let roadmapPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scoped-push-'));
    fs.mkdirSync(path.join(tmpDir, 'docs'), { recursive: true });
    roadmapPath = path.join(tmpDir, 'docs', 'roadmap.md');
    _resetSyncMutex();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('reports a zero-match name as an error and performs no adapter call', async () => {
    fs.writeFileSync(roadmapPath, serializeRoadmap(makeRoadmap([makeFeature()])), 'utf-8');
    const before = fs.readFileSync(roadmapPath, 'utf-8');
    const adapter = mockAdapter();

    const result = await syncRowToExternal(tmpDir, adapter, CONFIG, 'No Such Row');

    expect(adapter.fetchAllTickets).not.toHaveBeenCalled();
    expect(adapter.createTicket).not.toHaveBeenCalled();
    expect(adapter.updateTicket).not.toHaveBeenCalled();
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.error.message).toContain('not found');
    expect(fs.readFileSync(roadmapPath, 'utf-8')).toBe(before);
  });

  it('reports an ambiguous name as an error rather than throwing', async () => {
    const roadmap = makeRoadmap([makeFeature({ name: 'Dup' })]);
    roadmap.milestones.push({
      name: 'M2',
      isBacklog: false,
      features: [makeFeature({ name: 'Dup' })],
    });
    fs.writeFileSync(roadmapPath, serializeRoadmap(roadmap), 'utf-8');
    const adapter = mockAdapter();

    const result = await syncRowToExternal(tmpDir, adapter, CONFIG, 'dup');

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.error.message).toContain('ambiguous');
    expect(adapter.createTicket).not.toHaveBeenCalled();
  });

  it('matches the feature name case-insensitively', async () => {
    fs.writeFileSync(
      roadmapPath,
      serializeRoadmap(makeRoadmap([makeFeature({ name: 'Mixed Case Row' })])),
      'utf-8'
    );
    const adapter = mockAdapter();

    const result = await syncRowToExternal(tmpDir, adapter, CONFIG, 'mIxEd cAsE rOw');

    expect(result.errors).toEqual([]);
    expect(adapter.createTicket).toHaveBeenCalledOnce();
  });
});

describe('syncRowToExternal() — scoped push', () => {
  let tmpDir: string;
  let roadmapPath: string;

  /** Target row plus two unrelated already-linked rows. */
  function threeRowRoadmap() {
    return makeRoadmap([
      makeFeature({ name: 'Target Row', status: 'planned', externalId: null }),
      makeFeature({
        name: 'Other A',
        status: 'in-progress',
        assignee: '@alice',
        externalId: 'github:owner/repo#7',
      }),
      makeFeature({ name: 'Other B', status: 'backlog', externalId: 'github:owner/repo#8' }),
    ]);
  }

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scoped-push-push-'));
    fs.mkdirSync(path.join(tmpDir, 'docs'), { recursive: true });
    roadmapPath = path.join(tmpDir, 'docs', 'roadmap.md');
    fs.writeFileSync(roadmapPath, serializeRoadmap(threeRowRoadmap()), 'utf-8');
    _resetSyncMutex();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('writes only the target row: one create, and no write naming another externalId', async () => {
    const adapter = mockAdapter();

    const result = await syncRowToExternal(tmpDir, adapter, CONFIG, 'Target Row');

    expect(adapter.createTicket).toHaveBeenCalledOnce();
    const created = result.created[0]!.externalId;
    for (const call of (adapter.updateTicket as ReturnType<typeof vi.fn>).mock.calls) {
      expect(call[0]).toBe(created);
    }
    expect(result.errors).toEqual([]);
    expect(result.examined.roadmapRows).toBe(1);
    expect(result.suppressedInbound).toEqual([]);

    // The stamp landed on the real row, not on a throwaway projection.
    const after = fs.readFileSync(roadmapPath, 'utf-8');
    expect(after).toContain(`- **External-ID:** ${created}`);
    expect(after).toContain('github:owner/repo#7');
    expect(after).toContain('github:owner/repo#8');
  });

  it('does not stamp last_synced (a scoped push is not a reconcile)', async () => {
    const before = fs.readFileSync(roadmapPath, 'utf-8');
    const beforeStamp = /last_synced: (.*)/.exec(before)![1];

    await syncRowToExternal(tmpDir, mockAdapter(), CONFIG, 'Target Row');

    const after = fs.readFileSync(roadmapPath, 'utf-8');
    expect(/last_synced: (.*)/.exec(after)![1]).toBe(beforeStamp);
  });

  it('fails closed when fetchAllTickets fails: no create, no update, error reported', async () => {
    const before = fs.readFileSync(roadmapPath, 'utf-8');
    const adapter = mockAdapter({
      fetchAllTickets: vi.fn(async () => Err(new Error('tracker 503'))),
    });

    const result = await syncRowToExternal(tmpDir, adapter, CONFIG, 'Target Row');

    expect(adapter.createTicket).not.toHaveBeenCalled();
    expect(adapter.updateTicket).not.toHaveBeenCalled();
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.error.message).toContain('tracker 503');
    expect(fs.readFileSync(roadmapPath, 'utf-8')).toBe(before);
  });

  it('links to an existing labelled ticket with the same title and creates nothing', async () => {
    const adapter = mockAdapter({
      fetchAllTickets: vi.fn(async () =>
        Ok([
          ticket({
            externalId: 'github:owner/repo#42',
            title: 'Target Row',
            status: 'open',
            labels: ['harness-managed'],
          }),
        ])
      ),
    });

    const result = await syncRowToExternal(tmpDir, adapter, CONFIG, 'Target Row');

    expect(adapter.createTicket).not.toHaveBeenCalled();
    expect(result.created).toEqual([]);
    expect(result.updated).toEqual(['github:owner/repo#42']);
    expect(fs.readFileSync(roadmapPath, 'utf-8')).toContain(
      '- **External-ID:** github:owner/repo#42'
    );
  });

  it('ignores a same-title ticket that lacks the configured labels', async () => {
    const adapter = mockAdapter({
      fetchAllTickets: vi.fn(async () =>
        Ok([
          ticket({
            externalId: 'github:owner/repo#99',
            title: 'Target Row',
            status: 'open',
            labels: ['unrelated'],
          }),
        ])
      ),
    });

    await syncRowToExternal(tmpDir, adapter, CONFIG, 'Target Row');

    expect(adapter.createTicket).toHaveBeenCalledOnce();
  });
});
