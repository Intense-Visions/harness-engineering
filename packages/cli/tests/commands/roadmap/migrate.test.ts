import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Ok } from '@harness-engineering/core';
import type {
  RoadmapTrackerClient,
  TrackedFeature,
  NewFeatureInput,
} from '@harness-engineering/core';
import {
  runRoadmapMigrate,
  reportToExitCode,
  MigrateExitCode,
  featuresToRoadmap,
} from '../../../src/commands/roadmap/migrate';

function baseFeature(name: string, externalId: string): TrackedFeature {
  return {
    externalId,
    name,
    status: 'backlog',
    summary: `${name} summary`,
    spec: null,
    plans: [],
    blockedBy: [],
    assignee: null,
    priority: null,
    milestone: null,
    createdAt: '2026-05-09T00:00:00Z',
    updatedAt: null,
  };
}

function happyClient(): RoadmapTrackerClient {
  let n = 0;
  return {
    fetchAll: async () => Ok({ features: [] as TrackedFeature[], etag: null }),
    fetchById: async () => Ok(null),
    fetchByStatus: async () => Ok([]),
    create: async (input: NewFeatureInput) => {
      n++;
      return Ok(baseFeature(input.name, `github:o/r#${n}`));
    },
    update: async (id) => Ok(baseFeature('x', id)),
    claim: async (id) => Ok(baseFeature('x', id)),
    release: async (id) => Ok(baseFeature('x', id)),
    complete: async (id) => Ok(baseFeature('x', id)),
    appendHistory: async () => Ok(undefined),
    fetchHistory: async () => Ok([]),
  };
}

function featureClient(features: TrackedFeature[]): RoadmapTrackerClient {
  return { ...happyClient(), fetchAll: async () => Ok({ features, etag: null }) };
}

function throwingClient(): RoadmapTrackerClient {
  const fail = (msg: string) => {
    throw new Error(`tracker write should not be invoked in dry-run: ${msg}`);
  };
  return {
    fetchAll: async () => Ok({ features: [] as TrackedFeature[], etag: null }),
    fetchById: async () => Ok(null),
    fetchByStatus: async () => Ok([]),
    create: async () => fail('create'),
    update: async () => fail('update'),
    claim: async () => fail('claim'),
    release: async () => fail('release'),
    complete: async () => fail('complete'),
    appendHistory: async () => fail('appendHistory'),
    fetchHistory: async () => Ok([]),
  };
}

const ROADMAP_MD = `---
project: test
version: 1
last_synced: 2026-05-09T00:00:00Z
last_manual_edit: 2026-05-09T00:00:00Z
---

# Roadmap

## Backlog

### Foo

- **Status:** backlog
- **Spec:** —
- **Summary:** Foo summary
- **Blockers:** —
- **Plan:** —
`;

function makeProject(
  opts: { mode?: 'file-backed' | 'file-less'; withRoadmap?: boolean } = {}
): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-migrate-'));
  fs.mkdirSync(path.join(dir, 'docs'));
  if (opts.withRoadmap !== false) {
    fs.writeFileSync(path.join(dir, 'docs', 'roadmap.md'), ROADMAP_MD);
  }
  const cfg: Record<string, unknown> = {
    docsDir: 'docs',
    roadmap: { tracker: { kind: 'github', repo: 'o/r' } },
  };
  if (opts.mode === 'file-less') {
    (cfg.roadmap as Record<string, unknown>).mode = 'file-less';
  }
  fs.writeFileSync(path.join(dir, 'harness.config.json'), JSON.stringify(cfg, null, 2));
  return dir;
}

describe('runRoadmapMigrate', () => {
  let cwd: string;

  beforeEach(() => {
    cwd = '';
  });

  afterEach(() => {
    if (cwd) fs.rmSync(cwd, { recursive: true, force: true });
    cwd = '';
  });

  it('--to=file-less --dry-run prints the plan and writes nothing', async () => {
    cwd = makeProject();
    const result = await runRoadmapMigrate({
      to: 'file-less',
      dryRun: true,
      cwd,
      client: throwingClient(),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.mode).toBe('dry-run');
    // No archive, no backup.
    expect(fs.existsSync(path.join(cwd, 'docs', 'roadmap.md'))).toBe(true);
    expect(fs.existsSync(path.join(cwd, 'docs', 'roadmap.md.archived'))).toBe(false);
    expect(fs.existsSync(path.join(cwd, 'harness.config.json.pre-migration'))).toBe(false);
  });

  it('--to=file-less runs full migration on the happy fixture', async () => {
    cwd = makeProject();
    const result = await runRoadmapMigrate({
      to: 'file-less',
      dryRun: false,
      cwd,
      client: happyClient(),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.mode).toBe('applied');
    expect(fs.existsSync(path.join(cwd, 'docs', 'roadmap.md.archived'))).toBe(true);
    expect(fs.existsSync(path.join(cwd, 'docs', 'roadmap.md'))).toBe(false);
    const cfg = JSON.parse(fs.readFileSync(path.join(cwd, 'harness.config.json'), 'utf-8'));
    expect(cfg.roadmap.mode).toBe('file-less');
    expect(fs.existsSync(path.join(cwd, 'harness.config.json.pre-migration'))).toBe(true);
  });

  it('already-migrated short-circuit', async () => {
    cwd = makeProject({ mode: 'file-less' });
    const result = await runRoadmapMigrate({
      to: 'file-less',
      dryRun: false,
      cwd,
      client: throwingClient(),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.mode).toBe('already-migrated');
    // Roadmap.md untouched.
    expect(fs.existsSync(path.join(cwd, 'docs', 'roadmap.md'))).toBe(true);
  });

  it("no tracker configured → exit non-zero with the loader's message", async () => {
    cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-migrate-notracker-'));
    fs.mkdirSync(path.join(cwd, 'docs'));
    fs.writeFileSync(path.join(cwd, 'docs', 'roadmap.md'), ROADMAP_MD);
    fs.writeFileSync(
      path.join(cwd, 'harness.config.json'),
      JSON.stringify({ docsDir: 'docs' }, null, 2)
    );
    const result = await runRoadmapMigrate({
      to: 'file-less',
      dryRun: false,
      cwd,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toMatch(/tracker config missing/i);
  });

  it('missing --to argument → exit non-zero with usage error', async () => {
    cwd = makeProject();
    const result = await runRoadmapMigrate({
      // Force missing --to via empty string (commander would catch it earlier,
      // but the underlying runner must still reject).
      to: '',
      dryRun: false,
      cwd,
      client: happyClient(),
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toMatch(/--to/i);
  });

  it('--to=anything-else → exit non-zero with `unsupported target`', async () => {
    cwd = makeProject();
    const result = await runRoadmapMigrate({
      to: 'sqlite',
      dryRun: false,
      cwd,
      client: happyClient(),
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toMatch(/unsupported (migration )?target/i);
  });

  it('REV-P5-S2: --format=json suppresses human summary and emits a single JSON object on stdout', async () => {
    cwd = makeProject();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const result = await runRoadmapMigrate({
        to: 'file-less',
        dryRun: true,
        cwd,
        format: 'json',
        client: throwingClient(),
      });
      expect(result.ok).toBe(true);
      // Exactly one console.log call — the JSON object.
      expect(logSpy).toHaveBeenCalledTimes(1);
      const payload = JSON.parse(logSpy.mock.calls[0]?.[0] as string) as {
        ok: boolean;
        mode: string;
        exitCode: number;
        plan?: { toCreate: Array<{ name: string }>; ambiguous: unknown[] };
        report?: { mode: string };
      };
      expect(payload.ok).toBe(true);
      expect(payload.mode).toBe('dry-run');
      expect(payload.exitCode).toBe(MigrateExitCode.SUCCESS);
      expect(payload.plan).toBeDefined();
      expect(payload.plan?.toCreate.length).toBeGreaterThan(0);
      expect(payload.plan?.ambiguous).toEqual([]);
      expect(payload.report?.mode).toBe('dry-run');
    } finally {
      logSpy.mockRestore();
    }
  });

  it('REV-P5-S2: --format=json for already-migrated short-circuit emits JSON', async () => {
    cwd = makeProject({ mode: 'file-less' });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const result = await runRoadmapMigrate({
        to: 'file-less',
        dryRun: false,
        cwd,
        format: 'json',
        client: throwingClient(),
      });
      expect(result.ok).toBe(true);
      expect(logSpy).toHaveBeenCalledTimes(1);
      const payload = JSON.parse(logSpy.mock.calls[0]?.[0] as string) as {
        mode: string;
        exitCode: number;
      };
      expect(payload.mode).toBe('already-migrated');
      expect(payload.exitCode).toBe(MigrateExitCode.SUCCESS);
    } finally {
      logSpy.mockRestore();
    }
  });

  describe('REV-P5-S3: reportToExitCode classifies abortReason', () => {
    it('mode=applied → SUCCESS (0)', () => {
      expect(
        reportToExitCode({
          mode: 'applied',
          created: 1,
          updated: 0,
          unchanged: 0,
          historyAppended: 0,
          archivedFrom: null,
          archivedTo: null,
          configBackup: null,
        })
      ).toBe(MigrateExitCode.SUCCESS);
    });

    it('mode=dry-run → SUCCESS (0)', () => {
      expect(
        reportToExitCode({
          mode: 'dry-run',
          created: 0,
          updated: 0,
          unchanged: 0,
          historyAppended: 0,
          archivedFrom: null,
          archivedTo: null,
          configBackup: null,
        })
      ).toBe(MigrateExitCode.SUCCESS);
    });

    it('mode=already-migrated → SUCCESS (0)', () => {
      expect(
        reportToExitCode({
          mode: 'already-migrated',
          created: 0,
          updated: 0,
          unchanged: 0,
          historyAppended: 0,
          archivedFrom: null,
          archivedTo: null,
          configBackup: null,
        })
      ).toBe(MigrateExitCode.SUCCESS);
    });

    it('ambiguous → AMBIGUOUS (2)', () => {
      expect(
        reportToExitCode({
          mode: 'aborted',
          abortReason: 'ambiguous features (title-collision or dangling external-id): Foo',
          created: 0,
          updated: 0,
          unchanged: 0,
          historyAppended: 0,
          archivedFrom: null,
          archivedTo: null,
          configBackup: null,
        })
      ).toBe(MigrateExitCode.AMBIGUOUS);
    });

    it('archive-collision → ARCHIVE_COLLISION (3)', () => {
      expect(
        reportToExitCode({
          mode: 'aborted',
          abortReason: 'archive-collision: docs/roadmap.md.archived already exists; refusing',
          created: 0,
          updated: 0,
          unchanged: 0,
          historyAppended: 0,
          archivedFrom: null,
          archivedTo: null,
          configBackup: null,
        })
      ).toBe(MigrateExitCode.ARCHIVE_COLLISION);
    });

    it('config rewrite failed → CONFIG_ERROR (4)', () => {
      expect(
        reportToExitCode({
          mode: 'aborted',
          abortReason: 'config rewrite failed: harness.config.json not found',
          created: 0,
          updated: 0,
          unchanged: 0,
          historyAppended: 0,
          archivedFrom: null,
          archivedTo: null,
          configBackup: null,
        })
      ).toBe(MigrateExitCode.CONFIG_ERROR);
    });

    it('create failed WITH createdSoFar → PARTIAL_CREATE (5)', () => {
      expect(
        reportToExitCode({
          mode: 'aborted',
          abortReason: 'create failed for "Charlie": rate limit',
          createdSoFar: [{ name: 'Alpha', externalId: 'github:o/r#1' }],
          created: 1,
          updated: 0,
          unchanged: 0,
          historyAppended: 0,
          archivedFrom: null,
          archivedTo: null,
          configBackup: null,
        })
      ).toBe(MigrateExitCode.PARTIAL_CREATE);
    });

    it('create failed WITHOUT createdSoFar (first create) → GENERIC_FAILURE (1)', () => {
      expect(
        reportToExitCode({
          mode: 'aborted',
          abortReason: 'create failed for "Alpha": auth',
          createdSoFar: [],
          created: 0,
          updated: 0,
          unchanged: 0,
          historyAppended: 0,
          archivedFrom: null,
          archivedTo: null,
          configBackup: null,
        })
      ).toBe(MigrateExitCode.GENERIC_FAILURE);
    });

    it('update failed → GENERIC_FAILURE (1)', () => {
      expect(
        reportToExitCode({
          mode: 'aborted',
          abortReason: 'update failed for "Alpha" (github:o/r#1): rate limit',
          created: 0,
          updated: 0,
          unchanged: 0,
          historyAppended: 0,
          archivedFrom: null,
          archivedTo: null,
          configBackup: null,
        })
      ).toBe(MigrateExitCode.GENERIC_FAILURE);
    });

    it('unknown abortReason → GENERIC_FAILURE (1)', () => {
      expect(
        reportToExitCode({
          mode: 'aborted',
          abortReason: 'something nobody anticipated',
          created: 0,
          updated: 0,
          unchanged: 0,
          historyAppended: 0,
          archivedFrom: null,
          archivedTo: null,
          configBackup: null,
        })
      ).toBe(MigrateExitCode.GENERIC_FAILURE);
    });
  });

  it('REV-P5-S7: refuses concurrent migrate when lockfile is held by a live process', async () => {
    cwd = makeProject();
    // Write a lockfile pointing at our own pid; runRoadmapMigrate must refuse.
    const harness = path.join(cwd, '.harness');
    fs.mkdirSync(harness, { recursive: true });
    fs.writeFileSync(
      path.join(harness, 'migrate.lock'),
      JSON.stringify({
        pid: process.pid,
        startedAt: new Date().toISOString(),
        hostname: 'test-host',
      })
    );
    const result = await runRoadmapMigrate({
      to: 'file-less',
      dryRun: true,
      cwd,
      client: throwingClient(),
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toMatch(/another migration is in progress/i);
    // Lockfile must still exist (we did not own it; we did not remove it).
    expect(fs.existsSync(path.join(harness, 'migrate.lock'))).toBe(true);
  });

  it('REV-P5-S7: removes the lockfile after a successful run (normal-cleanup)', async () => {
    cwd = makeProject();
    const result = await runRoadmapMigrate({
      to: 'file-less',
      dryRun: false,
      cwd,
      client: happyClient(),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.mode).toBe('applied');
    // Lockfile should be cleaned up.
    expect(fs.existsSync(path.join(cwd, '.harness', 'migrate.lock'))).toBe(false);
  });

  it('REV-P5-S7: removes the lockfile on dry-run too (finally always fires)', async () => {
    cwd = makeProject();
    const result = await runRoadmapMigrate({
      to: 'file-less',
      dryRun: true,
      cwd,
      client: throwingClient(),
    });
    expect(result.ok).toBe(true);
    expect(fs.existsSync(path.join(cwd, '.harness', 'migrate.lock'))).toBe(false);
  });
});

describe('runRoadmapMigrate --to=file-backed (reverse)', () => {
  let cwd: string;
  afterEach(() => {
    if (cwd) fs.rmSync(cwd, { recursive: true, force: true });
    cwd = '';
  });

  const feats = (): TrackedFeature[] => [
    { ...baseFeature('Alpha', 'github:o/r#1'), milestone: 'MVP', status: 'in-progress' },
    { ...baseFeature('Beta', 'github:o/r#2'), milestone: null },
  ];

  it('--dry-run reports dry-run and writes nothing (config stays file-less)', async () => {
    cwd = makeProject({ mode: 'file-less', withRoadmap: false });
    const result = await runRoadmapMigrate({
      to: 'file-backed',
      dryRun: true,
      cwd,
      client: featureClient(feats()),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.mode).toBe('dry-run');
    expect(fs.existsSync(path.join(cwd, 'docs', 'roadmap.md'))).toBe(false);
    const cfg = JSON.parse(fs.readFileSync(path.join(cwd, 'harness.config.json'), 'utf-8'));
    expect(cfg.roadmap.mode).toBe('file-less');
  });

  it('applied: writes a round-trippable roadmap.md, flips mode, backs up config', async () => {
    cwd = makeProject({ mode: 'file-less', withRoadmap: false });
    const result = await runRoadmapMigrate({
      to: 'file-backed',
      dryRun: false,
      cwd,
      client: featureClient(feats()),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.mode).toBe('applied');
    expect(result.value.created).toBe(2);

    const md = fs.readFileSync(path.join(cwd, 'docs', 'roadmap.md'), 'utf-8');
    expect(md).toContain('### Alpha');
    expect(md).toContain('### Beta');
    expect(md).toContain('## MVP');
    expect(md).toContain('## Backlog');

    const cfg = JSON.parse(fs.readFileSync(path.join(cwd, 'harness.config.json'), 'utf-8'));
    expect(cfg.roadmap.mode).toBe('file-backed');
    expect(fs.existsSync(path.join(cwd, 'harness.config.json.pre-migration'))).toBe(true);
    expect(result.value.configBackup).toContain('pre-migration');
  });

  it('already file-backed → already-migrated, no roadmap.md written', async () => {
    cwd = makeProject({ mode: 'file-backed', withRoadmap: false });
    const result = await runRoadmapMigrate({
      to: 'file-backed',
      dryRun: false,
      cwd,
      client: featureClient(feats()),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.mode).toBe('already-migrated');
    expect(fs.existsSync(path.join(cwd, 'docs', 'roadmap.md'))).toBe(false);
  });

  it('refuses to overwrite an existing docs/roadmap.md', async () => {
    cwd = makeProject({ mode: 'file-less', withRoadmap: true });
    const result = await runRoadmapMigrate({
      to: 'file-backed',
      dryRun: false,
      cwd,
      client: featureClient(feats()),
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toMatch(/already exists; refusing to overwrite/i);
  });
});

describe('featuresToRoadmap', () => {
  it('groups features by milestone with Backlog last and preserves data', () => {
    const rm = featuresToRoadmap(
      [
        { ...baseFeature('Alpha', 'x#1'), milestone: 'MVP' },
        { ...baseFeature('Beta', 'x#2'), milestone: null },
        { ...baseFeature('Gamma', 'x#3'), milestone: 'MVP' },
      ],
      'Proj',
      '2026-06-28T00:00:00Z'
    );
    expect(rm.milestones.map((m) => m.name)).toEqual(['MVP', 'Backlog']);
    expect(rm.milestones[0]?.features.map((f) => f.name)).toEqual(['Alpha', 'Gamma']);
    expect(rm.milestones[1]?.isBacklog).toBe(true);
    expect(rm.frontmatter.project).toBe('Proj');
    expect(rm.milestones[0]?.features[0]?.externalId).toBe('x#1');
  });
});
