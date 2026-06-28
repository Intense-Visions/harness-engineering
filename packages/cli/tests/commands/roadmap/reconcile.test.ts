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
  Result,
} from '@harness-engineering/core';
import { runRoadmapReconcile } from '../../../src/commands/roadmap/reconcile';

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
function fakeAdapter(tickets: Array<{ externalId: string; status: string }>, onFetch?: () => void) {
  return {
    fetchAllTickets: async (): Promise<Result<ExternalTicketState[]>> => {
      onFetch?.();
      return Ok(
        tickets.map((t) => ({
          externalId: t.externalId,
          title: t.externalId,
          status: t.status,
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
});
