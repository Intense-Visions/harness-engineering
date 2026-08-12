import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { parseRoadmap } from '@harness-engineering/core';
import { runRoadmapShard } from '../../../src/commands/roadmap/shard';
import { runRoadmapRegen } from '../../../src/commands/roadmap/regen';
import { runRoadmapUnshard } from '../../../src/commands/roadmap/unshard';

// The directive block a real roadmap carries under its title (#1328).
const PREAMBLE = `<!-- markdownlint-disable-file MD013 -->
<!-- Machine-managed by harness roadmap tooling: each feature field is a single
     line by schema contract, so the 80-column rule does not apply. -->`;

// Realistic monolith: a preamble under the title, multiple milestones incl. an
// EMPTY milestone, a slug collision (`Fix login` / `Fix: login!`), mixed statuses,
// a populated `## Assignment History`, and 1-2 digit issue refs only.
const ROADMAP_MD = `---
project: harness-engineering
version: 1
created: 2026-06-01
updated: 2026-06-27
last_synced: 2026-06-27T12:00:00.000Z
last_manual_edit: 2026-06-27T11:00:00.000Z
---

# Roadmap

${PREAMBLE}

## MVP Release

### Fix login

- **Status:** in-progress
- **Spec:** docs/changes/x/proposal.md
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
- **Blockers:** Fix login
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

## Empty Milestone

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
  cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'roadmap-e2e-'));
  shardDir = path.join(cwd, 'docs', 'roadmap.d');
  roadmapPath = path.join(cwd, 'docs', 'roadmap.md');
  fs.mkdirSync(path.join(cwd, 'docs'), { recursive: true });
  fs.writeFileSync(roadmapPath, ROADMAP_MD);
});

afterEach(() => {
  fs.rmSync(cwd, { recursive: true, force: true });
});

describe('roadmap shard/regen/unshard end-to-end round-trip', () => {
  it('shard preserves the semantic parse (incl. history, collisions, empty milestone)', async () => {
    const r = await runRoadmapShard({ cwd });
    expect(r.ok).toBe(true);

    const after = parseRoadmap(fs.readFileSync(roadmapPath, 'utf-8'));
    const original = parseRoadmap(ROADMAP_MD);
    expect(after.ok && original.ok).toBe(true);
    if (after.ok && original.ok) {
      expect(after.value).toEqual(original.value);
      // Empty milestone survives.
      expect(after.value.milestones.map((m) => m.name)).toContain('Empty Milestone');
      // Assignment history survives.
      expect(after.value.assignmentHistory).toHaveLength(2);
    }
  });

  it('shard then regen keeps the preamble instead of silently deleting it (#1328)', async () => {
    await runRoadmapShard({ cwd });
    // It must live in `_meta.md` — the only roadmap-level home a shard dir has.
    expect(fs.readFileSync(path.join(shardDir, '_meta.md'), 'utf-8')).toContain(PREAMBLE);

    await runRoadmapRegen({ cwd });
    const regenerated = fs.readFileSync(roadmapPath, 'utf-8');
    expect(regenerated).toContain(`# Roadmap\n\n${PREAMBLE}\n\n## MVP Release`);
  });

  it('regen is deterministic: two consecutive runs are byte-identical', async () => {
    await runRoadmapShard({ cwd });
    await runRoadmapRegen({ cwd });
    const first = fs.readFileSync(roadmapPath, 'utf-8');
    await runRoadmapRegen({ cwd });
    const second = fs.readFileSync(roadmapPath, 'utf-8');
    expect(second).toBe(first);
  });

  it('unshard losslessly restores the monolith and removes the shard dir', async () => {
    await runRoadmapShard({ cwd });
    const afterShard = fs.readFileSync(roadmapPath, 'utf-8');

    const r = await runRoadmapUnshard({ cwd });
    expect(r.ok).toBe(true);
    expect(fs.readFileSync(roadmapPath, 'utf-8')).toBe(afterShard);
    expect(fs.existsSync(shardDir)).toBe(false);
  });
});
