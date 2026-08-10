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

/** Run the built CLI with extra args and capture both the exit code and stdout. */
function runCliWith(dir: string, args: string[]): { code: number; stdout: string } {
  try {
    const stdout = execFileSync(process.execPath, [CLI_BIN, 'validate', ...args], {
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

/** Run the built CLI and capture both the exit code and stdout. */
function runCli(dir: string): { code: number; stdout: string } {
  return runCliWith(dir, []);
}

describe('runValidate — check abstention', () => {
  let dir: string;
  afterEach(() => {
    if (!dir) return;
    // Windows holds a transient handle on the temp tree after the spawned CLI
    // exits, so a plain rmSync intermittently throws EBUSY and fails an
    // otherwise-passing test. Retry, then give up — leaking an OS temp dir is
    // harmless, failing a green assertion in teardown is not.
    try {
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
    } catch {
      /* temp dir cleanup is best-effort */
    }
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
      expect(abstention?.file).toBe('docs/roadmap.d/');
      expect(abstention?.reason).toContain('could not be regenerated');
      // Never `true` — a comparison that did not happen is not a comparison that passed.
      expect(result.value.checks.roadmapAggregateDrift).toBeUndefined();
      expect(result.value.complete).toBe(false);
    }
  });

  it('still reports findings from checks that did run alongside an abstention', async () => {
    // An unparseable roadmap (abstention) AND a genuine failing check: AGENTS.md
    // is removed so `agentsMap` fails outright. The abstention must not swallow
    // the finding, and the failing check must not swallow the abstention.
    dir = makeProject({ 'docs/roadmap.md': UNPARSEABLE_ROADMAP });
    fs.rmSync(path.join(dir, 'AGENTS.md'));
    const result = await runValidate({
      configPath: path.join(dir, 'harness.config.json'),
      cwd: dir,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      // Could-not-check.
      expect(result.value.complete).toBe(false);
      expect(result.value.unavailableChecks.map((u) => u.check)).toContain('roadmapHealth');
      // Checked-and-unhealthy, simultaneously and independently.
      expect(result.value.valid).toBe(false);
      expect(result.value.checks.agentsMap).toBe(false);
      expect(result.value.issues.some((i) => i.check === 'agentsMap')).toBe(true);
    }
  });

  describe('CLI exit codes', () => {
    // Never skip-if-missing: silently skipping the exit-code assertions because
    // dist/ is absent would be a check that could not run reporting as a check
    // that passed — precisely the defect this suite exists to pin. CI builds
    // before testing; locally, rebuild.
    it('has a built CLI to exercise', () => {
      expect(fs.existsSync(CLI_BIN)).toBe(true);
    });

    it('exits 3 and prints "Validation incomplete" when a check could not run', () => {
      dir = makeProject({ 'docs/roadmap.md': UNPARSEABLE_ROADMAP });
      const { code, stdout } = runCli(dir);
      expect(code).toBe(3);
      expect(stdout).toContain('Validation incomplete');
      expect(stdout).toContain('roadmapHealth');
      expect(stdout).not.toContain('validation passed');
    });

    it('exits 3 (not 1) when a run both abstains and fails, printing both', () => {
      // Abstention outranks failure: exit 1 would imply the printed findings are
      // the complete list, which is false once a check could not run.
      dir = makeProject({ 'docs/roadmap.md': UNPARSEABLE_ROADMAP });
      fs.rmSync(path.join(dir, 'AGENTS.md'));
      const { code, stdout } = runCli(dir);
      expect(code).toBe(3);
      expect(stdout).toContain('Validation incomplete');
      expect(stdout).toContain('Validation failed');
      expect(stdout).toContain('AGENTS.md');
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

    it('does not label advisory findings a failure when a check abstained', () => {
      // Warnings never flip `valid`. A run that is incomplete but not failing
      // must not print "Validation failed" — this repo carries dozens of RMH002
      // advisories, so this is the common shape of the incomplete outcome.
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
`,
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
      expect(code).toBe(3);
      expect(stdout).toContain('Validation incomplete');
      // The advisory is still surfaced...
      expect(stdout).toContain('Naked Planned');
      // ...but not as a failure that did not happen.
      expect(stdout).not.toContain('Validation failed');
    });

    it('still exits 3 under --severity error (an abstention is unfilterable)', () => {
      dir = makeProject({ 'docs/roadmap.md': UNPARSEABLE_ROADMAP });
      const { code, stdout } = runCliWith(dir, ['--severity', 'error']);
      expect(code).toBe(3);
      expect(stdout).toContain('Validation incomplete');
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
