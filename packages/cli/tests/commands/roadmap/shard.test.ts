import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Err, parseRoadmap, ShardStore } from '@harness-engineering/core';
import { runRoadmapShard } from '../../../src/commands/roadmap/shard';
import { runRoadmapRegen } from '../../../src/commands/roadmap/regen';
import { createNodeShardIO } from '../../../src/commands/roadmap/shard-io';

// Representative monolith: 2 milestones + Backlog, mixed statuses, a populated
// `## Assignment History`, and a slug collision (`Fix login` / `Fix: login!`
// both slugify to `fix-login`). 1-2 digit issue refs only.
const ROADMAP_MD = `---
project: test
version: 1
last_synced: 2026-05-09T00:00:00Z
last_manual_edit: 2026-05-09T00:00:00Z
---

# Roadmap

## MVP Release

### Fix login

- **Status:** in-progress
- **Spec:** —
- **Summary:** Repair the login flow.
- **Blockers:** —
- **Plan:** —
- **Assignee:** alice
- **Priority:** P1
- **External-ID:** github:o/r#7

### Fix: login!

- **Status:** planned
- **Spec:** —
- **Summary:** Colliding slug feature.
- **Blockers:** —
- **Plan:** —
- **Priority:** P2

## v5.0 Hardening

### Token bypass guard

- **Status:** done
- **Spec:** —
- **Summary:** Guard shipped.
- **Blockers:** —
- **Plan:** —
- **External-ID:** #42

## Backlog

### Future idea

- **Status:** backlog
- **Spec:** —
- **Summary:** Something for later.
- **Blockers:** —
- **Plan:** —

## Assignment History
| Feature | Assignee | Action | Date |
|---------|----------|--------|------|
| Fix login | alice | assigned | 2026-01-02 |
| Fix login | bob | unassigned | 2026-01-03 |
`;

let cwd: string;
let shardDir: string;
let roadmapPath: string;

beforeEach(() => {
  cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'roadmap-shard-'));
  shardDir = path.join(cwd, 'docs', 'roadmap.d');
  roadmapPath = path.join(cwd, 'docs', 'roadmap.md');
  fs.mkdirSync(path.join(cwd, 'docs'), { recursive: true });
  fs.writeFileSync(roadmapPath, ROADMAP_MD);
});

afterEach(() => {
  fs.rmSync(cwd, { recursive: true, force: true });
});

describe('runRoadmapShard() — happy path', () => {
  it('writes one <slug>.md per feature plus _meta.md, disambiguating the collision', async () => {
    const r = await runRoadmapShard({ cwd });
    expect(r.ok).toBe(true);

    const entries = fs.readdirSync(shardDir).sort();
    expect(entries).toEqual([
      '_meta.md',
      'fix-login-2.md',
      'fix-login.md',
      'future-idea.md',
      'token-bypass-guard.md',
    ]);
  });

  it('produces a shard store that deep-equals the original parsed roadmap (store parity)', async () => {
    await runRoadmapShard({ cwd });
    const store = new ShardStore({ shardDir, io: createNodeShardIO() });
    const loaded = await store.load();
    const original = parseRoadmap(ROADMAP_MD);
    expect(loaded.ok && original.ok).toBe(true);
    if (loaded.ok && original.ok) {
      expect(loaded.value).toEqual(original.value);
    }
  });

  it('regenerates docs/roadmap.md that re-parses equal to the original and is byte-stable', async () => {
    await runRoadmapShard({ cwd });
    const afterShard = fs.readFileSync(roadmapPath, 'utf-8');
    const reparsed = parseRoadmap(afterShard);
    const original = parseRoadmap(ROADMAP_MD);
    expect(reparsed.ok && original.ok).toBe(true);
    if (reparsed.ok && original.ok) {
      expect(reparsed.value).toEqual(original.value);
    }
    // A follow-up regen leaves roadmap.md byte-identical.
    await runRoadmapRegen({ cwd });
    expect(fs.readFileSync(roadmapPath, 'utf-8')).toBe(afterShard);
  });
});

describe('runRoadmapShard() — safety, refusal, dry-run, json', () => {
  it('aborts before writing when the round-trip fails, leaving the monolith byte-identical', async () => {
    const before = fs.readFileSync(roadmapPath, 'utf-8');
    const r = await runRoadmapShard({
      cwd,
      // Inject a failing round-trip to prove the assert-before-write ordering.
      assertRoundTrip: () => Err(new Error('round-trip: forced mismatch for test')),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toMatch(/round-trip/i);
    // No shard dir created, monolith untouched.
    expect(fs.existsSync(shardDir)).toBe(false);
    expect(fs.readFileSync(roadmapPath, 'utf-8')).toBe(before);
  });

  it('refuses when already sharded unless --force is passed', async () => {
    await runRoadmapShard({ cwd }); // first shard succeeds
    const r = await runRoadmapShard({ cwd });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toMatch(/already sharded|--force|roadmap\.d/i);

    // --force proceeds.
    const forced = await runRoadmapShard({ cwd, force: true });
    expect(forced.ok).toBe(true);
  });

  it('dry-run returns a populated report and writes nothing', async () => {
    const before = fs.readFileSync(roadmapPath, 'utf-8');
    const r = await runRoadmapShard({ cwd, dryRun: true });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.shardCount).toBe(4);
      expect(r.value.milestoneCount).toBe(3);
      expect(r.value.disambiguated).toContain('fix-login-2');
      expect(r.value.roundTrip).toBe(true);
    }
    expect(fs.existsSync(shardDir)).toBe(false);
    expect(fs.readFileSync(roadmapPath, 'utf-8')).toBe(before);
  });

  it('emits a single stable JSON object when format is json', async () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const r = await runRoadmapShard({ cwd, format: 'json' });
      expect(r.ok).toBe(true);
      expect(spy).toHaveBeenCalledTimes(1);
      const payload = JSON.parse(spy.mock.calls[0]![0] as string);
      expect(payload).toMatchObject({
        ok: true,
        shardCount: 4,
        milestoneCount: 3,
        roundTrip: true,
      });
      expect(payload.disambiguated).toContain('fix-login-2');
    } finally {
      spy.mockRestore();
    }
  });
});
