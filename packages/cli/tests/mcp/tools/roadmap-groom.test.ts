import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { handleManageRoadmap } from '../../../src/mcp/tools/roadmap';

const ROADMAP = `---
project: groom-test
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

describe('manage_roadmap groom action', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'roadmap-groom-'));
    fs.mkdirSync(path.join(dir, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'docs', 'roadmap.md'), ROADMAP, 'utf-8');
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('demotes unactionable planned, archives done, and leaves the rest', async () => {
    const res = await handleManageRoadmap({ path: dir, action: 'groom' });
    expect(res.isError).toBeFalsy();
    const payload = JSON.parse(res.content[0].text);
    expect(payload.demoted).toBe(1);
    expect(payload.archived).toBe(1);

    // Active roadmap: done removed, naked demoted to backlog, ready untouched.
    const after = JSON.parse(
      (await handleManageRoadmap({ path: dir, action: 'show' })).content[0].text
    );
    const craft = after.milestones.find((m: { name: string }) => m.name === 'Craft Pipeline');
    const byName = Object.fromEntries(
      craft.features.map((f: { name: string; status: string }) => [f.name, f.status])
    );
    expect(byName['Naked Planned']).toBe('backlog');
    expect(byName['Ready Planned']).toBe('planned');
    expect(byName['Finished Thing']).toBeUndefined();

    // Archive file created with the done feature under Shipped.
    const archiveRaw = fs.readFileSync(path.join(dir, 'docs', 'roadmap-archive.md'), 'utf-8');
    expect(archiveRaw).toContain('## Shipped');
    expect(archiveRaw).toContain('### Finished Thing');
  });

  it('is idempotent: a second groom reports no changes', async () => {
    await handleManageRoadmap({ path: dir, action: 'groom' });
    const res2 = await handleManageRoadmap({ path: dir, action: 'groom' });
    const payload = JSON.parse(res2.content[0].text);
    expect(payload.changes).toEqual([]);
    expect(payload.message).toMatch(/already tidy/i);
  });

  it('preserves the Intake lane even when empty', async () => {
    await handleManageRoadmap({ path: dir, action: 'groom' });
    const after = JSON.parse(
      (await handleManageRoadmap({ path: dir, action: 'show' })).content[0].text
    );
    expect(after.milestones.some((m: { name: string }) => m.name === 'Intake')).toBe(true);
  });
});

// --- The archive write must never fabricate over a document it cannot read ------
//
// `appendToArchive` used to swallow BOTH a read failure and a parse failure into
// `archive = null`, fabricate an empty `{ milestones: [], assignmentHistory: [] }`
// and then write it over `docs/roadmap-archive.md` unconditionally — replacing
// every previously shipped row with just the rows being archived right now.
//
// #1862's new `Err` arm on `parseAssignmentHistory` is what routes real documents
// into that path: an archive whose `## Assignment History` section this build
// cannot read now FAILS to parse where before it parsed to zero records. A fix for
// a silent deletion must not leave a wider silent deletion reachable.

describe('manage_roadmap groom refuses to overwrite an unreadable archive', () => {
  let dir: string;
  let archivePath: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'roadmap-groom-archive-'));
    fs.mkdirSync(path.join(dir, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'docs', 'roadmap.md'), ROADMAP, 'utf-8');
    archivePath = path.join(dir, 'docs', 'roadmap-archive.md');
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  /**
   * A real archive holding shipped rows, whose history section is in a grammar
   * this build cannot read — the exact document #1862's `Err` arm now rejects.
   */
  const UNREADABLE_ARCHIVE = `---
project: groom-test
version: 1
last_synced: 2026-01-01T00:00:00Z
last_manual_edit: 2026-01-01T00:00:00Z
---

# Roadmap

## Shipped

### Long Ago Shipped

- **Status:** done
- **Spec:** —
- **Summary:** shipped last quarter
- **Blockers:** —
- **Plan:** —

## Assignment History

- **Item:** Long Ago Shipped
- **Owner:** alice
- **Event:** completed
- **On:** 2026-01-02
`;

  it('reports the failure instead of replacing the archive with an empty one', async () => {
    fs.writeFileSync(archivePath, UNREADABLE_ARCHIVE, 'utf-8');

    const res = await handleManageRoadmap({ path: dir, action: 'groom' });

    expect(res.isError).toBeTruthy();
    expect(res.content[0].text).toContain('roadmap-archive.md');
    // The previously shipped row is still there, and so is the history section.
    const after = fs.readFileSync(archivePath, 'utf-8');
    expect(after).toBe(UNREADABLE_ARCHIVE);
  });

  it('leaves the live roadmap untouched when the archive write is refused', async () => {
    fs.writeFileSync(archivePath, UNREADABLE_ARCHIVE, 'utf-8');
    const before = fs.readFileSync(path.join(dir, 'docs', 'roadmap.md'), 'utf-8');

    await handleManageRoadmap({ path: dir, action: 'groom' });

    // A groom that cannot archive must not remove the done row from the roadmap —
    // that would drop it on the floor entirely.
    expect(fs.readFileSync(path.join(dir, 'docs', 'roadmap.md'), 'utf-8')).toBe(before);
  });

  it('still creates the archive on first use, when there is no file yet', async () => {
    expect(fs.existsSync(archivePath)).toBe(false);

    const res = await handleManageRoadmap({ path: dir, action: 'groom' });

    expect(res.isError).toBeFalsy();
    expect(fs.readFileSync(archivePath, 'utf-8')).toContain('### Finished Thing');
  });
});
