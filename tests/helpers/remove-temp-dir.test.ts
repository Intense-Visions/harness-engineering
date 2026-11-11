// tests/helpers/remove-temp-dir.test.ts
//
// Unit coverage for the shared temp-dir teardown helper (#2089). The real
// fault is a Windows-only file lock with no POSIX analogue, so the transient
// lock is STUBBED here: `fs.rmSync` is replaced with a fake that models Node's
// documented retry contract (throw EBUSY while the lock is held; consume up to
// `maxRetries` extra attempts before giving up). Windows CI on the
// `build-and-test (windows-latest, 22)` leg remains the real proof.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { REMOVE_TEMP_DIR_OPTIONS, removeTempDirSafely } from './remove-temp-dir';

function ebusy(target: string): NodeJS.ErrnoException {
  return Object.assign(new Error(`EBUSY: resource busy or locked, rmdir '${target}'`), {
    errno: -4082,
    code: 'EBUSY',
    syscall: 'rmdir',
    path: target,
  });
}

/**
 * Stub `fs.rmSync` as a directory whose handle is held for the first
 * `lockedAttempts` removal attempts. One call makes `1 + maxRetries` attempts,
 * mirroring Node's rimraf retry loop.
 */
function stubTransientLock(lockedAttempts: number) {
  let attempts = 0;
  const removed: string[] = [];
  const spy = vi.spyOn(fs, 'rmSync').mockImplementation((target, opts) => {
    const budget = 1 + ((opts as fs.RmOptions | undefined)?.maxRetries ?? 0);
    for (let i = 0; i < budget; i++) {
      attempts++;
      if (attempts > lockedAttempts) {
        removed.push(String(target));
        return;
      }
    }
    throw ebusy(String(target));
  });
  return { spy, removed, attempts: () => attempts };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('removeTempDirSafely', () => {
  it('positive control: the pre-#2089 teardown shape throws EBUSY under a transient lock', () => {
    stubTransientLock(3);
    // `force: true` alone — the call that redded windows CI at
    // comprehend-smoke.e2e.test.ts:60 (and the first attempt of the hand-rolled
    // orchestrator loops).
    expect(() =>
      fs.rmSync('C:\\tmp\\comprehend-smoke-x', { recursive: true, force: true })
    ).toThrow(/EBUSY/);
  });

  it('tolerates a transient EBUSY lock instead of failing the teardown', () => {
    const lock = stubTransientLock(3);
    expect(() => removeTempDirSafely('C:\\tmp\\comprehend-smoke-x')).not.toThrow();
    expect(lock.removed).toEqual(['C:\\tmp\\comprehend-smoke-x']);
    expect(lock.attempts()).toBe(4);
    expect(lock.spy).toHaveBeenCalledWith('C:\\tmp\\comprehend-smoke-x', REMOVE_TEMP_DIR_OPTIONS);
  });

  it('stays loud when the lock outlives the retry budget (never swallows a real fault)', () => {
    stubTransientLock(Number.POSITIVE_INFINITY);
    expect(() => removeTempDirSafely('C:\\tmp\\stuck')).toThrow(/EBUSY/);
  });

  it('is a no-op when setup never created a directory', () => {
    const spy = vi.spyOn(fs, 'rmSync');
    removeTempDirSafely(undefined);
    removeTempDirSafely('');
    removeTempDirSafely(null);
    expect(spy).not.toHaveBeenCalled();
  });

  it('removes a real directory tree and tolerates an already-missing path', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'remove-temp-dir-'));
    fs.mkdirSync(path.join(dir, 'a', 'b'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'a', 'b', 'f.txt'), 'x');
    removeTempDirSafely(dir);
    expect(fs.existsSync(dir)).toBe(false);
    expect(() => removeTempDirSafely(dir)).not.toThrow();
  });
});
