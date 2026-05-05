import * as fs from 'node:fs';
import * as path from 'node:path';
import { ALL_SOLUTION_CATEGORIES } from '../solutions/schema';
import type { SolutionCategory } from '@harness-engineering/types';

export class CompoundLockHeldError extends Error {
  constructor(
    public readonly category: SolutionCategory,
    public readonly holderPid: number,
    public readonly lockPath: string
  ) {
    super(
      `Compound lock for category "${category}" is held by pid ${holderPid} (lock file: ${lockPath}).`
    );
    this.name = 'CompoundLockHeldError';
  }
}

export interface CompoundLockHandle {
  readonly category: SolutionCategory;
  readonly lockPath: string;
  release(): void;
}

export interface AcquireOptions {
  /** Project root; defaults to process.cwd(). */
  cwd?: string;
}

const KNOWN_CATEGORIES = new Set<string>(ALL_SOLUTION_CATEGORIES);

/**
 * Acquire a per-category file lock for /harness:compound. Lock file is
 * .harness/locks/compound-<category>.lock and contains the holder PID.
 *
 * Concurrency model: O_EXCL create. If the file exists, throws
 * CompoundLockHeldError. The handle's release() removes the file. Process
 * exit handlers ensure cleanup on crash (best-effort; SIGKILL leaves
 * stale locks — manual recovery: delete the file).
 *
 * Different categories never contend; same category serializes.
 */
export function acquireCompoundLock(
  category: SolutionCategory,
  opts: AcquireOptions = {}
): CompoundLockHandle {
  if (!KNOWN_CATEGORIES.has(category)) {
    throw new Error(
      `Unknown category "${category}". Must be one of: ${[...KNOWN_CATEGORIES].join(', ')}`
    );
  }
  const cwd = opts.cwd ?? process.cwd();
  const lockDir = path.join(cwd, '.harness', 'locks');
  fs.mkdirSync(lockDir, { recursive: true });
  const lockPath = path.join(lockDir, `compound-${category}.lock`);

  let fd: number;
  try {
    fd = fs.openSync(lockPath, 'wx');
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === 'EEXIST') {
      const holderPid = readHolderPid(lockPath);
      throw new CompoundLockHeldError(category, holderPid, lockPath);
    }
    throw err;
  }
  fs.writeSync(fd, String(process.pid));
  fs.closeSync(fd);

  let released = false;
  const release = (): void => {
    if (released) return;
    released = true;
    try {
      fs.unlinkSync(lockPath);
    } catch {
      /* lock already gone — fine */
    }
    // Detach process listeners so repeated acquire/release cycles in the
    // same process do not accumulate handlers and trip
    // MaxListenersExceededWarning. process.once auto-removes only when the
    // event fires; manual release() is the common path.
    process.removeListener('exit', onExit);
    process.removeListener('SIGINT', onExit);
    process.removeListener('SIGTERM', onExit);
    process.removeListener('uncaughtException', onUncaught);
  };
  // Ensure release on abrupt exit. Best-effort.
  const onExit = (): void => release();
  // For uncaught exceptions: release the lock, then preserve Node's default
  // behavior (print the error and terminate with a non-zero code) instead
  // of swallowing the exception and letting the process keep running in a
  // corrupted state.
  const onUncaught = (err: Error): void => {
    release();
    console.error(err && err.stack ? err.stack : err);
    process.exit(1);
  };
  process.once('exit', onExit);
  process.once('SIGINT', onExit);
  process.once('SIGTERM', onExit);
  process.once('uncaughtException', onUncaught);

  return { category, lockPath, release };
}

function readHolderPid(lockPath: string): number {
  try {
    const raw = fs.readFileSync(lockPath, 'utf-8').trim();
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) ? n : -1;
  } catch {
    return -1;
  }
}
