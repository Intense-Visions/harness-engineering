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
  runReverseMigrate,
  createRoadmapMigrateCommand,
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

function happyClient(features: TrackedFeature[] = []): RoadmapTrackerClient {
  let n = 0;
  return {
    fetchAll: async () => Ok({ features, etag: null }),
    fetchById: async () => Ok(null),
    fetchByStatus: async () => Ok([]),
    create: async (input: NewFeatureInput) => Ok(baseFeature(input.name, `github:o/r#${++n}`)),
    update: async (id) => Ok(baseFeature('x', id)),
    claim: async (id) => Ok(baseFeature('x', id)),
    release: async (id) => Ok(baseFeature('x', id)),
    complete: async (id) => Ok(baseFeature('x', id)),
    appendHistory: async () => Ok(undefined),
    fetchHistory: async () => Ok([]),
  };
}

let cwd: string;

beforeEach(() => {
  cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'rm-migrate-cov-'));
  fs.mkdirSync(path.join(cwd, 'docs'), { recursive: true });
  fs.writeFileSync(
    path.join(cwd, 'harness.config.json'),
    JSON.stringify({
      version: 1,
      name: 'MyProj',
      roadmap: { tracker: { kind: 'github', repo: 'o/r' } },
    })
  );
});

afterEach(() => {
  fs.rmSync(cwd, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe('runRoadmapMigrate — forward error paths', () => {
  it('errors when docs/roadmap.md is missing', async () => {
    const r = await runRoadmapMigrate({
      to: 'file-less',
      dryRun: true,
      cwd,
      client: happyClient(),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toMatch(/roadmap\.md not found/i);
  });

  it('errors when docs/roadmap.md fails to parse', async () => {
    fs.writeFileSync(path.join(cwd, 'docs', 'roadmap.md'), 'not a roadmap');
    const r = await runRoadmapMigrate({
      to: 'file-less',
      dryRun: true,
      cwd,
      client: happyClient(),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toMatch(/failed to parse/i);
  });

  it('rejects an unsupported target', async () => {
    const r = await runRoadmapMigrate({ to: 'sqlite', dryRun: true, cwd, client: happyClient() });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toMatch(/unsupported migration target/i);
  });

  it('errors on a missing --to argument', async () => {
    const r = await runRoadmapMigrate({ to: '', dryRun: true, cwd, client: happyClient() });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toMatch(/missing required argument/i);
  });
});

describe('runReverseMigrate', () => {
  it('refuses to overwrite an existing docs/roadmap.md', async () => {
    fs.writeFileSync(path.join(cwd, 'docs', 'roadmap.md'), '# stray\n');
    // Config is file-backed by default, so flip to file-less to reach the invariant check.
    fs.writeFileSync(
      path.join(cwd, 'harness.config.json'),
      JSON.stringify({
        version: 1,
        name: 'MyProj',
        roadmap: { mode: 'file-less', tracker: { kind: 'github', repo: 'o/r' } },
      })
    );
    const r = await runReverseMigrate({
      to: 'file-backed',
      dryRun: false,
      cwd,
      client: happyClient(),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toMatch(/refusing to overwrite/i);
  });

  it('dry-run reconstructs nothing but reports the plan (json format)', async () => {
    fs.writeFileSync(
      path.join(cwd, 'harness.config.json'),
      JSON.stringify({
        version: 1,
        name: 'MyProj',
        roadmap: { mode: 'file-less', tracker: { kind: 'github', repo: 'o/r' } },
      })
    );
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const r = await runReverseMigrate({
      to: 'file-backed',
      dryRun: true,
      cwd,
      format: 'json',
      client: happyClient([baseFeature('Foo', 'github:o/r#1')]),
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.mode).toBe('dry-run');
    // No roadmap.md written on dry-run.
    expect(fs.existsSync(path.join(cwd, 'docs', 'roadmap.md'))).toBe(false);
    expect(logSpy).toHaveBeenCalled();
  });

  it('applies the reverse migration: writes roadmap.md and flips mode to file-backed', async () => {
    fs.writeFileSync(
      path.join(cwd, 'harness.config.json'),
      JSON.stringify({
        version: 1,
        name: 'MyProj',
        roadmap: { mode: 'file-less', tracker: { kind: 'github', repo: 'o/r' } },
      })
    );
    const r = await runReverseMigrate({
      to: 'file-backed',
      dryRun: false,
      cwd,
      client: happyClient([baseFeature('Foo', 'github:o/r#1')]),
    });
    expect(r.ok).toBe(true);
    expect(fs.existsSync(path.join(cwd, 'docs', 'roadmap.md'))).toBe(true);
    const cfg = JSON.parse(fs.readFileSync(path.join(cwd, 'harness.config.json'), 'utf-8'));
    expect(cfg.roadmap.mode).toBe('file-backed');
    expect(fs.existsSync(path.join(cwd, 'harness.config.json.pre-migration'))).toBe(true);
  });
});

describe('createRoadmapMigrateCommand', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errSpy: ReturnType<typeof vi.spyOn>;
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let origCwd: string;

  beforeEach(() => {
    origCwd = process.cwd();
    process.chdir(cwd);
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(((): never => {
      throw new Error('process.exit called');
    }) as never);
  });

  afterEach(() => {
    process.chdir(origCwd);
  });

  it('already-migrated short-circuit exits SUCCESS (0)', async () => {
    // A file-less project migrating to file-less is an immediate no-op success.
    fs.writeFileSync(
      path.join(cwd, 'harness.config.json'),
      JSON.stringify({
        version: 1,
        name: 'MyProj',
        roadmap: { mode: 'file-less', tracker: { kind: 'github', repo: 'o/r' } },
      })
    );
    const cmd = createRoadmapMigrateCommand();
    await expect(cmd.parseAsync(['--to', 'file-less'], { from: 'user' })).rejects.toThrow(
      'process.exit called'
    );
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('pre-flight failure under --format json emits a JSON error object and CONFIG_ERROR exit (4)', async () => {
    const cmd = createRoadmapMigrateCommand();
    await expect(
      cmd.parseAsync(['--to', 'bogus', '--format', 'json'], { from: 'user' })
    ).rejects.toThrow('process.exit called');
    const printed = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(printed).toContain('"ok":false');
    expect(exitSpy).toHaveBeenCalledWith(4);
  });

  it('pre-flight failure in human format logs an error and exits non-zero', async () => {
    const cmd = createRoadmapMigrateCommand();
    await expect(cmd.parseAsync(['--to', 'bogus'], { from: 'user' })).rejects.toThrow(
      'process.exit called'
    );
    expect(errSpy).toHaveBeenCalled();
  });
});
