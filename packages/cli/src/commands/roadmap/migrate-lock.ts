import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

/**
 * REV-P5-S7: advisory lockfile for `harness roadmap migrate`.
 *
 * Migration mutates external state (GitHub issues, local roadmap.md,
 * harness.config.json). Concurrent invocations from two terminals (or two
 * CI workers) would interleave create/update calls and corrupt the project
 * state. The lockfile is advisory — it cannot prevent malicious or root
 * processes from clobbering it — but it catches the realistic accidental
 * concurrent case.
 *
 * Location: `<projectRoot>/.harness/migrate.lock`. The directory is created
 * if missing.
 *
 * Contents: `{ pid, startedAt, hostname }` — JSON. `pid` is checked against
 * the live process table on next acquire; a dead PID OR a lock older than
 * STALE_LOCK_MS triggers automatic stale-lock recovery. The whole acquire
 * is wrapped in a try/finally so process crashes leave a stale lock that
 * the NEXT run cleans up.
 *
 * Refused acquire returns null; the CLI translates that into a refusal
 * message and exits with GENERIC_FAILURE. Successful acquire returns a
 * release() callback the caller must invoke in a finally.
 */

const LOCK_FILE_NAME = 'migrate.lock';
const STALE_LOCK_MS = 30 * 60 * 1000;

export interface LockfilePayload {
  pid: number;
  startedAt: string;
  hostname: string;
}

export interface AcquireResult {
  release: () => void;
}

export interface AcquireRefusal {
  reason: 'in-progress';
  existing: LockfilePayload;
  message: string;
}

/**
 * Test seam: process-table check. Returns true if `pid` is currently a
 * running process. On most POSIX systems, `process.kill(pid, 0)` throws
 * ESRCH when the pid is dead; this matches the standard idiom.
 */
export function isPidAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Acquire the migrate lockfile. Returns either a `release` handle on
 * success, or a refusal payload describing why.
 *
 * Stale-lock recovery: if the existing lockfile points at a dead pid OR
 * is older than STALE_LOCK_MS, the lock is silently overwritten.
 */
export function acquireMigrateLock(projectRoot: string): AcquireResult | AcquireRefusal {
  const harnessDir = path.join(projectRoot, '.harness');
  const lockPath = path.join(harnessDir, LOCK_FILE_NAME);
  if (!fs.existsSync(harnessDir)) fs.mkdirSync(harnessDir, { recursive: true });

  if (fs.existsSync(lockPath)) {
    const existingRaw = (() => {
      try {
        return fs.readFileSync(lockPath, 'utf-8');
      } catch {
        return null;
      }
    })();
    const existing = (() => {
      if (!existingRaw) return null;
      try {
        return JSON.parse(existingRaw) as LockfilePayload;
      } catch {
        return null;
      }
    })();
    if (existing) {
      const ageMs = Date.now() - new Date(existing.startedAt).getTime();
      const stale = !isPidAlive(existing.pid) || ageMs > STALE_LOCK_MS;
      if (!stale) {
        return {
          reason: 'in-progress',
          existing,
          message: `another migration is in progress (pid ${existing.pid} on ${existing.hostname}, started ${existing.startedAt})`,
        };
      }
      // Stale: fall through to overwrite.
    }
    // Unparseable lock file: treat as stale and overwrite.
  }

  const payload: LockfilePayload = {
    pid: process.pid,
    startedAt: new Date().toISOString(),
    hostname: os.hostname(),
  };
  fs.writeFileSync(lockPath, JSON.stringify(payload, null, 2) + '\n');

  return {
    release: () => {
      try {
        fs.unlinkSync(lockPath);
      } catch {
        // Already removed (e.g. by a stale-recovery in another process).
        // Silent: best-effort cleanup.
      }
    },
  };
}

export function isRefusal(r: AcquireResult | AcquireRefusal): r is AcquireRefusal {
  return (r as AcquireRefusal).reason === 'in-progress';
}
