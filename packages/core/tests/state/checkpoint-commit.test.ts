import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execFileSync } from 'child_process';
import { commitAtCheckpoint } from '../../src/state/checkpoint-commit';

describe('commitAtCheckpoint', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-checkpoint-'));
    // Initialize a git repo
    execFileSync('git', ['init'], { cwd: tmpDir });
    execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: tmpDir });
    execFileSync('git', ['config', 'user.name', 'Test'], { cwd: tmpDir });
    // Create initial commit so HEAD exists
    fs.writeFileSync(path.join(tmpDir, 'README.md'), '# Test');
    execFileSync('git', ['add', '.'], { cwd: tmpDir });
    execFileSync('git', ['commit', '-m', 'initial'], { cwd: tmpDir });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('commits staged changes with checkpoint label', () => {
    fs.writeFileSync(path.join(tmpDir, 'file.ts'), 'content');
    const result = commitAtCheckpoint({
      projectPath: tmpDir,
      session: 'test-session',
      checkpointLabel: 'Checkpoint 1: types defined',
    });

    expect(result.committed).toBe(true);
    expect(result.sha).toBeDefined();
    expect(result.sha!.length).toBeGreaterThanOrEqual(7);
    expect(result.message).toContain('[autopilot]');
    expect(result.message).toContain('Checkpoint 1: types defined');

    // Verify the commit exists in git log
    const log = execFileSync('git', ['log', '--oneline', '-1'], {
      cwd: tmpDir,
      encoding: 'utf-8',
    });
    expect(log).toContain('[autopilot] Checkpoint 1: types defined');
  });

  it('skips commit when nothing to commit', () => {
    const result = commitAtCheckpoint({
      projectPath: tmpDir,
      session: 'test-session',
      checkpointLabel: 'Checkpoint 2: no changes',
    });

    expect(result.committed).toBe(false);
    expect(result.sha).toBeUndefined();
  });

  it('uses recovery prefix when isRecovery is true', () => {
    fs.writeFileSync(path.join(tmpDir, 'recovery.ts'), 'recovery content');
    const result = commitAtCheckpoint({
      projectPath: tmpDir,
      session: 'test-session',
      checkpointLabel: 'Checkpoint 3: partial work',
      isRecovery: true,
    });

    expect(result.committed).toBe(true);
    expect(result.message).toContain('[autopilot][recovery]');
    expect(result.message).toContain('Checkpoint 3: partial work');

    const log = execFileSync('git', ['log', '--oneline', '-1'], {
      cwd: tmpDir,
      encoding: 'utf-8',
    });
    expect(log).toContain('[autopilot][recovery]');
  });

  it('handles multiple files in a single checkpoint', () => {
    fs.writeFileSync(path.join(tmpDir, 'a.ts'), 'a');
    fs.writeFileSync(path.join(tmpDir, 'b.ts'), 'b');
    fs.mkdirSync(path.join(tmpDir, 'sub'));
    fs.writeFileSync(path.join(tmpDir, 'sub', 'c.ts'), 'c');

    const result = commitAtCheckpoint({
      projectPath: tmpDir,
      session: 'test-session',
      checkpointLabel: 'Checkpoint 4: multiple files',
    });

    expect(result.committed).toBe(true);
  });
});
