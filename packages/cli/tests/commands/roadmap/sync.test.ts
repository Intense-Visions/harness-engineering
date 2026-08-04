import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Ok, serializeShard, serializeMeta } from '@harness-engineering/core';
import type {
  Shard,
  RoadmapMeta,
  RoadmapFeature,
  ExternalTicket,
  ExternalTicketState,
  TrackerSyncAdapter,
  TrackerSyncConfig,
  Result,
} from '@harness-engineering/core';
import { runRoadmapSync } from '../../../src/commands/roadmap/sync';
import { ExitCode } from '../../../src/utils/errors';

/**
 * `harness roadmap sync` — CI-safety guards and denominator discipline.
 *
 * The most important assertion in this file is that a default run (no `--apply`)
 * issues ZERO adapter writes: that is what makes the command safe to point at a
 * real repo, and what lets a nightly job be introduced without a review of every
 * roadmap row first.
 */

function trackerConfig(overrides: Partial<TrackerSyncConfig> = {}): TrackerSyncConfig {
  return {
    kind: 'github',
    repo: 'o/r',
    labels: ['harness-managed'],
    statusMap: {
      backlog: 'open',
      planned: 'open',
      'in-progress': 'open',
      done: 'closed',
      blocked: 'open',
    } as TrackerSyncConfig['statusMap'],
    reverseStatusMap: {
      closed: 'done',
      'open:in-progress': 'in-progress',
      'open:planned': 'planned',
    } as TrackerSyncConfig['reverseStatusMap'],
    ...overrides,
  };
}

const META: RoadmapMeta = {
  frontmatter: {
    project: 'test',
    version: 1,
    lastSynced: '2026-05-09T00:00:00Z',
    lastManualEdit: '2026-05-09T00:00:00Z',
  },
  milestones: ['MVP Release'],
};

function feature(
  name: string,
  externalId: string | null,
  extra: Partial<RoadmapFeature> = {}
): RoadmapFeature {
  return {
    name,
    status: 'planned',
    spec: null,
    plans: [],
    blockedBy: [],
    summary: `${name} summary`,
    assignee: null,
    priority: null,
    externalId,
    updatedAt: null,
    ...extra,
  };
}

function shard(slug: string, order: number, feat: RoadmapFeature): Shard {
  return { slug, milestone: 'MVP Release', order, feature: feat };
}

function ticket(overrides: Partial<ExternalTicketState> = {}): ExternalTicketState {
  return {
    externalId: 'github:o/r#1',
    title: 'Alpha',
    status: 'open',
    labels: ['harness-managed'],
    assignee: null,
    ...overrides,
  };
}

/** A tracker adapter whose every write is a spy, so "zero writes" is assertable. */
function spyAdapter(tickets: ExternalTicketState[]): TrackerSyncAdapter {
  let counter = 100;
  return {
    createTicket: vi.fn(async (): Promise<Result<ExternalTicket>> => {
      counter++;
      return Ok({
        externalId: `github:o/r#${counter}`,
        url: `https://github.com/o/r/issues/${counter}`,
      });
    }),
    updateTicket: vi.fn(
      async (id: string): Promise<Result<ExternalTicket>> =>
        Ok({ externalId: id, url: `https://github.com/o/r/issues/1` })
    ),
    fetchTicketState: vi.fn(async () => Ok(ticket())),
    fetchAllTickets: vi.fn(async () => Ok(tickets)),
    assignTicket: vi.fn(async () => Ok(undefined)),
    addComment: vi.fn(async () => Ok(undefined)),
    fetchComments: vi.fn(async () => Ok([])),
  } as unknown as TrackerSyncAdapter;
}

let cwd: string;
let shardDir: string;

/** Write a shard set. Called per test so each can choose its own roadmap shape. */
function writeShards(features: RoadmapFeature[]): void {
  fs.rmSync(shardDir, { recursive: true, force: true });
  fs.mkdirSync(shardDir, { recursive: true });
  features.forEach((f, i) => {
    const slug = f.name.toLowerCase().replace(/\s+/g, '-');
    fs.writeFileSync(path.join(shardDir, `${slug}.md`), serializeShard(shard(slug, i, f)));
  });
  fs.writeFileSync(path.join(shardDir, '_meta.md'), serializeMeta(META));
}

beforeEach(() => {
  cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'roadmap-sync-'));
  shardDir = path.join(cwd, 'docs', 'roadmap.d');
  writeShards([feature('Alpha', 'github:o/r#1'), feature('Beta', 'github:o/r#2')]);
});

afterEach(() => {
  fs.rmSync(cwd, { recursive: true, force: true });
});

describe('runRoadmapSync() — dry run is the default', () => {
  it('performs ZERO adapter writes without --apply', async () => {
    const adapter = spyAdapter([ticket(), ticket({ externalId: 'github:o/r#2', title: 'Beta' })]);

    const r = await runRoadmapSync({ cwd, adapter, config: trackerConfig() });

    expect(r.ok).toBe(true);
    expect(adapter.createTicket).not.toHaveBeenCalled();
    expect(adapter.updateTicket).not.toHaveBeenCalled();
    expect(adapter.assignTicket).not.toHaveBeenCalled();
    expect(r.report!.mode).toBe('dry-run');
    expect(r.report!.pushed).toEqual({ created: [], updated: [] });
  });

  it('leaves the roadmap shards byte-identical without --apply', async () => {
    const before = fs.readFileSync(path.join(shardDir, 'alpha.md'), 'utf-8');
    // The tracker says closed, which WOULD flip Alpha to done locally.
    const adapter = spyAdapter([ticket({ status: 'closed' })]);

    const r = await runRoadmapSync({ cwd, adapter, config: trackerConfig() });

    expect(r.ok).toBe(true);
    expect(fs.readFileSync(path.join(shardDir, 'alpha.md'), 'utf-8')).toBe(before);
    expect(r.report!.pulled.localWrites).toContain('Alpha');
  });

  it('still reports the writes it would have made', async () => {
    writeShards([feature('Alpha', null)]);
    const adapter = spyAdapter([ticket({ externalId: 'github:o/r#9', title: 'Unrelated' })]);

    const r = await runRoadmapSync({ cwd, adapter, config: trackerConfig() });

    expect(r.ok).toBe(true);
    expect(r.report!.planned.creates).toEqual([{ feature: 'Alpha', milestone: 'MVP Release' }]);
  });

  it('writes when --apply is passed', async () => {
    const adapter = spyAdapter([ticket(), ticket({ externalId: 'github:o/r#2', title: 'Beta' })]);

    const r = await runRoadmapSync({ cwd, adapter, config: trackerConfig(), apply: true });

    expect(r.ok).toBe(true);
    expect(adapter.updateTicket).toHaveBeenCalledTimes(2);
    expect(r.report!.mode).toBe('apply');
    expect(r.report!.pushed.updated).toEqual(['github:o/r#1', 'github:o/r#2']);
  });
});

describe('runRoadmapSync() — --no-state-change', () => {
  it('hands the adapter a write policy that forbids state changes', async () => {
    writeShards([feature('Alpha', 'github:o/r#1', { status: 'done' })]);
    const adapter = spyAdapter([ticket({ status: 'open' })]);

    const r = await runRoadmapSync({
      cwd,
      adapter,
      config: trackerConfig(),
      apply: true,
      syncIssueState: false,
    });

    expect(r.ok).toBe(true);
    const call = vi.mocked(adapter.updateTicket).mock.calls[0]!;
    expect(call[3]).toEqual({ syncIssueState: false });
  });

  it('reports the issue closure it suppressed', async () => {
    writeShards([feature('Alpha', 'github:o/r#1', { status: 'done' })]);
    const adapter = spyAdapter([ticket({ status: 'open' })]);

    const r = await runRoadmapSync({
      cwd,
      adapter,
      config: trackerConfig(),
      apply: true,
      syncIssueState: false,
    });

    expect(r.report!.skipped.stateChanges).toEqual([
      { externalId: 'github:o/r#1', from: 'open', to: 'closed' },
    ]);
    expect(r.report!.guards.syncIssueState).toBe(false);
  });
});

describe('runRoadmapSync() — --no-create', () => {
  it('skips creation and reports each skipped row', async () => {
    writeShards([feature('Alpha', null), feature('Beta', 'github:o/r#2')]);
    const adapter = spyAdapter([ticket({ externalId: 'github:o/r#2', title: 'Beta' })]);

    const r = await runRoadmapSync({
      cwd,
      adapter,
      config: trackerConfig(),
      apply: true,
      allowCreate: false,
    });

    expect(r.ok).toBe(true);
    expect(adapter.createTicket).not.toHaveBeenCalled();
    expect(r.report!.skipped.creates).toEqual([
      { feature: 'Alpha', milestone: 'MVP Release', reason: 'create-disabled' },
    ]);
    expect(r.report!.guards.allowCreate).toBe(false);
    // The linked row is still patched.
    expect(r.report!.pushed.updated).toEqual(['github:o/r#2']);
  });

  it('creates by default (guard omitted)', async () => {
    writeShards([feature('Alpha', null)]);
    const adapter = spyAdapter([ticket({ externalId: 'github:o/r#9', title: 'Unrelated' })]);

    const r = await runRoadmapSync({ cwd, adapter, config: trackerConfig(), apply: true });

    expect(r.ok).toBe(true);
    expect(adapter.createTicket).toHaveBeenCalledOnce();
    expect(r.report!.guards.allowCreate).toBe(true);
  });
});

describe('runRoadmapSync() — zero denominator', () => {
  it('exits ZERO_DENOMINATOR when zero tickets are fetched', async () => {
    const adapter = spyAdapter([]);

    const r = await runRoadmapSync({ cwd, adapter, config: trackerConfig() });

    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.exitCode).toBe(ExitCode.ZERO_DENOMINATOR);
      expect(r.error.exitCode).not.toBe(ExitCode.SUCCESS);
      expect(r.error.message).toMatch(/ZERO DENOMINATOR/);
      expect(r.error.message).toMatch(/abstention, not a pass/i);
    }
    // The report is still returned so the operator sees the denominator.
    expect(r.report!.examined).toEqual({ roadmapRows: 2, ticketsFetched: 0 });
  });

  it('exits ZERO_DENOMINATOR when zero roadmap rows are parsed', async () => {
    writeShards([]);
    const adapter = spyAdapter([ticket()]);

    const r = await runRoadmapSync({ cwd, adapter, config: trackerConfig() });

    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.exitCode).toBe(ExitCode.ZERO_DENOMINATOR);
      expect(r.error.message).toMatch(/0 roadmap rows/);
    }
  });

  it('distinguishes a FAILED fetch (exit ERROR) from an empty one (exit ZERO_DENOMINATOR)', async () => {
    const adapter = spyAdapter([]);
    vi.mocked(adapter.fetchAllTickets).mockResolvedValue({
      ok: false,
      error: new Error('403 rate limited'),
    });

    const r = await runRoadmapSync({ cwd, adapter, config: trackerConfig() });

    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.exitCode).toBe(ExitCode.ERROR);
      expect(r.error.message).toMatch(/fetch failed/i);
    }
    expect(r.report!.examined.ticketsFetched).toBeNull();
  });

  it('exits 0 only when something was actually examined', async () => {
    const adapter = spyAdapter([ticket()]);
    const r = await runRoadmapSync({ cwd, adapter, config: trackerConfig() });
    expect(r.ok).toBe(true);
    expect(r.report!.examined.roadmapRows).toBeGreaterThan(0);
    expect(r.report!.examined.ticketsFetched).toBeGreaterThan(0);
  });
});

describe('runRoadmapSync() — misconfiguration fails loudly', () => {
  it('errors (never exits 0) when no tracker is configured', async () => {
    const r = await runRoadmapSync({ cwd, adapter: spyAdapter([ticket()]) });

    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.exitCode).toBe(ExitCode.ERROR);
      expect(r.error.message).toMatch(/roadmap\.tracker/);
    }
  });

  it('errors when the tracker config has no repo', async () => {
    const config = trackerConfig();
    delete (config as { repo?: string }).repo;

    const r = await runRoadmapSync({ cwd, adapter: spyAdapter([ticket()]), config });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toMatch(/repo/);
  });

  it('errors when there is no roadmap source at all', async () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'roadmap-sync-empty-'));
    try {
      const r = await runRoadmapSync({ cwd: empty, config: trackerConfig() });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.message).toMatch(/No roadmap found/);
    } finally {
      fs.rmSync(empty, { recursive: true, force: true });
    }
  });

  it('exits non-zero when the sync reports per-feature errors', async () => {
    const adapter = spyAdapter([ticket()]);
    vi.mocked(adapter.updateTicket).mockResolvedValue({
      ok: false,
      error: new Error('422 unprocessable'),
    });

    const r = await runRoadmapSync({ cwd, adapter, config: trackerConfig(), apply: true });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.exitCode).toBe(ExitCode.ERROR);
    expect(r.report!.errors.length).toBeGreaterThan(0);
  });
});

describe('runRoadmapSync() — report shape (--json)', () => {
  it('emits every key a consumer needs, including the denominator', async () => {
    const adapter = spyAdapter([ticket()]);

    const r = await runRoadmapSync({ cwd, adapter, config: trackerConfig(), json: true });

    expect(r.ok).toBe(true);
    const report = r.report!;
    expect(Object.keys(report).sort()).toEqual(
      ['errors', 'examined', 'guards', 'mode', 'planned', 'pulled', 'pushed', 'skipped'].sort()
    );
    expect(report.guards).toEqual({ allowCreate: true, syncIssueState: true, forceSync: false });
    expect(report.examined).toEqual({ roadmapRows: 2, ticketsFetched: 1 });
    expect(report.errors).toEqual([]);
    // JSON-serializable: Errors are flattened to message strings.
    expect(() => JSON.stringify(report)).not.toThrow();
  });

  it('echoes forceSync in the report so an unattended run is auditable', async () => {
    const adapter = spyAdapter([ticket()]);
    const r = await runRoadmapSync({ cwd, adapter, config: trackerConfig(), force: true });
    expect(r.report!.guards.forceSync).toBe(true);
  });
});

describe('runRoadmapSync() — guard defaults are pass-through', () => {
  it('passes dryRun/allowCreate/syncIssueState/forceSync explicitly to the sync', async () => {
    const syncFn = vi.fn(async () => ({
      created: [],
      updated: ['github:o/r#1'],
      assignmentChanges: [],
      errors: [],
      dryRun: false,
      planned: { creates: [], updates: [], localWrites: [] },
      skippedCreates: [],
      skippedStateChanges: [],
      examined: { roadmapRows: 2, ticketsFetched: 1 },
    }));

    await runRoadmapSync({
      cwd,
      config: trackerConfig(),
      adapter: spyAdapter([]),
      syncFn,
      apply: true,
    });

    expect(syncFn).toHaveBeenCalledWith(cwd, expect.anything(), expect.anything(), {
      dryRun: false,
      allowCreate: true,
      syncIssueState: true,
      forceSync: false,
    });
  });
});
