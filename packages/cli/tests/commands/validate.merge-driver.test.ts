import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { execFileSync } from 'node:child_process';
import { runValidate } from '../../src/commands/validate';

function makeGitProject(opts: { gitattributes?: string; driver?: string }): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'validate-merge-driver-'));
  fs.writeFileSync(
    path.join(dir, 'harness.config.json'),
    JSON.stringify({ version: 1, agentsMapPath: './AGENTS.md' })
  );
  fs.writeFileSync(path.join(dir, 'AGENTS.md'), '# Stub\n');
  if (opts.gitattributes !== undefined) {
    fs.writeFileSync(path.join(dir, '.gitattributes'), opts.gitattributes);
  }
  execFileSync('git', ['init'], { cwd: dir, stdio: 'ignore' });
  if (opts.driver !== undefined) {
    execFileSync('git', ['config', 'merge.ours.driver', opts.driver], {
      cwd: dir,
      stdio: 'ignore',
    });
  }
  return dir;
}

describe('runValidate — merge.ours.driver doctor warning', () => {
  let dir: string;
  afterEach(() => {
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  });

  it('warns when .gitattributes declares merge=ours but the driver is unset', async () => {
    dir = makeGitProject({ gitattributes: 'x merge=ours\n' });
    const result = await runValidate({
      configPath: path.join(dir, 'harness.config.json'),
      cwd: dir,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const found = result.value.issues.find((i) => i.check === 'mergeDriver');
      expect(found).toBeDefined();
      expect(found?.severity).toBe('warning');
      expect(found?.message).toContain('git config merge.ours.driver true');
      expect(result.value.checks.mergeDriver).toBe(false);
    }
  });

  it('does not warn when the driver is configured', async () => {
    dir = makeGitProject({ gitattributes: 'x merge=ours\n', driver: 'true' });
    const result = await runValidate({
      configPath: path.join(dir, 'harness.config.json'),
      cwd: dir,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const found = result.value.issues.find((i) => i.check === 'mergeDriver');
      expect(found).toBeUndefined();
      expect(result.value.checks.mergeDriver).toBe(true);
    }
  });

  it('does not warn when no merge=ours is declared', async () => {
    dir = makeGitProject({ gitattributes: '* text=auto eol=lf\n' });
    const result = await runValidate({
      configPath: path.join(dir, 'harness.config.json'),
      cwd: dir,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const found = result.value.issues.find((i) => i.check === 'mergeDriver');
      expect(found).toBeUndefined();
    }
  });
});
