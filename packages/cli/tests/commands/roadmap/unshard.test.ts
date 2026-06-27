import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { serializeShard, serializeMeta, regenerate } from '@harness-engineering/core';
import type { Shard, RoadmapMeta } from '@harness-engineering/core';
import { runRoadmapUnshard } from '../../../src/commands/roadmap/unshard';
import { runRoadmapShard } from '../../../src/commands/roadmap/shard';
import { createNodeShardIO } from '../../../src/commands/roadmap/shard-io';

const META: RoadmapMeta = {
  frontmatter: {
    project: 'test',
    version: 1,
    lastSynced: '2026-05-09T00:00:00Z',
    lastManualEdit: '2026-05-09T00:00:00Z',
  },
  milestones: ['MVP Release', 'Backlog'],
  assignmentHistory: [
    { feature: 'Alpha', assignee: 'alice', action: 'assigned', date: '2026-01-02' },
  ],
};

const SHARD_A: Shard = {
  slug: 'alpha',
  milestone: 'MVP Release',
  order: 0,
  feature: {
    name: 'Alpha',
    status: 'in-progress',
    spec: null,
    plans: [],
    blockedBy: [],
    summary: 'Alpha summary',
    assignee: 'alice',
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

let cwd: string;
let shardDir: string;
let roadmapPath: string;

function seedShards() {
  fs.mkdirSync(shardDir, { recursive: true });
  fs.writeFileSync(path.join(shardDir, 'alpha.md'), serializeShard(SHARD_A));
  fs.writeFileSync(path.join(shardDir, 'beta.md'), serializeShard(SHARD_B));
  fs.writeFileSync(path.join(shardDir, '_meta.md'), serializeMeta(META));
}

beforeEach(() => {
  cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'roadmap-unshard-'));
  shardDir = path.join(cwd, 'docs', 'roadmap.d');
  roadmapPath = path.join(cwd, 'docs', 'roadmap.md');
  fs.mkdirSync(path.join(cwd, 'docs'), { recursive: true });
});

afterEach(() => {
  fs.rmSync(cwd, { recursive: true, force: true });
});

describe('runRoadmapUnshard()', () => {
  it('writes roadmap.md byte-identical to regenerate(shards) and removes the shard dir', async () => {
    seedShards();
    const expected = await regenerate(shardDir, createNodeShardIO());
    expect(expected.ok).toBe(true);

    const r = await runRoadmapUnshard({ cwd });
    expect(r.ok).toBe(true);
    if (expected.ok) {
      expect(fs.readFileSync(roadmapPath, 'utf-8')).toBe(expected.value);
    }
    expect(fs.existsSync(shardDir)).toBe(false);
  });

  it('refuses when docs/roadmap.d is absent', async () => {
    const r = await runRoadmapUnshard({ cwd });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toMatch(/roadmap\.d|nothing to unshard|not found/i);
  });

  it('reversibility: shard then unshard yields a roadmap.md byte-identical to the post-shard regen', async () => {
    // Start from a monolith, shard it, then unshard — the monolith returns to the
    // exact post-shard regenerated form (both are regen of the same shards).
    const ORIGINAL = `---
project: test
version: 1
last_synced: 2026-05-09T00:00:00Z
last_manual_edit: 2026-05-09T00:00:00Z
---

# Roadmap

## MVP Release

### Alpha

- **Status:** in-progress
- **Spec:** —
- **Summary:** Alpha summary
- **Blockers:** —
- **Plan:** —
- **Assignee:** alice
- **Priority:** P1
- **External-ID:** github:o/r#7

## Backlog

### Beta

- **Status:** backlog
- **Spec:** —
- **Summary:** Beta summary
- **Blockers:** —
- **Plan:** —
`;
    fs.writeFileSync(roadmapPath, ORIGINAL);
    await runRoadmapShard({ cwd });
    const afterShard = fs.readFileSync(roadmapPath, 'utf-8');

    await runRoadmapUnshard({ cwd });
    expect(fs.readFileSync(roadmapPath, 'utf-8')).toBe(afterShard);
    expect(fs.existsSync(shardDir)).toBe(false);
  });
});
