import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createRequire, syncBuiltinESMExports } from 'node:module';
import type { AutoDecision } from '@harness-engineering/types';
import { appendAutoDecision, readAutoDecisions } from '../../src/autonomy/decision-log';
import { withAppendLock } from '../../src/autonomy/append-lock';

/**
 * Deterministic model of the ubuntu CI failure (run 43766297766: `blank line` at 116 and 118).
 * On Linux a write(2) to a regular file holds the inode lock, so two appends never interleave,
 * but i_size grows page by page DURING the copy and fstat/pread do not take that lock. A second
 * writer that inspects the tail while the first is mid-copy sees a line with no newline, takes
 * it for a cut-short write, prepends "\n" — and its own write(2) then queues behind the first,
 * which finishes its line. Result: an empty line in the audit log.
 *
 * The model: writer A is in flight (its first page is visible, no newline yet, and it holds the
 * log's append lock as any live writer does); A's write completes before any other write(2) to
 * the log proceeds (the inode-lock ordering) or when the waiter backs off on A's lock.
 */
const git = { gitCommonDir: () => undefined };
const entry = (q: string): AutoDecision => ({
  ts: '2026-11-15T00:00:00.000Z',
  skill: 'harness-planning',
  phase: 'VALIDATE',
  pauseClass: 'ceremony',
  question: q,
  options: ['approve'],
  chosen: 'approve',
  rationale: 'r'.repeat(3000),
  autonomySource: 'user-config',
});

let tmp: string;
let log: string;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'autonomy-dlog-inflight-'));
  fs.mkdirSync(path.join(tmp, '.harness', 'sessions', 's1'), { recursive: true });
  log = path.join(tmp, '.harness', 'sessions', 's1', 'auto-decisions.jsonl');
});
const cjsFs = createRequire(import.meta.url)('node:fs') as typeof fs;
const realWriteSync = cjsFs.writeSync;
const realFstatSync = cjsFs.fstatSync;
afterEach(() => {
  cjsFs.writeSync = realWriteSync;
  syncBuiltinESMExports();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('an append that races an in-flight writer', () => {
  it('never mistakes the in-flight line for a cut-short one (no blank line)', () => {
    const a = `${JSON.stringify(entry('A'))}\n`;
    const head = a.slice(0, 2048); // the part of A already visible to fstat/pread
    fs.writeFileSync(log, `${JSON.stringify(entry('L1'))}\n${head}`);
    const lock = `${log}.lock`;
    fs.writeFileSync(lock, '999999'); // A is a live writer: it holds the append lock
    const logIno = fs.statSync(log).ino;

    let aDone = false;
    const finishA = (): void => {
      if (aDone) return;
      aDone = true;
      fs.appendFileSync(log, a.slice(2048));
      fs.rmSync(lock, { force: true });
    };
    // The ESM namespace of a builtin is not spy-able; patch the CommonJS object and resync.
    cjsFs.writeSync = ((fd: number, ...rest: unknown[]) => {
      if (!aDone && realFstatSync(fd).ino === logIno) finishA(); // inode-lock ordering
      return (realWriteSync as (...a: unknown[]) => number)(fd, ...rest);
    }) as typeof fs.writeSync;
    syncBuiltinESMExports();

    const r = appendAutoDecision(tmp, 's1', entry('B'), { ...git, appendLock: { wait: finishA } });
    expect(r.ok).toBe(true);
    finishA();
    const read = readAutoDecisions(tmp, 's1', git);
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.value.invalid).toEqual([]);
    expect(read.value.entries.map((e) => e.question)).toEqual(['L1', 'A', 'B']);
    expect(fs.existsSync(lock)).toBe(false);
  });
});

describe('the append lock', () => {
  const lockOf = () => `${log}.lock`;
  it('is released after a successful append and after a throwing one', () => {
    expect(appendAutoDecision(tmp, 's1', entry('ok'), git).ok).toBe(true);
    expect(fs.existsSync(lockOf())).toBe(false);
    expect(() =>
      withAppendLock(log, () => {
        throw new Error('boom');
      })
    ).toThrow('boom');
    expect(fs.existsSync(lockOf())).toBe(false);
  });
  it('a lock held past the timeout fails the append as AUTO_DECISION_WRITE_FAILED (fail-safe)', () => {
    fs.writeFileSync(lockOf(), '999999');
    let t = Date.now();
    expect(() =>
      withAppendLock(log, () => 'never', {
        staleMs: Number.MAX_SAFE_INTEGER,
        timeoutMs: 100,
        now: () => t,
        wait: () => {
          t += 60;
        },
      })
    ).toThrow(/held by another writer/);
    t = Date.now();
    const r = appendAutoDecision(tmp, 's1', entry('blocked'), {
      ...git,
      appendLock: {
        staleMs: Number.MAX_SAFE_INTEGER,
        timeoutMs: 100,
        now: () => t,
        wait: () => void (t += 60),
      },
    });
    expect(!r.ok && (r.error as { code?: string }).code).toBe('AUTO_DECISION_WRITE_FAILED');
    expect(!r.ok && r.error.message).toMatch(/NOT recorded/);
    expect(fs.existsSync(log)).toBe(false);
    expect(fs.existsSync(lockOf())).toBe(true); // the live holder's lock is left alone
  });
  it('breaks a stale lock left by a writer that died mid-append', () => {
    fs.writeFileSync(lockOf(), '999999');
    const old = new Date(Date.now() - 60_000);
    fs.utimesSync(lockOf(), old, old);
    expect(appendAutoDecision(tmp, 's1', entry('after-crash'), git).ok).toBe(true);
    expect(fs.existsSync(lockOf())).toBe(false);
    const read = readAutoDecisions(tmp, 's1', git);
    expect(read.ok && read.value.entries.map((e) => e.question)).toEqual(['after-crash']);
    expect(fs.readdirSync(path.dirname(log)).sort()).toEqual(['auto-decisions.jsonl']);
  });
});
