import { describe, it, expect, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

/**
 * `check-design --json` must stay machine-readable when a verifier abstains.
 *
 * Each verifier-failed branch called `logger.warn`, which is `console.log` —
 * STDOUT. So an abstention prefixed `! audit-anatomy verifier failed: …` to the
 * JSON payload and every `--json` consumer got a parse error instead of a
 * result. Verifiers failing was near-unreachable before #2070; abstaining
 * honestly is what made it live, so the fix ships with it. The abstention is
 * not lost — `verifiersFailed` carries it in both output modes.
 */
const CLI = path.join(__dirname, '../../dist/bin/harness.js');

/**
 * These tests spawn the built CLI, so they need `dist`. They used to be
 * `it.runIf(fs.existsSync(CLI))`, which SILENTLY SKIPPED without one — the same
 * stale-dist trap that let a real failure through a green local suite twice on
 * this branch. Failing loudly with an actionable message is the point.
 */
function runCli(cwd: string, args: string[]): { status: number; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync(process.execPath, [CLI, ...args], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { status: 0, stdout, stderr: '' };
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return {
      status: e.status ?? -1,
      stdout: String(e.stdout ?? ''),
      stderr: String(e.stderr ?? ''),
    };
  }
}

function requireBuiltCli(): void {
  if (!fs.existsSync(CLI)) {
    throw new Error(
      `${CLI} is missing. These tests exercise the built CLI; run ` +
        '`pnpm --filter @harness-engineering/cli build` first. (This used to skip silently.)'
    );
  }
}

describe('check-design --json survives an abstention (#2070)', () => {
  let dir = '';

  afterEach(() => {
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
    dir = '';
  });

  it('emits parseable JSON naming the abstained verifiers', () => {
    requireBuiltCli();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cd-json-'));
    fs.writeFileSync(
      path.join(dir, 'harness.config.json'),
      JSON.stringify({
        version: 1,
        rootDir: '.',
        agentsMapPath: './AGENTS.md',
        design: { exclude: ['**/*'] },
      })
    );
    fs.writeFileSync(path.join(dir, 'AGENTS.md'), '# Stub\n');
    fs.mkdirSync(path.join(dir, 'src'));
    // `.vue` is SCANNED now, so it is no longer an abstention trigger. The real
    // one is a scope that discards every candidate.
    fs.writeFileSync(path.join(dir, 'src', 'App.tsx'), 'export const A = () => null;\n');

    let stdout = '';
    try {
      stdout = execFileSync(process.execPath, [CLI, 'check-design', '--mode', 'full', '--json'], {
        cwd: dir,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
    } catch (err) {
      // Exit 2 (degraded) is expected; the payload is what is under test.
      stdout = String((err as { stdout?: string }).stdout ?? '');
    }

    // The defect: this threw "Unexpected token '!'".
    const parsed = JSON.parse(stdout) as {
      summary: { verifiersFailed: Array<{ name: string; error: string }> };
    };
    expect(parsed.summary.verifiersFailed.map((v) => v.name).sort()).toEqual([
      'audit-anatomy',
      'audit-brand',
      'detect-drift',
    ]);
    for (const failed of parsed.summary.verifiersFailed) {
      expect(failed.error).toMatch(/read no files/i);
    }
  });

  it('does not render an abstained verifier as "(0 findings)"', () => {
    requireBuiltCli();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cd-text-'));
    fs.writeFileSync(
      path.join(dir, 'harness.config.json'),
      JSON.stringify({
        version: 1,
        rootDir: '.',
        agentsMapPath: './AGENTS.md',
        design: { exclude: ['**/*'] },
      })
    );
    fs.writeFileSync(path.join(dir, 'AGENTS.md'), '# Stub\n');
    fs.mkdirSync(path.join(dir, 'src'));
    fs.writeFileSync(path.join(dir, 'src', 'App.tsx'), 'export const A = () => null;\n');

    let out = '';
    try {
      out = execFileSync(process.execPath, [CLI, 'check-design', '--mode', 'full'], {
        cwd: dir,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
    } catch (err) {
      out = String((err as { stdout?: string }).stdout ?? '');
    }

    // The defect: the human report printed `audit-anatomy (0 findings)` for a
    // verifier that read nothing — the #2070 symptom one surface over. A reader
    // skimming past the failure list took it as clean.
    expect(out).not.toMatch(/audit-anatomy \(0 findings\)/);
    expect(out).toMatch(/audit-anatomy \(did not run/);
    // design-craft genuinely ran, so it keeps its real count.
    expect(out).toMatch(/design-craft critique \(0 findings\)/);
    expect(out).toMatch(/did not run \(this report is incomplete\)/);
  });

  // END-TO-END LEVER COVERAGE. The abstention message names two remedies, and
  // an earlier revision pinned only the literal glob STRING — which is exactly
  // how the critical finding survived a green suite: `check-design` read no
  // `enabled` key at all, so the config remedy the message advertised did not
  // exist on the affected command. These exercise both levers for real.
  it('the design.exclude lever actually clears the abstention', () => {
    requireBuiltCli();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cd-lever-x-'));
    fs.writeFileSync(
      path.join(dir, 'harness.config.json'),
      JSON.stringify({
        version: 1,
        rootDir: '.',
        agentsMapPath: './AGENTS.md',
        design: { exclude: ['vendor/**'] },
      })
    );
    fs.writeFileSync(path.join(dir, 'AGENTS.md'), '# Stub\n');
    fs.mkdirSync(path.join(dir, 'vendor'));
    fs.writeFileSync(path.join(dir, 'vendor', 'v.tsx'), 'export const V = () => null;\n');
    fs.mkdirSync(path.join(dir, 'src'));
    fs.writeFileSync(path.join(dir, 'src', 'a.tsx'), 'export const A = () => null;\n');

    const { status, stdout } = runCli(dir, ['check-design', '--mode', 'full', '--json']);
    const parsed = JSON.parse(stdout) as {
      summary: { verifiersFailed: unknown[]; verifiersDisabled: string[] };
    };
    // Excluding a subtree must NOT abstain while real source remains.
    expect(parsed.summary.verifiersFailed).toEqual([]);
    expect(status).not.toBe(2);
  });

  it('the design.audit.*.enabled lever actually disables the verifier', () => {
    requireBuiltCli();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cd-lever-e-'));
    fs.writeFileSync(
      path.join(dir, 'harness.config.json'),
      JSON.stringify({
        version: 1,
        rootDir: '.',
        agentsMapPath: './AGENTS.md',
        // An otherwise-abstaining scope, acknowledged away via the real keys.
        design: {
          exclude: ['**/*'],
          audit: {
            componentAnatomy: { enabled: false },
            driftDetection: { enabled: false },
            brandCompliance: { enabled: false },
          },
        },
      })
    );
    fs.writeFileSync(path.join(dir, 'AGENTS.md'), '# Stub\n');
    fs.mkdirSync(path.join(dir, 'src'));
    fs.writeFileSync(path.join(dir, 'src', 'a.tsx'), 'export const A = () => null;\n');

    const { status, stdout, stderr } = runCli(dir, ['check-design', '--mode', 'full', '--json']);
    // The keys must be REAL: a wrong key is reported as ignored, which is how
    // the first attempt at this remedy failed.
    expect(`${stdout}${stderr}`).not.toMatch(/ignored unknown key/i);

    const parsed = JSON.parse(stdout) as {
      summary: { verifiersFailed: unknown[]; verifiersDisabled: string[] };
    };
    expect(parsed.summary.verifiersFailed).toEqual([]);
    expect(parsed.summary.verifiersDisabled.sort()).toEqual([
      'audit-anatomy',
      'audit-brand',
      'detect-drift',
    ]);
    expect(status).toBe(0);
  });

  it('a disabled verifier is not rendered as "(0 findings)"', () => {
    requireBuiltCli();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cd-lever-t-'));
    fs.writeFileSync(
      path.join(dir, 'harness.config.json'),
      JSON.stringify({
        version: 1,
        rootDir: '.',
        agentsMapPath: './AGENTS.md',
        design: { audit: { componentAnatomy: { enabled: false } } },
      })
    );
    fs.writeFileSync(path.join(dir, 'AGENTS.md'), '# Stub\n');
    fs.mkdirSync(path.join(dir, 'src'));
    fs.writeFileSync(path.join(dir, 'src', 'a.tsx'), 'export const A = () => null;\n');

    const { stdout } = runCli(dir, ['check-design', '--mode', 'full']);
    // An acknowledged opt-out is not a clean result either.
    expect(stdout).not.toMatch(/audit-anatomy \(0 findings\)/);
    expect(stdout).toMatch(/audit-anatomy \(disabled by config/);
    // A verifier that really ran keeps its real count.
    expect(stdout).toMatch(/detect-drift \(\d+ finding/);
  });
});
