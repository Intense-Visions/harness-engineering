import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { Ok } from '@harness-engineering/types';
import { buildMigrationPlan } from '../../../src/roadmap/migrate/plan-builder';
import { runMigrationPlan } from '../../../src/roadmap/migrate/run';
import type { RunDeps } from '../../../src/roadmap/migrate/run';
import { serializeBodyBlock } from '../../../src/roadmap/tracker/body-metadata';
import type {
  Roadmap,
  RoadmapFeature,
  RoadmapMilestone,
  RoadmapFrontmatter,
} from '@harness-engineering/types';
import type { RoadmapTrackerClient, TrackedFeature } from '../../../src/roadmap/tracker';

const FRONTMATTER: RoadmapFrontmatter = {
  project: 'test',
  version: 1,
  lastSynced: '2026-05-09T00:00:00Z',
  lastManualEdit: '2026-05-09T00:00:00Z',
};

function makeFeature(name: string, externalId: string, spec: string): RoadmapFeature {
  return {
    name,
    status: 'backlog',
    spec,
    plans: [],
    blockedBy: [],
    summary: `${name} summary`,
    assignee: null,
    priority: null,
    externalId,
    updatedAt: null,
  };
}

function makeRoadmap(features: RoadmapFeature[]): Roadmap {
  const milestone: RoadmapMilestone = {
    name: 'Backlog',
    isBacklog: true,
    features,
  };
  return {
    frontmatter: FRONTMATTER,
    milestones: [milestone],
    assignmentHistory: [],
  };
}

function makeTracked(name: string, externalId: string): TrackedFeature {
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

function makeClient(trackerFeatures: TrackedFeature[]): {
  client: RoadmapTrackerClient;
  callCounts: { create: number; update: number; appendHistory: number };
} {
  const callCounts = { create: 0, update: 0, appendHistory: 0 };
  const client: RoadmapTrackerClient = {
    fetchAll: async () => Ok({ features: trackerFeatures, etag: null }),
    fetchById: async () => Ok(null),
    fetchByStatus: async () => Ok([]),
    create: async (input) => {
      callCounts.create++;
      return Ok({
        externalId: `github:o/r#${callCounts.create}`,
        name: input.name,
        status: 'backlog',
        summary: input.summary,
        spec: null,
        plans: [],
        blockedBy: [],
        assignee: null,
        priority: null,
        milestone: null,
        createdAt: '2026-05-09T00:00:00Z',
        updatedAt: null,
      });
    },
    update: async (id) => {
      callCounts.update++;
      return Ok(trackerFeatures.find((f) => f.externalId === id) ?? trackerFeatures[0]!);
    },
    claim: async () => Ok(trackerFeatures[0]!),
    release: async () => Ok(trackerFeatures[0]!),
    complete: async () => Ok(trackerFeatures[0]!),
    appendHistory: async () => {
      callCounts.appendHistory++;
      return Ok(undefined);
    },
    fetchHistory: async () => Ok([]),
  };
  return { client, callCounts };
}

function tmpRoot(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'migrate-idem-'));
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

describe('migration: idempotent re-run', () => {
  it('all three features already have matching bodies → unchanged === 3; no client writes; archive + config still happen', async () => {
    const roadmap = makeRoadmap([
      makeFeature('A', 'github:o/r#1', 'a.md'),
      makeFeature('B', 'github:o/r#2', 'b.md'),
      makeFeature('C', 'github:o/r#3', 'c.md'),
    ]);
    const tracked = [
      makeTracked('A', 'github:o/r#1'),
      makeTracked('B', 'github:o/r#2'),
      makeTracked('C', 'github:o/r#3'),
    ];
    const bodies = new Map<string, string>([
      ['github:o/r#1', serializeBodyBlock('A summary', { spec: 'a.md' })],
      ['github:o/r#2', serializeBodyBlock('B summary', { spec: 'b.md' })],
      ['github:o/r#3', serializeBodyBlock('C summary', { spec: 'c.md' })],
    ]);

    const plan = await buildMigrationPlan(
      roadmap,
      tracked,
      async () => new Set<string>(),
      async (id) => bodies.get(id) ?? null
    );
    expect(plan.unchanged).toHaveLength(3);
    expect(plan.toCreate).toEqual([]);
    expect(plan.toUpdate).toEqual([]);

    const projectRoot = tmpRoot();
    const { client, callCounts } = makeClient(tracked);
    const result = await runMigrationPlan(plan, makeDeps(client), {
      projectRoot,
      dryRun: false,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(callCounts.create).toBe(0);
    expect(callCounts.update).toBe(0);
    expect(callCounts.appendHistory).toBe(0);
    expect(result.value.mode).toBe('applied');
    expect(result.value.unchanged).toBe(3);
    expect(fs.existsSync(path.join(projectRoot, 'docs', 'roadmap.md.archived'))).toBe(true);
    const cfg = JSON.parse(fs.readFileSync(path.join(projectRoot, 'harness.config.json'), 'utf-8'));
    expect(cfg.roadmap.mode).toBe('file-less');
  });
});
