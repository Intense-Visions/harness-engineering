/**
 * Phase 4: manage_roadmap in SHARDED mode (docs/roadmap.d/ present).
 *
 * Builds a real sharded project on disk from a fixture roadmap, then drives the
 * public handleManageRoadmap entry. Asserts store-parity reads and, per writer
 * migration, the single-shard write guarantee (a single-feature mutation rewrites
 * exactly its own shard — never another shard).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  parseRoadmap,
  roadmapToShards,
  serializeShard,
  serializeMeta,
} from '@harness-engineering/core';
import { handleManageRoadmap } from '../../../src/mcp/tools/roadmap';
import * as autoSync from '../../../src/mcp/tools/roadmap-auto-sync';

const FIXTURE = `---
project: test-project
version: 1
last_synced: 2026-01-01T00:00:00Z
last_manual_edit: 2026-01-01T00:00:00Z
---

# Project Roadmap

## Milestone: MVP Release

### Feature: Auth System
- **Status:** in-progress
- **Spec:** docs/changes/auth/proposal.md
- **Plans:** docs/plans/auth-plan.md
- **Blocked by:** —
- **Summary:** Authentication and authorization

### Feature: User Dashboard
- **Status:** planned
- **Spec:** —
- **Plans:** —
- **Blocked by:** Auth System
- **Summary:** Main user dashboard

## Backlog

### Feature: Mobile App
- **Status:** backlog
- **Spec:** —
- **Plans:** —
- **Blocked by:** —
- **Summary:** Native mobile application
`;

let dir: string;
let shardDir: string;

/** Write a sharded project (docs/roadmap.d/<slug>.md + _meta.md) from markdown. */
function writeShardedProject(root: string, md: string): void {
  const parsed = parseRoadmap(md);
  if (!parsed.ok) throw parsed.error;
  const { shards, meta } = roadmapToShards(parsed.value);
  const d = path.join(root, 'docs', 'roadmap.d');
  fs.mkdirSync(d, { recursive: true });
  for (const shard of shards) {
    fs.writeFileSync(path.join(d, `${shard.slug}.md`), serializeShard(shard), 'utf-8');
  }
  fs.writeFileSync(path.join(d, '_meta.md'), serializeMeta(meta), 'utf-8');
}

/** mtime+content snapshot of every file in the shard dir (for write-scope checks). */
function snapshotShardDir(): Map<string, string> {
  const snap = new Map<string, string>();
  for (const name of fs.readdirSync(shardDir)) {
    snap.set(name, fs.readFileSync(path.join(shardDir, name), 'utf-8'));
  }
  return snap;
}

/** Basenames of shard files (excluding _meta.md) whose content changed vs snapshot. */
function changedShards(before: Map<string, string>): string[] {
  const changed: string[] = [];
  const after = snapshotShardDir();
  const names = new Set([...before.keys(), ...after.keys()]);
  for (const name of names) {
    if (name === '_meta.md') continue;
    if (before.get(name) !== after.get(name)) changed.push(name);
  }
  return changed.sort();
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'roadmap-sharded-'));
  shardDir = path.join(dir, 'docs', 'roadmap.d');
  writeShardedProject(dir, FIXTURE);
  vi.spyOn(autoSync, 'triggerExternalSync').mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('manage_roadmap sharded — read seam', () => {
  it('show loads from shards (store parity)', async () => {
    const res = await handleManageRoadmap({ path: dir, action: 'show' });
    expect(res.isError).toBeFalsy();
    const parsed = JSON.parse(res.content[0].text);
    const names = parsed.milestones.flatMap((m: { features: { name: string }[] }) =>
      m.features.map((f) => f.name)
    );
    expect(names).toContain('Auth System');
    expect(names).toContain('User Dashboard');
    expect(names).toContain('Mobile App');
  });

  it('query filter reads from shards', async () => {
    const res = await handleManageRoadmap({ path: dir, action: 'query', filter: 'planned' });
    expect(res.isError).toBeFalsy();
    expect(res.content[0].text).toContain('User Dashboard');
  });
});

export { writeShardedProject, snapshotShardDir, changedShards };
