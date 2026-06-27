import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { serializeShard, serializeMeta, parseRoadmap } from '@harness-engineering/core';
import type { Shard, RoadmapMeta } from '@harness-engineering/core';
import { runRoadmapRegen } from '../../../src/commands/roadmap/regen';

let cwd: string;
let shardDir: string;
let roadmapPath: string;

const META: RoadmapMeta = {
  frontmatter: {
    project: 'test',
    version: 1,
    lastSynced: '2026-05-09T00:00:00Z',
    lastManualEdit: '2026-05-09T00:00:00Z',
  },
  milestones: ['MVP Release', 'Backlog'],
};

const SHARD_A: Shard = {
  slug: 'alpha',
  milestone: 'MVP Release',
  order: 0,
  feature: {
    name: 'Alpha',
    status: 'planned',
    spec: null,
    plans: [],
    blockedBy: [],
    summary: 'Alpha summary',
    assignee: null,
    priority: 'P1',
    externalId: 'github:o/r#7',
    updatedAt: null,
  },
};

const SHARD_B: Shard = {
  slug: 'beta',
  milestone: 'Backlog',
  order: 0,
  feature: {
    name: 'Beta',
    status: 'backlog',
    spec: null,
    plans: [],
    blockedBy: [],
    summary: 'Beta summary',
    assignee: null,
    priority: null,
    externalId: null,
    updatedAt: null,
  },
};

beforeEach(() => {
  cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'roadmap-regen-'));
  shardDir = path.join(cwd, 'docs', 'roadmap.d');
  roadmapPath = path.join(cwd, 'docs', 'roadmap.md');
  fs.mkdirSync(shardDir, { recursive: true });
  fs.writeFileSync(path.join(shardDir, 'alpha.md'), serializeShard(SHARD_A));
  fs.writeFileSync(path.join(shardDir, 'beta.md'), serializeShard(SHARD_B));
  fs.writeFileSync(path.join(shardDir, '_meta.md'), serializeMeta(META));
});

afterEach(() => {
  fs.rmSync(cwd, { recursive: true, force: true });
});

describe('runRoadmapRegen()', () => {
  it('writes a parseable docs/roadmap.md from the shard directory', async () => {
    const r = await runRoadmapRegen({ cwd });
    expect(r.ok).toBe(true);
    const md = fs.readFileSync(roadmapPath, 'utf-8');
    const parsed = parseRoadmap(md);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value.milestones.map((m) => m.name)).toEqual(['MVP Release', 'Backlog']);
    }
  });

  it('is byte-stable: a second consecutive regen produces an identical file', async () => {
    await runRoadmapRegen({ cwd });
    const first = fs.readFileSync(roadmapPath, 'utf-8');
    await runRoadmapRegen({ cwd });
    const second = fs.readFileSync(roadmapPath, 'utf-8');
    expect(second).toBe(first);
  });

  it('errors when docs/roadmap.d is absent', async () => {
    fs.rmSync(shardDir, { recursive: true, force: true });
    const r = await runRoadmapRegen({ cwd });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toMatch(/roadmap\.d|not sharded|not found/i);
  });
});
