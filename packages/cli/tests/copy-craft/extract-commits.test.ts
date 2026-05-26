import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { execSync } from 'node:child_process';
import { extractCommits } from '../../src/copy-craft/extract/commits';

describe('extractCommits', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'copy-commits-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns skip reason when not a git repo', () => {
    const result = extractCommits({ projectRoot: tmpDir });
    expect(result.items).toEqual([]);
    expect(result.skipReason).toContain('not a git repo');
  });

  it('returns commits when in a git repo', () => {
    try {
      execSync('git init -q', { cwd: tmpDir, stdio: 'ignore' });
      execSync('git config user.email "t@t.com"', { cwd: tmpDir, stdio: 'ignore' });
      execSync('git config user.name "Test"', { cwd: tmpDir, stdio: 'ignore' });
      execSync('git config commit.gpgsign false', { cwd: tmpDir, stdio: 'ignore' });
      fs.writeFileSync(path.join(tmpDir, 'a.txt'), 'foo');
      execSync('git add a.txt', { cwd: tmpDir, stdio: 'ignore' });
      execSync('git commit -q -m "first commit subject"', { cwd: tmpDir, stdio: 'ignore' });
    } catch (err) {
      // Git not available in environment — skip the assertion (test still
      // validates the not-a-git-repo path above).
      return;
    }
    const result = extractCommits({ projectRoot: tmpDir });
    expect(result.skipReason).toBeUndefined();
    expect(result.items.length).toBeGreaterThanOrEqual(1);
    expect(result.items[0].surface).toBe('commit');
    expect(result.items[0].snippet).toBe('first commit subject');
    expect(result.items[0].file).toMatch(/^git:/);
    expect(result.items[0].context.ref).toBeTruthy();
  });
});
