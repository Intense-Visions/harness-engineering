/**
 * manage_roadmap `groom` in SHARDED mode (docs/roadmap.d/ present).
 *
 * The sharded archive motion (#695): `done` shards are MOVED into
 * docs/roadmap.d/archive/<slug>.md (full content preserved), the active aggregate
 * and active queries exclude them, non-done shards stay, and the round-trip is
 * lossless. Contrast roadmap-groom.test.ts, which covers the monolith archive.
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
project: groom-sharded-test
version: 1
last_synced: 2026-01-01T00:00:00Z
last_manual_edit: 2026-01-01T00:00:00Z
---

# Roadmap

## Intake

## Craft Pipeline

### Naked Planned
- **Status:** planned
- **Spec:** —
- **Summary:** no spec no plan
- **Blockers:** —
- **Plan:** —

### Ready Planned
- **Status:** planned
- **Spec:** docs/changes/x/proposal.md
- **Summary:** has a spec
- **Blockers:** —
- **Plan:** —

### Finished Thing
- **Status:** done
- **Spec:** docs/changes/y/proposal.md
- **Summary:** completed work
- **Blockers:** —
- **Plan:** —
`;

let dir: string;
let shardDir: string;
let archiveDir: string;

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

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'roadmap-groom-sharded-'));
  shardDir = path.join(dir, 'docs', 'roadmap.d');
  archiveDir = path.join(shardDir, 'archive');
  writeShardedProject(dir, FIXTURE);
  vi.spyOn(autoSync, 'triggerExternalSync').mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('manage_roadmap groom — sharded archive', () => {
  it('moves the done shard into archive/, demotes, and reports the sharded target', async () => {
    const before = fs.readFileSync(path.join(shardDir, 'finished-thing.md'), 'utf-8');

    const res = await handleManageRoadmap({ path: dir, action: 'groom' });
    expect(res.isError).toBeFalsy();
    const payload = JSON.parse(res.content[0].text);
    expect(payload.archived).toBe(1);
    expect(payload.demoted).toBe(1);
    expect(payload.message).toContain('docs/roadmap.d/archive/');

    // The done shard was MOVED out of the active dir into archive/, byte-for-byte.
    expect(fs.existsSync(path.join(shardDir, 'finished-thing.md'))).toBe(false);
    const archived = fs.readFileSync(path.join(archiveDir, 'finished-thing.md'), 'utf-8');
    expect(archived).toBe(before); // full frontmatter + body preserved

    // No monolith archive file is written in sharded mode.
    expect(fs.existsSync(path.join(dir, 'docs', 'roadmap-archive.md'))).toBe(false);

    // Non-done shards stay active; demoted one flipped to backlog on disk.
    expect(fs.existsSync(path.join(shardDir, 'ready-planned.md'))).toBe(true);
    const naked = fs.readFileSync(path.join(shardDir, 'naked-planned.md'), 'utf-8');
    expect(naked).toMatch(/- \*\*Status:\*\* backlog/);
  });

  it('excludes archived shards from the active aggregate and active queries', async () => {
    await handleManageRoadmap({ path: dir, action: 'groom' });

    // Active aggregate (docs/roadmap.md) regenerated without the archived row.
    const aggregate = fs.readFileSync(path.join(dir, 'docs', 'roadmap.md'), 'utf-8');
    expect(aggregate).not.toContain('Finished Thing');
    expect(aggregate).toContain('Ready Planned');

    // Active `show` excludes the archived row.
    const shown = JSON.parse(
      (await handleManageRoadmap({ path: dir, action: 'show' })).content[0].text
    );
    const names = shown.milestones.flatMap((m: { features: { name: string }[] }) =>
      m.features.map((f) => f.name)
    );
    expect(names).not.toContain('Finished Thing');
    expect(names).toContain('Ready Planned');

    // Active `query done` returns nothing (the only done row was archived).
    const doneQuery = JSON.parse(
      (await handleManageRoadmap({ path: dir, action: 'query', filter: 'done' })).content[0].text
    );
    const doneNames = (doneQuery.milestones ?? []).flatMap((m: { features: { name: string }[] }) =>
      m.features.map((f) => f.name)
    );
    expect(doneNames).not.toContain('Finished Thing');
  });

  it('is idempotent: a second groom reports no changes and preserves the archive', async () => {
    await handleManageRoadmap({ path: dir, action: 'groom' });
    const archivedAfterFirst = fs.readFileSync(path.join(archiveDir, 'finished-thing.md'), 'utf-8');

    const res2 = await handleManageRoadmap({ path: dir, action: 'groom' });
    const payload = JSON.parse(res2.content[0].text);
    expect(payload.changes).toEqual([]);
    expect(payload.message).toMatch(/already tidy/i);

    // Archive untouched by the no-op second run.
    expect(fs.readFileSync(path.join(archiveDir, 'finished-thing.md'), 'utf-8')).toBe(
      archivedAfterFirst
    );
  });
});
