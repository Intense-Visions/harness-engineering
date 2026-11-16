import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createRequire, syncBuiltinESMExports } from 'node:module';
import type { AutoDecision } from '@harness-engineering/types';
import { appendAutoDecision, readAutoDecisions } from '../../src/autonomy/decision-log';
import { withAppendLock, AppendLockTimeoutError } from '../../src/autonomy/append-lock';

/**
 * Windows lock-file semantics, simulated on any OS (#2596). While the previous holder's lock is
 * being deleted (delete pending), CreateFile fails with STATUS_DELETE_PENDING, which libuv reports
 * as EPERM, not EEXIST. Unlinking a lock that another process has open can fail with EPERM, EBUSY
 * or EACCES. Every one of these means "the lock is busy". None of them means the append failed.
 */
const git = { gitCommonDir: () => undefined };
const entry = (q: string): AutoDecision => ({
  ts: '2026-11-16T00:00:00.000Z',
  skill: 'harness-planning',
  phase: 'VALIDATE',
  pauseClass: 'ceremony',
  question: q,
  options: ['approve'],
  chosen: 'approve',
  rationale: 'r',
  autonomySource: 'user-config',
});

// The ESM namespace of a builtin is not spy-able; patch the CommonJS object and resync.
const cjsFs = createRequire(import.meta.url)('node:fs') as typeof fs;
const realOpenSync = cjsFs.openSync;
const realUnlinkSync = cjsFs.unlinkSync;
const realRmSync = cjsFs.rmSync;

const errno = (code: string, syscall: string, p: string): NodeJS.ErrnoException =>
  Object.assign(new Error(`${code}: simulated, ${syscall} '${p}'`), { code, syscall, path: p });

/** Make the next `times` lock creates (open 'wx' on *.lock) fail with `code`. */
function failLockCreate(code: string, times: number): { calls: () => number } {
  let n = 0;
  cjsFs.openSync = ((p: fs.PathLike, ...rest: unknown[]) => {
    if (String(p).endsWith('.lock') && n < times) {
      n++;
      throw errno(code, 'open', String(p));
    }
    return (realOpenSync as (...a: unknown[]) => number)(p, ...rest);
  }) as typeof fs.openSync;
  syncBuiltinESMExports();
  return { calls: () => n };
}

/** Make the next `times` lock deletes (unlink or rm of *.lock) fail with `code`. */
function failLockRelease(code: string, times: number): { calls: () => number } {
  let n = 0;
  const maybeFail = (p: fs.PathLike, syscall: string): void => {
    if (String(p).endsWith('.lock') && n < times) {
      n++;
      throw errno(code, syscall, String(p));
    }
  };
  cjsFs.unlinkSync = ((p: fs.PathLike) => {
    maybeFail(p, 'unlink');
    return realUnlinkSync(p);
  }) as typeof fs.unlinkSync;
  cjsFs.rmSync = ((p: fs.PathLike, o?: fs.RmOptions) => {
    maybeFail(p, 'rm');
    return realRmSync(p, o);
  }) as typeof fs.rmSync;
  syncBuiltinESMExports();
  return { calls: () => n };
}

let tmp: string;
let log: string;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'autonomy-lock-win32-'));
  fs.mkdirSync(path.join(tmp, '.harness', 'sessions', 's1'), { recursive: true });
  log = path.join(tmp, '.harness', 'sessions', 's1', 'auto-decisions.jsonl');
});
afterEach(() => {
  cjsFs.openSync = realOpenSync;
  cjsFs.unlinkSync = realUnlinkSync;
  cjsFs.rmSync = realRmSync;
  syncBuiltinESMExports();
  fs.rmSync(tmp, { recursive: true, force: true });
});

const noWait = { platform: 'win32' as const, wait: () => {} };

describe('win32: a busy lock file is retried, not reported as a failed append', () => {
  for (const code of ['EPERM', 'EBUSY', 'EACCES']) {
    it(`retries a lock create that fails with ${code} (delete pending) and then takes the lock`, () => {
      const create = failLockCreate(code, 3);
      expect(withAppendLock(log, () => 'ran', noWait)).toBe('ran');
      expect(create.calls()).toBe(3);
      expect(fs.existsSync(`${log}.lock`)).toBe(false);
    });

    it(`retries a lock release that fails with ${code} and then removes the lock`, () => {
      const release = failLockRelease(code, 3);
      expect(withAppendLock(log, () => 'ran', noWait)).toBe('ran');
      expect(release.calls()).toBe(3);
      expect(fs.existsSync(`${log}.lock`)).toBe(false);
    });
  }

  it('an append whose lock create hits EPERM is recorded once (the CI failure)', () => {
    failLockCreate('EPERM', 2);
    const r = appendAutoDecision(tmp, 's1', entry('contended'), { ...git, appendLock: noWait });
    expect(r.ok).toBe(true);
    const read = readAutoDecisions(tmp, 's1', git);
    expect(read.ok && read.value.entries.map((e) => e.question)).toEqual(['contended']);
  });

  it('a release that stays busy does not turn a written append into a failure', () => {
    failLockRelease('EBUSY', Number.MAX_SAFE_INTEGER);
    let t = Date.now();
    const r = appendAutoDecision(tmp, 's1', entry('written'), {
      ...git,
      appendLock: { platform: 'win32', timeoutMs: 100, now: () => t, wait: () => void (t += 60) },
    });
    expect(r.ok).toBe(true);
    const read = readAutoDecisions(tmp, 's1', git);
    expect(read.ok && read.value.entries.map((e) => e.question)).toEqual(['written']);
  });
});

describe('fail-closed and POSIX behaviour are kept', () => {
  it('positive control: a lock busy beyond the total wait fails the append as AUTO_DECISION_WRITE_FAILED', () => {
    failLockCreate('EPERM', Number.MAX_SAFE_INTEGER);
    let t = Date.now();
    const opts = {
      platform: 'win32' as const,
      timeoutMs: 100,
      now: () => t,
      wait: () => void (t += 60),
    };
    expect(() => withAppendLock(log, () => 'never', opts)).toThrow(AppendLockTimeoutError);
    t = Date.now();
    const r = appendAutoDecision(tmp, 's1', entry('blocked'), { ...git, appendLock: opts });
    expect(!r.ok && (r.error as { code?: string }).code).toBe('AUTO_DECISION_WRITE_FAILED');
    expect(!r.ok && r.error.message).toMatch(/NOT recorded/);
    expect(!r.ok && r.error.message).toMatch(/EPERM/); // the last busy code is named
    expect(fs.existsSync(log)).toBe(false);
  });

  it('on POSIX an EPERM on lock create is a real error and is not retried', () => {
    const create = failLockCreate('EPERM', Number.MAX_SAFE_INTEGER);
    expect(() => withAppendLock(log, () => 'never', { platform: 'linux', wait: () => {} })).toThrow(
      /EPERM/
    );
    expect(create.calls()).toBe(1);
  });
});
