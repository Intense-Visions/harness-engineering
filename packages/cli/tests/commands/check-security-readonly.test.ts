import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { runCheckSecurity } from '../../src/commands/check-security';

/**
 * #2330: `check-security` is a check. A default run must leave the tracked
 * `.harness/security/timeline.json` ledger byte-identical; appending a
 * snapshot is an explicit opt-in (`--record` / `record: true`).
 */
const SEED = '{"version":1,"snapshots":[],"findingLifecycles":[]}\n';

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf-8' });
}

describe('check-security timeline ledger (#2330)', () => {
  let repo: string;
  let timeline: string;

  beforeEach(() => {
    repo = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-2330-'));
    fs.mkdirSync(path.join(repo, 'src'), { recursive: true });
    fs.mkdirSync(path.join(repo, '.harness', 'security'), { recursive: true });
    fs.writeFileSync(path.join(repo, 'src', 'index.ts'), 'export const x = 1;\n');
    fs.writeFileSync(path.join(repo, 'package.json'), '{"name":"a","version":"1.0.0"}\n');
    timeline = path.join(repo, '.harness', 'security', 'timeline.json');
    fs.writeFileSync(timeline, SEED);
    git(repo, 'init', '-q');
    git(repo, '-c', 'user.email=t@t', '-c', 'user.name=t', 'add', '-A');
    git(repo, '-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'seed');
  });

  afterEach(() => {
    fs.rmSync(repo, { recursive: true, force: true });
  });

  it('leaves a tracked timeline.json byte-identical on a default run', async () => {
    const before = fs.readFileSync(timeline);
    const result = await runCheckSecurity(repo, {});
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.stats.filesScanned).toBeGreaterThan(0);
    expect(fs.readFileSync(timeline).equals(before)).toBe(true);
    expect(git(repo, 'status', '--porcelain', '--', '.harness/security')).toBe('');
  });

  it('appends a snapshot only when recording is requested', async () => {
    const result = await runCheckSecurity(repo, { record: true });
    expect(result.ok).toBe(true);
    const parsed = JSON.parse(fs.readFileSync(timeline, 'utf-8')) as { snapshots: unknown[] };
    expect(parsed.snapshots).toHaveLength(1);
  });
});
