import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { runValidate } from '../../src/commands/validate';

function makeProjectRoot(roadmapBody: string | null): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'validate-roadmap-health-'));
  fs.writeFileSync(
    path.join(dir, 'harness.config.json'),
    JSON.stringify({ version: 1, agentsMapPath: './AGENTS.md' })
  );
  fs.writeFileSync(path.join(dir, 'AGENTS.md'), '# Stub\n');
  if (roadmapBody !== null) {
    fs.mkdirSync(path.join(dir, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'docs', 'roadmap.md'), roadmapBody);
  }
  return dir;
}

const FRONTMATTER = `---
project: t
version: 1
last_synced: 2026-01-01T00:00:00Z
last_manual_edit: 2026-01-01T00:00:00Z
---

# Roadmap
`;

describe('runValidate — roadmap health', () => {
  let dir: string;
  afterEach(() => {
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  });

  it('skips silently when docs/roadmap.md is absent', async () => {
    dir = makeProjectRoot(null);
    const result = await runValidate({
      configPath: path.join(dir, 'harness.config.json'),
      cwd: dir,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.checks.roadmapHealth).toBeUndefined();
    // An ABSENT roadmap is "not applicable", not "could not check" — file-less
    // mode and uninitialized projects legitimately have no roadmap.
    if (result.ok) {
      expect(result.value.unavailableChecks).toEqual([]);
      expect(result.value.complete).toBe(true);
    }
  });

  it('fails validation when a catch-all milestone exists (RMH003)', async () => {
    dir = makeProjectRoot(
      `${FRONTMATTER}
## Backlog

### Some Feature

- **Status:** backlog
- **Spec:** —
- **Summary:** x
- **Blockers:** —
- **Plan:** —
`
    );
    const result = await runValidate({
      configPath: path.join(dir, 'harness.config.json'),
      cwd: dir,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.valid).toBe(false);
      expect(result.value.checks.roadmapHealth).toBe(false);
      const found = result.value.issues.find((i) => i.ruleId === 'RMH003');
      expect(found?.severity).toBe('error');
      // "Checked and unhealthy" — the check RAN, so the report is complete.
      expect(result.value.complete).toBe(true);
      expect(result.value.unavailableChecks).toEqual([]);
    }
  });

  it('surfaces unactionable planned rows as warnings without failing (RMH002)', async () => {
    dir = makeProjectRoot(
      `${FRONTMATTER}
## Craft Pipeline

### Naked Planned

- **Status:** planned
- **Spec:** —
- **Summary:** x
- **Blockers:** —
- **Plan:** —
`
    );
    const result = await runValidate({
      configPath: path.join(dir, 'harness.config.json'),
      cwd: dir,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.valid).toBe(true);
      expect(result.value.checks.roadmapHealth).toBe(true);
      const found = result.value.issues.find((i) => i.ruleId === 'RMH002');
      expect(found?.severity).toBe('warning');
      // Advisory noise stays advisory — an RMH002-only roadmap is a COMPLETE,
      // VALID run. This change must not make existing advisories blocking.
      expect(result.value.complete).toBe(true);
      expect(result.value.unavailableChecks).toEqual([]);
    }
  });

  it('abstains (does not pass) when docs/roadmap.md exists but fails to parse', async () => {
    dir = makeProjectRoot(
      `${FRONTMATTER}
## Milestone: M1

### Ship it

- **Status:** cancelled
`
    );
    const result = await runValidate({
      configPath: path.join(dir, 'harness.config.json'),
      cwd: dir,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      // The check never ran, so it is neither true nor false.
      expect(result.value.checks.roadmapHealth).toBeUndefined();
      expect(result.value.complete).toBe(false);
      expect(result.value.unavailableChecks).toHaveLength(1);
      const abstention = result.value.unavailableChecks[0];
      expect(abstention?.check).toBe('roadmapHealth');
      expect(abstention?.file).toBe('docs/roadmap.md');
      // The parser's own message names the offending section — surface it verbatim.
      expect(abstention?.reason).toContain('cancelled');
      expect(abstention?.suggestion).toBeTruthy();
    }
  });

  it('keeps the parse abstention out of issues so --severity cannot filter it away', async () => {
    dir = makeProjectRoot(
      `${FRONTMATTER}
## Milestone: M1

### Ship it

- **Status:** cancelled
`
    );
    const result = await runValidate({
      configPath: path.join(dir, 'harness.config.json'),
      cwd: dir,
      severity: 'error',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.unavailableChecks).toHaveLength(1);
      expect(result.value.complete).toBe(false);
      expect(result.value.issues.some((i) => i.check === 'roadmapHealth')).toBe(false);
    }
  });
});
