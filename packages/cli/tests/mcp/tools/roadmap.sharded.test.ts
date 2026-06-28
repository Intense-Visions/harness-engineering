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

describe('manage_roadmap sharded — add (single new shard)', () => {
  it('creates exactly one new shard and touches no existing shard', async () => {
    const before = snapshotShardDir();
    const res = await handleManageRoadmap({
      path: dir,
      action: 'add',
      feature: 'Billing',
      milestone: 'MVP Release',
      status: 'planned',
      summary: 'Billing system',
    });
    expect(res.isError).toBeFalsy();

    // Exactly one shard changed: the newly-created billing.md. No existing shard
    // (auth-system.md / user-dashboard.md / mobile-app.md) was rewritten.
    expect(fs.existsSync(path.join(shardDir, 'billing.md'))).toBe(true);
    expect(changedShards(before)).toEqual(['billing.md']);
    // Aggregate regenerated to include the new feature.
    const aggregate = fs.readFileSync(path.join(dir, 'docs', 'roadmap.md'), 'utf-8');
    expect(aggregate).toContain('Billing');
  });
});

describe('manage_roadmap sharded — update (single shard)', () => {
  it('a status edit patches only the edited row shard', async () => {
    const before = snapshotShardDir();
    const res = await handleManageRoadmap({
      path: dir,
      action: 'update',
      feature: 'Auth System',
      status: 'done',
    });
    expect(res.isError).toBeFalsy();
    expect(changedShards(before)).toEqual(['auth-system.md']);
    expect(fs.readFileSync(path.join(shardDir, 'auth-system.md'), 'utf-8')).toMatch(
      /\*\*Status:\*\* done/
    );
  });

  it('first-claim-wins refusal writes no shard', async () => {
    // Alice claims Auth System (forces in-progress under alice).
    await handleManageRoadmap({
      path: dir,
      action: 'update',
      feature: 'Auth System',
      assignee: '@alice',
    });
    const before = snapshotShardDir();
    // Bob's claim must be refused and persist nothing.
    const res = await handleManageRoadmap({
      path: dir,
      action: 'update',
      feature: 'Auth System',
      assignee: '@bob',
    });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('Claim refused');
    expect(changedShards(before)).toEqual([]);
  });

  it('preserves the unblock-only cascade (issue 610: dependent flips planned, no re-block)', async () => {
    // Marking the blocker done must flip a blocked dependent to planned. Set up a
    // genuinely blocked dependent first by blocking User Dashboard.
    await handleManageRoadmap({
      path: dir,
      action: 'update',
      feature: 'User Dashboard',
      status: 'blocked',
    });
    const res = await handleManageRoadmap({
      path: dir,
      action: 'update',
      feature: 'Auth System',
      status: 'done',
    });
    expect(res.isError).toBeFalsy();
    const parsed = JSON.parse(res.content[0].text);
    const dash = parsed.milestones
      .flatMap((m: { features: { name: string; status: string }[] }) => m.features)
      .find((f: { name: string }) => f.name === 'User Dashboard');
    expect(dash.status).toBe('planned');
  });
});

describe('manage_roadmap sharded — remove (single shard delete)', () => {
  it('deletes exactly the one shard and regenerates the aggregate', async () => {
    expect(fs.existsSync(path.join(shardDir, 'mobile-app.md'))).toBe(true);
    const res = await handleManageRoadmap({ path: dir, action: 'remove', feature: 'Mobile App' });
    expect(res.isError).toBeFalsy();
    // Only mobile-app.md is gone; the others remain.
    expect(fs.existsSync(path.join(shardDir, 'mobile-app.md'))).toBe(false);
    expect(fs.existsSync(path.join(shardDir, 'auth-system.md'))).toBe(true);
    expect(fs.existsSync(path.join(shardDir, 'user-dashboard.md'))).toBe(true);
    const aggregate = fs.readFileSync(path.join(dir, 'docs', 'roadmap.md'), 'utf-8');
    expect(aggregate).not.toContain('Mobile App');
  });

  it('unknown feature returns an error and deletes nothing', async () => {
    const before = snapshotShardDir();
    const res = await handleManageRoadmap({ path: dir, action: 'remove', feature: 'Nonexistent' });
    expect(res.isError).toBe(true);
    expect(changedShards(before)).toEqual([]);
    expect(fs.readdirSync(shardDir).sort()).toEqual(snapshotShardKeys(before));
  });
});

/** Sorted basenames captured in a snapshot map. */
function snapshotShardKeys(snap: Map<string, string>): string[] {
  return [...snap.keys()].sort();
}

describe('manage_roadmap sharded — promote', () => {
  it('existing backlog→planned promote patches exactly one shard', async () => {
    const before = snapshotShardDir();
    const res = await handleManageRoadmap({
      path: dir,
      action: 'promote',
      feature: 'Mobile App',
      spec: 'docs/changes/mobile/proposal.md',
    });
    expect(res.isError).toBeFalsy();
    expect(changedShards(before)).toEqual(['mobile-app.md']);
    expect(fs.readFileSync(path.join(shardDir, 'mobile-app.md'), 'utf-8')).toMatch(
      /\*\*Status:\*\* planned/
    );
  });

  it('not-found create promote adds exactly one new Intake shard', async () => {
    const before = snapshotShardDir();
    const res = await handleManageRoadmap({
      path: dir,
      action: 'promote',
      feature: 'Telemetry Pipeline',
      spec: 'docs/changes/telemetry/proposal.md',
      summary: 'Telemetry ingestion',
    });
    expect(res.isError).toBeFalsy();
    const newShard = 'telemetry-pipeline.md';
    expect(fs.existsSync(path.join(shardDir, newShard))).toBe(true);
    expect(changedShards(before)).toEqual([newShard]);
  });
});

describe('manage_roadmap sharded — sync (per-shard writeback)', () => {
  it('apply patches exactly the rows whose status changed (N shards == N changes)', async () => {
    const before = snapshotShardDir();
    const res = await handleManageRoadmap({ path: dir, action: 'sync', apply: true });
    expect(res.isError).toBeFalsy();
    const parsed = JSON.parse(res.content[0].text);
    if (parsed.applied) {
      expect(parsed.changes.length).toBeGreaterThan(0);
      // Exactly one shard rewritten per status change — no other shard touched.
      expect(changedShards(before).length).toBe(parsed.changes.length);
    } else {
      // Up-to-date roadmap is a valid outcome; then nothing is rewritten.
      expect(changedShards(before)).toEqual([]);
    }
  });
});

export { writeShardedProject, snapshotShardDir, changedShards };
