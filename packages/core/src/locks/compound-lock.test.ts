import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { acquireCompoundLock, CompoundLockHeldError } from './compound-lock';

describe('acquireCompoundLock', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'compound-lock-'));
  });
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates the lock file and returns a release handle', () => {
    const handle = acquireCompoundLock('integration-issues', { cwd: tmpDir });
    const lockPath = path.join(tmpDir, '.harness', 'locks', 'compound-integration-issues.lock');
    expect(fs.existsSync(lockPath)).toBe(true);
    handle.release();
    expect(fs.existsSync(lockPath)).toBe(false);
  });

  it('throws CompoundLockHeldError when same category is locked', () => {
    const handle = acquireCompoundLock('test-failures', { cwd: tmpDir });
    expect(() => acquireCompoundLock('test-failures', { cwd: tmpDir })).toThrow(
      CompoundLockHeldError
    );
    handle.release();
  });

  it('embeds the holder PID in the error message', () => {
    const handle = acquireCompoundLock('runtime-errors', { cwd: tmpDir });
    try {
      acquireCompoundLock('runtime-errors', { cwd: tmpDir });
      expect.fail('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(CompoundLockHeldError);
      expect((e as Error).message).toMatch(/pid/i);
    }
    handle.release();
  });

  it('allows different categories to lock concurrently', () => {
    const a = acquireCompoundLock('integration-issues', { cwd: tmpDir });
    const b = acquireCompoundLock('test-failures', { cwd: tmpDir });
    a.release();
    b.release();
  });

  it('rejects unknown category', () => {
    expect(() => acquireCompoundLock('unicorn-bugs' as never, { cwd: tmpDir })).toThrow(
      /unknown category/i
    );
  });
});
