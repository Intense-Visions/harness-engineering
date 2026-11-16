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
 *
 * Windows (#2596): while the previous holder's lock file is being deleted (delete pending),
 * creating it fails with EPERM rather than EEXIST, and unlinking a lock another process has open
 * can fail with EPERM, EBUSY or EACCES. On win32 those codes mean "busy, retry" for both create
 * and release; on POSIX they remain real errors.
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
  /** @internal Test seam: the platform whose lock-file error semantics apply. */
  platform?: NodeJS.Platform;
}

/** Generous: the decision log is low-frequency, and a contended CI runner can be slow. */
export const APPEND_LOCK_TIMEOUT_MS = 30_000;
/** A holder keeps the lock for one tail read and one write; 10 s is far beyond a live holder. */
export const APPEND_LOCK_STALE_MS = 10_000;

/** Codes that, on win32, mean the lock file is busy (delete pending or open elsewhere). */
const WIN32_BUSY_CODES = new Set(['EPERM', 'EBUSY', 'EACCES']);

const sleepCell = new Int32Array(new SharedArrayBuffer(4));
function sleepMs(ms: number): void {
  Atomics.wait(sleepCell, 0, 0, ms);
}
const backoff = (attempt: number): number => Math.min(2 ** attempt, 25);

export class AppendLockTimeoutError extends Error {
  constructor(lockPath: string, timeoutMs: number, lastBusyCode?: string) {
    const why = lastBusyCode ? ` (last busy: ${lastBusyCode})` : '';
    super(`lock ${lockPath} was held by another writer for over ${timeoutMs} ms${why}`);
    this.name = 'AppendLockTimeoutError';
  }
}

/** The error code if `err` means the lock is busy on `platform`, else undefined. */
function busyCode(err: unknown, platform: NodeJS.Platform): string | undefined {
  const code = (err as NodeJS.ErrnoException).code;
  if (code === 'EEXIST') return code;
  if (platform === 'win32' && code !== undefined && WIN32_BUSY_CODES.has(code)) return code;
  return undefined;
}

/** Create the lock. Returns undefined on success, else the busy code (lock held / not yet gone). */
function tryCreate(lockPath: string, platform: NodeJS.Platform): string | undefined {
  let fd: number;
  try {
    fd = fs.openSync(lockPath, 'wx', 0o600);
  } catch (err) {
    const code = busyCode(err, platform);
    if (code) return code;
    throw err;
  }
  try {
    fs.writeSync(fd, String(process.pid));
  } finally {
    fs.closeSync(fd);
  }
  return undefined;
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

/**
 * Remove our lock. On win32 a busy unlink is retried within `timeoutMs`; if it stays busy, the
 * lock is left for the stale-lock breaker rather than failing `fn`, whose write already landed.
 */
function release(lockPath: string, timeoutMs: number, opts: AppendLockOptions): void {
  const platform = opts.platform ?? process.platform;
  const now = opts.now ?? Date.now;
  const start = now();
  for (let attempt = 0; ; attempt++) {
    try {
      fs.rmSync(lockPath, { force: true });
      return;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (platform !== 'win32' || code === undefined || !WIN32_BUSY_CODES.has(code)) throw err;
      if (now() - start > timeoutMs) return; // stale after staleMs; the next writer breaks it
    }
    (opts.wait ?? ((n: number) => sleepMs(backoff(n))))(attempt);
  }
}

/** Run `fn` while holding `<file>.lock`. Throws AppendLockTimeoutError if it cannot be taken. */
export function withAppendLock<T>(file: string, fn: () => T, opts: AppendLockOptions = {}): T {
  const lockPath = `${file}.lock`;
  const timeoutMs = opts.timeoutMs ?? APPEND_LOCK_TIMEOUT_MS;
  const staleMs = opts.staleMs ?? APPEND_LOCK_STALE_MS;
  const now = opts.now ?? Date.now;
  const platform = opts.platform ?? process.platform;
  const start = now();
  for (let attempt = 0; ; attempt++) {
    const busy = tryCreate(lockPath, platform);
    if (busy === undefined) break;
    const t = now();
    if (t - start > timeoutMs) throw new AppendLockTimeoutError(lockPath, timeoutMs, busy);
    breakIfStale(lockPath, staleMs, t);
    (opts.wait ?? ((n: number) => sleepMs(backoff(n))))(attempt);
  }
  try {
    return fn();
  } finally {
    release(lockPath, timeoutMs, opts);
  }
}
