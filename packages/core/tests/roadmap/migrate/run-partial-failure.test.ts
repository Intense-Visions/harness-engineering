import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { runMigrationPlan } from '../../../src/roadmap/migrate/run';
import type { RunDeps } from '../../../src/roadmap/migrate/run';
import type { MigrationPlan } from '../../../src/roadmap/migrate/types';
import { Ok, Err } from '@harness-engineering/types';
import type {
  RoadmapTrackerClient,
  TrackedFeature,
  FeaturePatch,
} from '../../../src/roadmap/tracker';

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

function makeClient(): RoadmapTrackerClient {
  return {
    fetchAll: async () => Ok({ features: [], etag: null }),
    fetchById: async () => Ok(null),
    fetchByStatus: async () => Ok([]),
    create: async (input) => Ok(baseFeature(input.name, 'github:o/r#x')),
    update: async (id: string, _patch: FeaturePatch) => Err(new Error(`boom on update ${id}`)),
    claim: async () => Ok(baseFeature('x', 'github:o/r#x')),
    release: async () => Ok(baseFeature('x', 'github:o/r#x')),
    complete: async () => Ok(baseFeature('x', 'github:o/r#x')),
    appendHistory: async () => Ok(undefined),
    fetchHistory: async () => Ok([]),
  };
}

function tmpRoot(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'migrate-pf-'));
  fs.mkdirSync(path.join(dir, 'docs'));
  fs.writeFileSync(path.join(dir, 'docs', 'roadmap.md'), '# Roadmap\n');
  fs.writeFileSync(
    path.join(dir, 'harness.config.json'),
    JSON.stringify(
      { docsDir: 'docs', roadmap: { tracker: { kind: 'github', repo: 'o/r' } } },
      null,
      2
    )
  );
  return dir;
}

function makeDeps(client: RoadmapTrackerClient): RunDeps {
  return {
    client,
    readFile: (p) => fs.readFileSync(p, 'utf-8'),
    writeFile: (p, b) => fs.writeFileSync(p, b),
    renameFile: (from, to) => fs.renameSync(from, to),
    existsFile: (p) => fs.existsSync(p),
  };
}

describe('runMigrationPlan — partial failures and edge cases', () => {
  it('partial failure at step 4 (update): same invariants — abort before archive + config', async () => {
    const projectRoot = tmpRoot();
    const plan: MigrationPlan = {
      toCreate: [],
      toUpdate: [{ externalId: 'github:o/r#9', name: 'C', patch: { summary: 'C' }, diff: 'spec' }],
      unchanged: [],
      historyToAppend: [],
      ambiguous: [],
    };
    const result = await runMigrationPlan(plan, makeDeps(makeClient()), {
      projectRoot,
      dryRun: false,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.mode).toBe('aborted');
    expect(result.value.abortReason).toMatch(/update/i);
    expect(fs.existsSync(path.join(projectRoot, 'docs', 'roadmap.md'))).toBe(true);
    expect(fs.existsSync(path.join(projectRoot, 'docs', 'roadmap.md.archived'))).toBe(false);
    expect(fs.existsSync(path.join(projectRoot, 'harness.config.json.pre-migration'))).toBe(false);
  });

  it('archive collision: docs/roadmap.md.archived already exists → abort with archive-collision reason', async () => {
    const projectRoot = tmpRoot();
    fs.writeFileSync(path.join(projectRoot, 'docs', 'roadmap.md.archived'), '# old archive\n');

    const plan: MigrationPlan = {
      toCreate: [],
      toUpdate: [],
      unchanged: [],
      historyToAppend: [],
      ambiguous: [],
    };
    // Make sure the client never errs for non-archive reasons.
    const client: RoadmapTrackerClient = {
      fetchAll: async () => Ok({ features: [], etag: null }),
      fetchById: async () => Ok(null),
      fetchByStatus: async () => Ok([]),
      create: async (input) => Ok(baseFeature(input.name, 'github:o/r#x')),
      update: async () => Ok(baseFeature('x', 'github:o/r#x')),
      claim: async () => Ok(baseFeature('x', 'github:o/r#x')),
      release: async () => Ok(baseFeature('x', 'github:o/r#x')),
      complete: async () => Ok(baseFeature('x', 'github:o/r#x')),
      appendHistory: async () => Ok(undefined),
      fetchHistory: async () => Ok([]),
    };

    const result = await runMigrationPlan(plan, makeDeps(client), {
      projectRoot,
      dryRun: false,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.mode).toBe('aborted');
    expect(result.value.abortReason).toMatch(/archive-collision/i);
    // The pre-existing roadmap.md is NOT renamed.
    expect(fs.existsSync(path.join(projectRoot, 'docs', 'roadmap.md'))).toBe(true);
    expect(fs.existsSync(path.join(projectRoot, 'harness.config.json.pre-migration'))).toBe(false);
  });

  it('ambiguous entries abort the run with mode: "aborted"', async () => {
    const projectRoot = tmpRoot();
    const plan: MigrationPlan = {
      toCreate: [],
      toUpdate: [],
      unchanged: [],
      historyToAppend: [],
      ambiguous: [{ name: 'Foo', existingIssueRef: 'github:o/r#99' }],
    };
    const result = await runMigrationPlan(plan, makeDeps(makeClient()), {
      projectRoot,
      dryRun: false,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.mode).toBe('aborted');
    expect(result.value.abortReason).toMatch(/ambiguous/i);
    expect(fs.existsSync(path.join(projectRoot, 'docs', 'roadmap.md.archived'))).toBe(false);
    expect(fs.existsSync(path.join(projectRoot, 'harness.config.json.pre-migration'))).toBe(false);
  });
});
