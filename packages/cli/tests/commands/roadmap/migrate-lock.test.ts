import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  acquireMigrateLock,
  isRefusal,
  isPidAlive,
} from '../../../src/commands/roadmap/migrate-lock';

/**
 * REV-P5-S7 advisory lockfile coverage.
 *
 * Cases:
 *   - concurrent-attempt-refused: live lockfile (current process pid)
 *     refuses a second acquire.
 *   - stale-lock-recovered (dead pid): lockfile with a non-existent pid
 *     is overwritten.
 *   - stale-lock-recovered (old): lockfile older than 30 min is
 *     overwritten regardless of pid liveness.
 *   - normal-cleanup: successful acquire + release removes the file.
 *   - unparseable-lock: corrupt JSON is treated as stale and overwritten.
 *   - hostname-pid-recorded: payload contains expected fields.
 */
describe('acquireMigrateLock (REV-P5-S7)', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'migrate-lock-'));
  });

  afterEach(() => {
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  });

  it('creates the lockfile under .harness/ with pid + startedAt + hostname', () => {
    const r = acquireMigrateLock(dir);
    expect(isRefusal(r)).toBe(false);
    const lockPath = path.join(dir, '.harness', 'migrate.lock');
    expect(fs.existsSync(lockPath)).toBe(true);
    const payload = JSON.parse(fs.readFileSync(lockPath, 'utf-8')) as {
      pid: number;
      startedAt: string;
      hostname: string;
    };
    expect(payload.pid).toBe(process.pid);
    expect(payload.hostname).toBe(os.hostname());
    expect(payload.startedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    if (!isRefusal(r)) r.release();
  });

  it('release() removes the lockfile', () => {
    const r = acquireMigrateLock(dir);
    expect(isRefusal(r)).toBe(false);
    if (isRefusal(r)) return;
    r.release();
    const lockPath = path.join(dir, '.harness', 'migrate.lock');
    expect(fs.existsSync(lockPath)).toBe(false);
  });

  it('concurrent-attempt-refused: refuses a second acquire while the first is live', () => {
    const first = acquireMigrateLock(dir);
    expect(isRefusal(first)).toBe(false);
    try {
      const second = acquireMigrateLock(dir);
      expect(isRefusal(second)).toBe(true);
      if (isRefusal(second)) {
        expect(second.reason).toBe('in-progress');
        expect(second.message).toMatch(/another migration is in progress/i);
        expect(second.existing.pid).toBe(process.pid);
      }
    } finally {
      if (!isRefusal(first)) first.release();
    }
  });

  it('stale-lock-recovered (dead pid): a lockfile pointing at a non-existent pid is overwritten', () => {
    // PID 1 is `init`/`launchd` which IS alive on POSIX. Use a sentinel that
    // is virtually guaranteed not to be live: a huge negative-ish pid (we
    // pass via the file directly since process.kill will error on negative).
    // 999999999 is well outside the typical PID range and unlikely to exist.
    const harness = path.join(dir, '.harness');
    fs.mkdirSync(harness, { recursive: true });
    fs.writeFileSync(
      path.join(harness, 'migrate.lock'),
      JSON.stringify({
        pid: 999999999,
        startedAt: new Date().toISOString(),
        hostname: 'fake-host',
      })
    );
    expect(isPidAlive(999999999)).toBe(false);
    const r = acquireMigrateLock(dir);
    expect(isRefusal(r)).toBe(false);
    const payload = JSON.parse(fs.readFileSync(path.join(harness, 'migrate.lock'), 'utf-8')) as {
      pid: number;
    };
    // The new acquire overwrote the lock with OUR pid.
    expect(payload.pid).toBe(process.pid);
    if (!isRefusal(r)) r.release();
  });

  it('stale-lock-recovered (>30min old): an old lock is overwritten even if pid is alive', () => {
    const harness = path.join(dir, '.harness');
    fs.mkdirSync(harness, { recursive: true });
    const longAgo = new Date(Date.now() - 31 * 60 * 1000).toISOString();
    fs.writeFileSync(
      path.join(harness, 'migrate.lock'),
      JSON.stringify({
        pid: process.pid, // live pid, but stale by age
        startedAt: longAgo,
        hostname: os.hostname(),
      })
    );
    const r = acquireMigrateLock(dir);
    expect(isRefusal(r)).toBe(false);
    const payload = JSON.parse(fs.readFileSync(path.join(harness, 'migrate.lock'), 'utf-8')) as {
      startedAt: string;
    };
    // New startedAt is "now"-ish, not the longAgo value.
    expect(payload.startedAt).not.toBe(longAgo);
    if (!isRefusal(r)) r.release();
  });

  it('unparseable-lock: corrupt JSON is treated as stale and overwritten', () => {
    const harness = path.join(dir, '.harness');
    fs.mkdirSync(harness, { recursive: true });
    fs.writeFileSync(path.join(harness, 'migrate.lock'), 'not valid json');
    const r = acquireMigrateLock(dir);
    expect(isRefusal(r)).toBe(false);
    if (!isRefusal(r)) r.release();
  });

  it('release() is idempotent (safe to call when file is already gone)', () => {
    const r = acquireMigrateLock(dir);
    expect(isRefusal(r)).toBe(false);
    if (isRefusal(r)) return;
    const lockPath = path.join(dir, '.harness', 'migrate.lock');
    fs.unlinkSync(lockPath); // simulate concurrent stale-recovery
    expect(() => r.release()).not.toThrow();
  });
});

describe('isPidAlive', () => {
  it('returns true for the current process pid', () => {
    expect(isPidAlive(process.pid)).toBe(true);
  });

  it('returns false for an unrealistically large pid', () => {
    expect(isPidAlive(999999999)).toBe(false);
  });

  it('returns false for non-positive or non-integer values', () => {
    expect(isPidAlive(0)).toBe(false);
    expect(isPidAlive(-1)).toBe(false);
    expect(isPidAlive(1.5)).toBe(false);
  });
});
