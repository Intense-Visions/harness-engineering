import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Ok, Err, serializeShard, serializeMeta } from '@harness-engineering/core';
import type {
  Shard,
  RoadmapMeta,
  RoadmapFeature,
  ExternalTicketState,
  TrackerSyncConfig,
  Result,
} from '@harness-engineering/core';
import {
  runRoadmapReconcile,
  createRoadmapReconcileCommand,
} from '../../../src/commands/roadmap/reconcile';

function trackerConfig(repo: string): TrackerSyncConfig {
  return { kind: 'github', repo, statusMap: {} as TrackerSyncConfig['statusMap'] };
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

function feature(name: string, externalId: string): RoadmapFeature {
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
  };
}

function shard(slug: string, order: number, feat: RoadmapFeature): Shard {
  return { slug, milestone: 'MVP Release', order, feature: feat };
}

let cwd: string;

beforeEach(() => {
  cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'reconcile-cov-'));
  const shardDir = path.join(cwd, 'docs', 'roadmap.d');
  fs.mkdirSync(shardDir, { recursive: true });
  fs.writeFileSync(
    path.join(shardDir, 'alpha.md'),
    serializeShard(shard('alpha', 0, feature('Alpha', 'github:o/r#1')))
  );
  fs.writeFileSync(path.join(shardDir, '_meta.md'), serializeMeta(META));
});

afterEach(() => {
  fs.rmSync(cwd, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe('runRoadmapReconcile — error paths', () => {
  it('returns a CLIError when there is no roadmap source at all', async () => {
    const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'reconcile-empty-'));
    try {
      const r = await runRoadmapReconcile({ cwd: bare });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.message).toMatch(/no roadmap found/i);
    } finally {
      fs.rmSync(bare, { recursive: true, force: true });
    }
  });

  it('surfaces an adapter fetch failure as a CLIError', async () => {
    const adapter = {
      fetchAllTickets: async (): Promise<Result<ExternalTicketState[]>> =>
        Err(new Error('boom-network')),
    };
    const r = await runRoadmapReconcile({ cwd, adapter });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toMatch(/boom-network/);
  });

  it('rejects a configured repo that is not owner/repo under --from-issues', async () => {
    const r = await runRoadmapReconcile({
      cwd,
      config: trackerConfig('noSlashRepo'),
      fromIssues: [1],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toMatch(/owner\/repo/i);
  });

  it('errors when GITHUB_TOKEN is absent and a real adapter would be needed', async () => {
    const prior = process.env.GITHUB_TOKEN;
    delete process.env.GITHUB_TOKEN;
    try {
      const r = await runRoadmapReconcile({ cwd, config: trackerConfig('o/r') });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.message).toMatch(/GITHUB_TOKEN/);
    } finally {
      if (prior !== undefined) process.env.GITHUB_TOKEN = prior;
    }
  });

  it('drops a closed-but-not_planned ticket from the flip set (offline gate)', async () => {
    const adapter = {
      fetchAllTickets: async (): Promise<Result<ExternalTicketState[]>> =>
        Ok([
          {
            externalId: 'github:o/r#1',
            title: 'Alpha',
            status: 'closed',
            stateReason: 'not_planned' as ExternalTicketState['stateReason'],
            labels: [],
            assignee: null,
          },
        ]),
    };
    const r = await runRoadmapReconcile({ cwd, adapter });
    expect(r.ok).toBe(true); // nothing flipped, still a success
  });
});

describe('createRoadmapReconcileCommand', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errSpy: ReturnType<typeof vi.spyOn>;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(((): never => {
      throw new Error('process.exit called');
    }) as never);
  });

  it('exits when --from-refs is provided but contains no valid references', async () => {
    const cmd = createRoadmapReconcileCommand();
    await expect(
      cmd.parseAsync(['--cwd', cwd, '--from-refs', ' , '], { from: 'user' })
    ).rejects.toThrow('process.exit called');
    expect(errSpy).toHaveBeenCalled();
  });

  it('exits when --from-issues is provided but contains no valid integers', async () => {
    const cmd = createRoadmapReconcileCommand();
    await expect(
      cmd.parseAsync(['--cwd', cwd, '--from-issues', 'abc,xyz'], { from: 'user' })
    ).rejects.toThrow('process.exit called');
    expect(errSpy).toHaveBeenCalled();
  });

  it('reconciles via --from-refs and completes without exiting on the error path', async () => {
    const cmd = createRoadmapReconcileCommand();
    // A valid ref for the linked row flips Alpha to done and returns ok (no exit).
    await cmd.parseAsync(['--cwd', cwd, '--from-refs', 'o/r#1'], { from: 'user' });
    expect(exitSpy).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalled();
  });

  it('exits with the error code when reconcile fails (bad --cwd, no roadmap)', async () => {
    const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'reconcile-cmd-empty-'));
    try {
      const cmd = createRoadmapReconcileCommand();
      await expect(
        cmd.parseAsync(['--cwd', bare, '--from-refs', 'o/r#1'], { from: 'user' })
      ).rejects.toThrow('process.exit called');
      expect(errSpy).toHaveBeenCalled();
    } finally {
      fs.rmSync(bare, { recursive: true, force: true });
    }
  });
});
