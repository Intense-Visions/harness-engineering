import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runValidate } from '../../src/commands/validate';

/**
 * A check whose input exists but cannot be consumed must ABSTAIN — it must not
 * report as passed. These cases pin the three-state contract of `harness validate`:
 * checked-and-healthy (exit 0), checked-and-unhealthy (exit 1), and could-not-check
 * (exit 3, ZERO_DENOMINATOR).
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI_BIN = path.resolve(HERE, '../../dist/bin/harness.js');

const FRONTMATTER = `---
project: t
version: 1
last_synced: 2026-01-01T00:00:00Z
last_manual_edit: 2026-01-01T00:00:00Z
---

# Roadmap
`;

/** A roadmap whose `Status:` value the parser rejects — the bug-report fixture. */
const UNPARSEABLE_ROADMAP = `${FRONTMATTER}
## Milestone: M1

### Ship it

- **Status:** cancelled
`;

function makeProject(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'validate-abstention-'));
  fs.writeFileSync(
    path.join(dir, 'harness.config.json'),
    JSON.stringify({ version: 1, agentsMapPath: './AGENTS.md' })
  );
  fs.writeFileSync(path.join(dir, 'AGENTS.md'), '# Stub\n');
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(dir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  return dir;
}

/** Run the built CLI and capture both the exit code and stdout. */
function runCli(dir: string): { code: number; stdout: string } {
  try {
    const stdout = execFileSync(process.execPath, [CLI_BIN, 'validate'], {
      cwd: dir,
      encoding: 'utf-8',
      env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
    });
    return { code: 0, stdout };
  } catch (err) {
    const e = err as { status?: number | null; stdout?: string };
    return { code: e.status ?? -1, stdout: e.stdout ?? '' };
  }
}

const cliAvailable = fs.existsSync(CLI_BIN);

describe('runValidate — check abstention', () => {
  let dir: string;
  afterEach(() => {
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  });

  it('abstains on the aggregate-drift doctor when the shards cannot be regenerated', async () => {
    // A shard whose filename does not match its frontmatter slug makes
    // `regenerate()` return Err, so there is nothing to compare the committed
    // aggregate against. Before this contract that reported as a PASSED check.
    dir = makeProject({
      'docs/roadmap.d/_meta.md': `---
project: "t"
version: 1
created: "2026-01-01"
updated: "2026-01-01"
last_synced: "2026-01-01T00:00:00Z"
last_manual_edit: "2026-01-01T00:00:00Z"
milestones:
  - "M1"
---
`,
      'docs/roadmap.d/ship-it.md': `---
slug: "a-different-slug"
milestone: "M1"
order: 1
---

### Ship it

- **Status:** planned
- **Spec:** —
- **Summary:** x
- **Blockers:** —
- **Plan:** —
`,
      'docs/roadmap.md': FRONTMATTER,
    });
    const result = await runValidate({
      configPath: path.join(dir, 'harness.config.json'),
      cwd: dir,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const abstention = result.value.unavailableChecks.find(
        (u) => u.check === 'roadmapAggregateDrift'
      );
      expect(abstention).toBeDefined();
      expect(abstention?.file).toBe('docs/roadmap.d');
      expect(abstention?.reason).toContain('could not be regenerated');
      // Never `true` — a comparison that did not happen is not a comparison that passed.
      expect(result.value.checks.roadmapAggregateDrift).toBeUndefined();
      expect(result.value.complete).toBe(false);
    }
  });

  it('still reports findings from checks that did run alongside an abstention', async () => {
    // An unparseable aggregate (abstention) plus a catch-all milestone in the
    // shards (RMH003 error) — the abstention must not swallow the finding.
    dir = makeProject({ 'docs/roadmap.md': UNPARSEABLE_ROADMAP });
    const result = await runValidate({
      configPath: path.join(dir, 'harness.config.json'),
      cwd: dir,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.complete).toBe(false);
      // Other checks still ran and still reported.
      expect(result.value.checks.agentsMap).toBe(true);
      expect(result.value.checks.fileStructure).toBe(true);
    }
  });

  describe.skipIf(!cliAvailable)('CLI exit codes', () => {
    it('exits 3 and prints "Validation incomplete" when a check could not run', () => {
      dir = makeProject({ 'docs/roadmap.md': UNPARSEABLE_ROADMAP });
      const { code, stdout } = runCli(dir);
      expect(code).toBe(3);
      expect(stdout).toContain('Validation incomplete');
      expect(stdout).toContain('roadmapHealth');
      expect(stdout).not.toContain('validation passed');
    });

    it('exits 1 for a roadmap that parses and trips an error rule', () => {
      dir = makeProject({
        'docs/roadmap.md': `${FRONTMATTER}
## Backlog

### Some Feature

- **Status:** backlog
- **Spec:** —
- **Summary:** x
- **Blockers:** —
- **Plan:** —
`,
      });
      const { code, stdout } = runCli(dir);
      expect(code).toBe(1);
      expect(stdout).toContain('Validation failed');
      expect(stdout).not.toContain('Validation incomplete');
    });

    it('exits 0 when every applicable check ran and passed', () => {
      dir = makeProject({
        'docs/roadmap.md': `${FRONTMATTER}
## Craft Pipeline

### Naked Planned

- **Status:** planned
- **Spec:** —
- **Summary:** x
- **Blockers:** —
- **Plan:** —
`,
      });
      const { code, stdout } = runCli(dir);
      // RMH002 is advisory — it must not become blocking.
      expect(code).toBe(0);
      expect(stdout).toContain('validation passed');
    });
  });
});
