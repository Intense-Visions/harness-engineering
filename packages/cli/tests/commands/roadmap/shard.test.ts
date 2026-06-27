import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { parseRoadmap, ShardStore } from '@harness-engineering/core';
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
