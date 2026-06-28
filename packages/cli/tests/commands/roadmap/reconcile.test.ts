import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Ok, serializeShard, serializeMeta, resolveRoadmapStore } from '@harness-engineering/core';
import type {
  Shard,
  RoadmapMeta,
  RoadmapFeature,
  ExternalTicketState,
  TrackerSyncConfig,
  Result,
} from '@harness-engineering/core';
import { runRoadmapReconcile } from '../../../src/commands/roadmap/reconcile';

function trackerConfig(repo: string): TrackerSyncConfig {
  return { kind: 'github', repo, statusMap: {} as TrackerSyncConfig['statusMap'] };
}

let cwd: string;
let shardDir: string;

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
  externalId: string,
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

/** A fake adapter returning a fixed ticket set without any network call. */
function fakeAdapter(
  tickets: Array<{
    externalId: string;
    status: string;
    stateReason?: ExternalTicketState['stateReason'];
  }>,
  onFetch?: () => void
) {
  return {
    fetchAllTickets: async (): Promise<Result<ExternalTicketState[]>> => {
      onFetch?.();
      return Ok(
        tickets.map((t) => ({
          externalId: t.externalId,
          title: t.externalId,
          status: t.status,
          ...(t.stateReason ? { stateReason: t.stateReason } : {}),
          labels: [],
          assignee: null,
        }))
      );
    },
  };
}

async function statusOf(name: string): Promise<string | undefined> {
  const store = resolveRoadmapStore({ projectRoot: cwd });
  const loaded = await store.load();
  if (!loaded.ok) return undefined;
  for (const m of loaded.value.milestones) {
    const f = m.features.find((x) => x.name === name);
    if (f) return f.status;
  }
  return undefined;
}

beforeEach(() => {
  cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'roadmap-reconcile-'));
  shardDir = path.join(cwd, 'docs', 'roadmap.d');
  fs.mkdirSync(shardDir, { recursive: true });
  fs.writeFileSync(
    path.join(shardDir, 'alpha.md'),
    serializeShard(shard('alpha', 0, feature('Alpha', 'github:o/r#1')))
  );
  fs.writeFileSync(
    path.join(shardDir, 'beta.md'),
    serializeShard(shard('beta', 1, feature('Beta', 'github:o/r#2')))
  );
  fs.writeFileSync(path.join(shardDir, '_meta.md'), serializeMeta(META));
});

afterEach(() => {
  fs.rmSync(cwd, { recursive: true, force: true });
});

describe('runRoadmapReconcile() — offline mode', () => {
  it('flips only rows whose closed issue is in the fetched set', async () => {
    const adapter = fakeAdapter([
      { externalId: 'github:o/r#1', status: 'closed' },
      { externalId: 'github:o/r#2', status: 'open' },
    ]);
    const r = await runRoadmapReconcile({ cwd, adapter });
    expect(r.ok).toBe(true);
    expect(await statusOf('Alpha')).toBe('done');
    expect(await statusOf('Beta')).toBe('planned');
  });

  it('is a no-op (exit 0) when no fetched ticket is closed', async () => {
    const adapter = fakeAdapter([
      { externalId: 'github:o/r#1', status: 'open' },
      { externalId: 'github:o/r#2', status: 'open' },
    ]);
    const r = await runRoadmapReconcile({ cwd, adapter });
    expect(r.ok).toBe(true);
    expect(await statusOf('Alpha')).toBe('planned');
    expect(await statusOf('Beta')).toBe('planned');
  });

  it('returns a CLIError (no throw) when no tracker is configured and no adapter is injected', async () => {
    const r = await runRoadmapReconcile({ cwd });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.exitCode).not.toBe(0);
      expect(r.error.message).toMatch(/tracker|config|token/i);
    }
  });

  it('does NOT flip a row whose issue was closed as not_planned (wontfix)', async () => {
    const adapter = fakeAdapter([
      { externalId: 'github:o/r#1', status: 'closed', stateReason: 'not_planned' },
    ]);
    const r = await runRoadmapReconcile({ cwd, adapter });
    expect(r.ok).toBe(true);
    expect(await statusOf('Alpha')).toBe('planned');
  });

  it('flips a row whose issue was closed as completed', async () => {
    const adapter = fakeAdapter([
      { externalId: 'github:o/r#1', status: 'closed', stateReason: 'completed' },
    ]);
    const r = await runRoadmapReconcile({ cwd, adapter });
    expect(r.ok).toBe(true);
    expect(await statusOf('Alpha')).toBe('done');
  });

  it('flips a closed issue with no reported state_reason (conservative back-compat)', async () => {
    const adapter = fakeAdapter([{ externalId: 'github:o/r#1', status: 'closed' }]);
    const r = await runRoadmapReconcile({ cwd, adapter });
    expect(r.ok).toBe(true);
    expect(await statusOf('Alpha')).toBe('done');
  });
});

describe('runRoadmapReconcile() — --from-refs cross-repo-safe path', () => {
  it('flips a row when the ref repo matches the linked External-ID', async () => {
    const r = await runRoadmapReconcile({ cwd, fromRefs: ['o/r#1'] });
    expect(r.ok).toBe(true);
    expect(await statusOf('Alpha')).toBe('done');
  });

  it('does NOT flip a local row when a colliding number closes in a DIFFERENT repo', async () => {
    // Alpha is linked to github:o/r#1; a closed issue other/repo#1 shares the
    // number but not the repo, so it must not map onto Alpha.
    const r = await runRoadmapReconcile({ cwd, fromRefs: ['other/repo#1'] });
    expect(r.ok).toBe(true);
    expect(await statusOf('Alpha')).toBe('planned');
  });

  it('rejects a malformed ref (missing owner/repo)', async () => {
    const r = await runRoadmapReconcile({ cwd, fromRefs: ['1'] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toMatch(/owner\/repo#number|invalid/i);
  });
});

describe('runRoadmapReconcile() — --from-issues authoritative path', () => {
  it('builds External-IDs from the configured repo and reconciles WITHOUT fetching', async () => {
    let fetched = false;
    const adapter = fakeAdapter([], () => {
      fetched = true;
    });
    const r = await runRoadmapReconcile({
      cwd,
      adapter,
      config: trackerConfig('o/r'),
      fromIssues: [1, 2],
    });
    expect(r.ok).toBe(true);
    expect(fetched).toBe(false); // authoritative path never calls the adapter
    expect(await statusOf('Alpha')).toBe('done');
    expect(await statusOf('Beta')).toBe('done');
  });

  it('reconciles exactly the requested issue numbers (others untouched)', async () => {
    const r = await runRoadmapReconcile({ cwd, config: trackerConfig('o/r'), fromIssues: [1] });
    expect(r.ok).toBe(true);
    expect(await statusOf('Alpha')).toBe('done');
    expect(await statusOf('Beta')).toBe('planned');
  });

  it('errors when --from-issues is given but no repo is configured', async () => {
    const r = await runRoadmapReconcile({ cwd, fromIssues: [1] });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.exitCode).not.toBe(0);
      expect(r.error.message).toMatch(/repo/i);
    }
  });
});
