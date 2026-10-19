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

describe('check-design --json survives an abstention (#2070)', () => {
  let dir = '';

  afterEach(() => {
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
    dir = '';
  });

  it.runIf(fs.existsSync(CLI))('emits parseable JSON naming the abstained verifiers', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cd-json-'));
    fs.writeFileSync(
      path.join(dir, 'harness.config.json'),
      JSON.stringify({ version: 1, rootDir: '.', agentsMapPath: './AGENTS.md' })
    );
    fs.writeFileSync(path.join(dir, 'AGENTS.md'), '# Stub\n');
    fs.mkdirSync(path.join(dir, 'src'));
    // A real design surface in a dialect no verifier can parse -> all abstain.
    fs.writeFileSync(path.join(dir, 'src', 'App.vue'), '<template><div/></template>\n');

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
      expect(failed.error).toMatch(/format it can parse/i);
    }
  });

  it.runIf(fs.existsSync(CLI))('does not render an abstained verifier as "(0 findings)"', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cd-text-'));
    fs.writeFileSync(
      path.join(dir, 'harness.config.json'),
      JSON.stringify({ version: 1, rootDir: '.', agentsMapPath: './AGENTS.md' })
    );
    fs.writeFileSync(path.join(dir, 'AGENTS.md'), '# Stub\n');
    fs.mkdirSync(path.join(dir, 'src'));
    fs.writeFileSync(path.join(dir, 'src', 'App.vue'), '<template><div/></template>\n');

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
});
