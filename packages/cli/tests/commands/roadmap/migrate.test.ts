import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Ok } from '@harness-engineering/core';
import type {
  RoadmapTrackerClient,
  TrackedFeature,
  NewFeatureInput,
} from '@harness-engineering/core';
import { runRoadmapMigrate } from '../../../src/commands/roadmap/migrate';

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

  it('REV-P5-S5: --to=file-backed → recognized but not-yet-implemented error', async () => {
    // Future-proofing: reverse migration is a recognized direction but not
    // implemented in this release. The error must be specific (not the
    // generic "unsupported target") so operators can find tracking docs.
    cwd = makeProject();
    const result = await runRoadmapMigrate({
      to: 'file-backed',
      dryRun: false,
      cwd,
      client: happyClient(),
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toMatch(/reverse migration is not yet implemented/i);
    expect(result.error.message).not.toMatch(/unsupported (migration )?target/i);
  });
});
