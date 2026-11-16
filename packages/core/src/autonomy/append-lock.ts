import * as fs from 'node:fs';

/**
 * A synchronous per-file lock for appenders that must read the file's tail and then write
 * (decision-log's cut-short-line repair). O_APPEND makes each write(2) land at the end, but on
 * Linux a concurrent fstat/pread can observe another writer's line mid-copy, so "check the tail,
 * then write" is only sound while no other appender is in between (#2535).
 *
 * Model: `<file>.lock`, created with O_EXCL ('wx') and holding the holder's pid (the
 * state/learnings.ts precedent, made synchronous). A holder keeps it for one tail read and one
 * write. A lock older than `staleMs` is from a holder that died mid-append and is broken.
 */
export interface AppendLockOptions {
  /** Give up after this long (ms). */
  timeoutMs?: number;
  /** A lock file older than this (ms) is stale and broken. */
  staleMs?: number;
  /** @internal Test seam: called instead of sleeping while the lock is held by another writer. */
  wait?: (attempt: number) => void;
  /** @internal Test seam: the clock. */
  now?: () => number;
}

export const APPEND_LOCK_TIMEOUT_MS = 8_000;
export const APPEND_LOCK_STALE_MS = 5_000;

const sleepCell = new Int32Array(new SharedArrayBuffer(4));
function sleepMs(ms: number): void {
  Atomics.wait(sleepCell, 0, 0, ms);
}
const backoff = (attempt: number): number => Math.min(2 ** attempt, 25);

export class AppendLockTimeoutError extends Error {
  constructor(lockPath: string, timeoutMs: number) {
    super(`lock ${lockPath} was held by another writer for over ${timeoutMs} ms`);
    this.name = 'AppendLockTimeoutError';
  }
}

function tryCreate(lockPath: string): boolean {
  let fd: number;
  try {
    fd = fs.openSync(lockPath, 'wx', 0o600);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'EEXIST') return false;
    throw err;
  }
  try {
    fs.writeSync(fd, String(process.pid));
  } finally {
    fs.closeSync(fd);
  }
  return true;
}

/**
 * Break `lockPath` if it is stale. Rename is atomic, so of two breakers only one moves a given
 * lock; if the file moved is not the one judged stale (a fresh lock created in between), it is
 * linked back so the live holder keeps it.
 */
function breakIfStale(lockPath: string, staleMs: number, now: number): void {
  let st: fs.Stats;
  try {
    st = fs.statSync(lockPath);
  } catch {
    return; // released meanwhile
  }
  if (now - st.mtimeMs <= staleMs) return;
  const aside = `${lockPath}.stale-${process.pid}-${now}`;
  try {
    fs.renameSync(lockPath, aside);
  } catch {
    return; // another breaker moved it, or it was released
  }
  try {
    if (fs.statSync(aside).ino !== st.ino) fs.linkSync(aside, lockPath);
  } catch {
    /* a new holder already exists; it keeps the lock */
  }
  fs.rmSync(aside, { force: true });
}

/** Run `fn` while holding `<file>.lock`. Throws AppendLockTimeoutError if it cannot be taken. */
export function withAppendLock<T>(file: string, fn: () => T, opts: AppendLockOptions = {}): T {
  const lockPath = `${file}.lock`;
  const timeoutMs = opts.timeoutMs ?? APPEND_LOCK_TIMEOUT_MS;
  const staleMs = opts.staleMs ?? APPEND_LOCK_STALE_MS;
  const now = opts.now ?? Date.now;
  const start = now();
  for (let attempt = 0; !tryCreate(lockPath); attempt++) {
    const t = now();
    if (t - start > timeoutMs) throw new AppendLockTimeoutError(lockPath, timeoutMs);
    breakIfStale(lockPath, staleMs, t);
    (opts.wait ?? ((n: number) => sleepMs(backoff(n))))(attempt);
  }
  try {
    return fn();
  } finally {
    fs.rmSync(lockPath, { force: true });
  }
}
