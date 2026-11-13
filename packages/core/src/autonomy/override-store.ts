import * as fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import * as path from 'node:path';
import type {
  AutonomyOverrideOrigin,
  AutonomySessionOverride,
  AutonomySetting,
} from '@harness-engineering/types';
import type { Result } from '../shared/result';
import { Ok, Err } from '../shared/result';
import {
  auditRaises,
  isRaisingChange,
  levelRaises,
  parseSessionOverrideFields,
  validateAutonomySetting,
} from './schema';
import {
  autonomyAuditLogPath,
  computeRepoKey,
  sessionDirForRaise,
  sessionOverridePath,
  type AutonomyPathOptions,
} from './paths';

/** Default lifetime of a raised override field (D14). */
export const DEFAULT_RAISE_TTL_MS = 24 * 60 * 60 * 1000;

export interface OverrideStoreOptions extends AutonomyPathOptions {
  now?: () => Date;
  readFile?: (p: string) => string | undefined;
  /** How long a writer waits for the override lock before failing busy (default 2000ms). */
  lockTimeoutMs?: number;
  /** A lock older than this is from a crashed writer and is broken (default 30000ms). */
  staleLockMs?: number;
  /** Raise audit log (D16). Default ~/.harness/autonomy-audit.log. */
  auditLogPath?: string;
  /** Lifetime of a raised field written by this call (D14). Default DEFAULT_RAISE_TTL_MS. */
  raiseTtlMs?: number;
  /** @internal Test seam: runs inside the critical section, after the read, before the write. */
  beforeWrite?: () => void;
  /** @internal Test seam: runs after a lock is judged stale, before this writer claims it. */
  onStaleLock?: (lockPath: string) => void;
}

export const AUTONOMY_OVERRIDE_BUSY = 'AUTONOMY_OVERRIDE_BUSY';

export class AutonomyOverrideBusyError extends Error {
  readonly code = AUTONOMY_OVERRIDE_BUSY;
  constructor(lockPath: string) {
    super(
      `Another process is updating this session override (lock: ${lockPath}). Retry; if no ` +
        'writer is running, the lock is stale and is cleared automatically after 30s.'
    );
    this.name = 'AutonomyOverrideBusyError';
  }
}

export interface ReadOverrideResult {
  override: AutonomySessionOverride | null;
  warnings: string[];
  /** Present-but-corrupt fields now holding their fail-closed value (I4). */
  recovered?: Array<'level' | 'audit'>;
}

/**
 * Undefined only when the file does not exist. Any other read failure (EACCES, EISDIR, ...)
 * returns '' so it parses as corrupt and fails closed (I4) instead of reading as "no override".
 */
function defaultReadFile(p: string): string | undefined {
  try {
    return fs.readFileSync(p, 'utf-8');
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'ENOENT' ? undefined : '';
  }
}

export function readSessionOverride(
  projectPath: string,
  slug: string,
  opts: OverrideStoreOptions = {}
): Result<ReadOverrideResult, Error> {
  const p = sessionOverridePath(projectPath, slug, opts);
  if (!p.ok) return p;
  const raw = (opts.readFile ?? defaultReadFile)(p.value);
  if (raw === undefined) return Ok({ override: null, warnings: [] });
  const parsed = parseSessionOverrideFields(raw);
  if (!parsed.ok) return parsed;
  // Fail closed per field (I4): a corrupt field reads as its lowest-autonomy value.
  const warnings = parsed.value.invalid.map((msg) => `Corrupt session override ${p.value}: ${msg}`);
  return Ok({
    override: parsed.value.override,
    warnings,
    ...(parsed.value.recovered.length > 0 && { recovered: parsed.value.recovered }),
  });
}

function atomicWrite(file: string, content: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, content, { encoding: 'utf-8', mode: 0o600 });
  fs.renameSync(tmp, file);
}

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function isStale(lockPath: string, staleMs: number): boolean {
  try {
    return Date.now() - fs.statSync(lockPath).mtimeMs > staleMs;
  } catch {
    return false; // vanished between EEXIST and stat: just retry
  }
}

let claimSeq = 0;

/**
 * Atomically break a lock judged stale (N3). Two writers can both see the same stale lock; a
 * plain unlink would let the slower one delete the lock the faster one has just re-acquired.
 * Instead the lock is claimed by renaming it to a name unique to this caller — only one rename
 * of a given inode can succeed — and its staleness is re-checked on the claimed inode. If it
 * was in fact a fresh lock (re-acquired between the judgement and the rename) it is restored
 * with link(2), which never clobbers a lock created meanwhile. Returns true when this caller
 * removed a stale lock.
 * @internal Exported for the two-breaker race test.
 */
export function claimStaleLock(lockPath: string, staleMs: number): boolean {
  const claimed = `${lockPath}.stale.${process.pid}.${Date.now()}.${claimSeq++}`;
  try {
    fs.renameSync(lockPath, claimed);
  } catch {
    return false; // another breaker claimed it first (or it was released): just retry
  }
  try {
    if (isStale(claimed, staleMs)) return true;
    try {
      fs.linkSync(claimed, lockPath); // not stale after all: hand it back to its holder
    } catch {
      // A new lock already exists; the holder we displaced keeps running regardless.
    }
    return false;
  } finally {
    fs.rmSync(claimed, { force: true });
  }
}

let lockSeq = 0;

/** Unique per acquisition (a pid alone repeats across sequential writers in one process). */
function newLockToken(): string {
  return `${process.pid}:${Date.now()}:${lockSeq++}:${randomUUID()}`;
}

function readLockToken(p: string): string | undefined {
  try {
    return fs.readFileSync(p, 'utf-8');
  } catch {
    return undefined;
  }
}

/**
 * Release a lock only if this writer still owns it. If this writer overran staleLockMs, another
 * writer may have broken the lock and re-acquired it; an unconditional unlink would delete THAT
 * writer's lock. The lock is claimed by atomic rename (as in claimStaleLock), its token compared,
 * and a lock that is not ours is restored with link(2), which never clobbers a lock created
 * meanwhile. Returns true when this writer's own lock was removed.
 * @internal Exported for the ownership race test.
 */
export function releaseOverrideLock(lockPath: string, token: string): boolean {
  const claimed = `${lockPath}.release.${process.pid}.${Date.now()}.${claimSeq++}`;
  try {
    fs.renameSync(lockPath, claimed);
  } catch {
    return false; // already gone (broken by another writer, or never ours)
  }
  try {
    if (readLockToken(claimed) === token) return true;
    try {
      fs.linkSync(claimed, lockPath); // not ours: hand it back to its holder
    } catch {
      // A newer lock already exists; leave it.
    }
    return false;
  } finally {
    fs.rmSync(claimed, { force: true });
  }
}

/**
 * Run `fn` holding an O_EXCL lock file beside the override (I3), so concurrent writers serialize
 * their read-merge-write instead of one silently dropping the other's field. Same mechanism as
 * locks/compound-lock.ts, which is keyed to solution categories and cannot be reused here.
 */
function withOverrideLock<T>(
  file: string,
  opts: OverrideStoreOptions,
  fn: () => Result<T, Error>
): Result<T, Error> {
  const lockPath = `${file}.lock`;
  const deadline = Date.now() + (opts.lockTimeoutMs ?? 2000);
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const token = newLockToken();
  for (;;) {
    try {
      const fd = fs.openSync(lockPath, 'wx', 0o600);
      fs.writeSync(fd, token);
      fs.closeSync(fd);
      break;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
      const staleMs = opts.staleLockMs ?? 30_000;
      if (isStale(lockPath, staleMs)) {
        opts.onStaleLock?.(lockPath);
        claimStaleLock(lockPath, staleMs);
        continue;
      }
      if (Date.now() >= deadline) return Err(new AutonomyOverrideBusyError(lockPath));
      sleepSync(10);
    }
  }
  try {
    return fn();
  } finally {
    releaseOverrideLock(lockPath, token);
  }
}

/**
 * Merge `change` into the session override. Each written field gets its own setAt/origin;
 * untouched fields keep theirs. The change is schema-validated (a mistyped value is rejected,
 * never written). No raise/lower policy here: callers enforce it
 * (writeLoweringOverride for agent paths, the CLI TTY gate for raises).
 */
export function writeSessionOverride(
  projectPath: string,
  slug: string,
  change: AutonomySetting,
  origin: AutonomyOverrideOrigin,
  opts: OverrideStoreOptions = {}
): Result<AutonomySessionOverride, Error> {
  const valid = validateAutonomySetting(change);
  if (!valid.ok) return valid;
  if (change.level === undefined && change.audit === undefined) {
    return Err(new Error('An autonomy override requires level and/or audit'));
  }
  const p = sessionOverridePath(projectPath, slug, opts);
  if (!p.ok) return p;
  // D14: a raise is bound to a live session dir, so naming an old slug cannot inherit a grant.
  if (isRaisingChange(valid.value)) {
    const dir = sessionDirForRaise(projectPath, slug, opts);
    if (!dir.ok) return dir;
  }
  try {
    return withOverrideLock(p.value, opts, () =>
      mergeAndWrite(projectPath, slug, p.value, valid.value, origin, opts)
    );
  } catch (err) {
    return Err(err instanceof Error ? err : new Error(String(err)));
  }
}

function mergeAndWrite(
  projectPath: string,
  slug: string,
  file: string,
  change: AutonomySetting,
  origin: AutonomyOverrideOrigin,
  opts: OverrideStoreOptions
): Result<AutonomySessionOverride, Error> {
  const current = readSessionOverride(projectPath, slug, opts);
  if (!current.ok) return current;
  const now = (opts.now ?? (() => new Date()))();
  const setAt = now.toISOString();
  // D14: raised values expire; lowered values are permanent (no expiresAt).
  const expiresAt = new Date(
    now.getTime() + (opts.raiseTtlMs ?? DEFAULT_RAISE_TTL_MS)
  ).toISOString();
  const stamp = <T>(value: T, raises: boolean) => ({
    value,
    setAt,
    origin,
    ...(raises && { expiresAt }),
  });
  // A recovered (corrupt) field is persisted at its fail-closed value, restamped by this write
  // so it does not carry the far-future sentinel forever. It is never dropped (I4).
  const prior: AutonomySessionOverride = { ...(current.value.override ?? {}) };
  const recovered = current.value.recovered ?? [];
  if (prior.level && recovered.includes('level')) prior.level = { ...prior.level, setAt, origin };
  if (prior.audit && recovered.includes('audit')) prior.audit = { ...prior.audit, setAt, origin };
  const next: AutonomySessionOverride = {
    ...prior,
    ...(change.level !== undefined && { level: stamp(change.level, levelRaises(change.level)) }),
    ...(change.audit !== undefined && { audit: stamp(change.audit, auditRaises(change.audit)) }),
  };
  opts.beforeWrite?.();
  // D16: a raise is recorded BEFORE it is applied, so a raise that cannot be audited never
  // takes effect (appendRaiseAudit throws, the caller returns Err, the override is untouched).
  if (isRaisingChange(change)) {
    appendRaiseAudit(projectPath, slug, current.value.override, change, origin, setAt, opts);
  }
  atomicWrite(file, `${JSON.stringify(next, null, 2)}\n`);
  return Ok(next);
}

function appendRaiseAudit(
  projectPath: string,
  slug: string,
  prior: AutonomySessionOverride | null,
  change: AutonomySetting,
  origin: AutonomyOverrideOrigin,
  ts: string,
  opts: OverrideStoreOptions
): void {
  const logPath = opts.auditLogPath ?? autonomyAuditLogPath(opts);
  const line = {
    ts,
    session: slug,
    repoKey: computeRepoKey(projectPath, opts),
    from: { level: prior?.level?.value ?? null, audit: prior?.audit?.value ?? null },
    to: change,
    origin,
  };
  fs.mkdirSync(path.dirname(logPath), { recursive: true, mode: 0o700 });
  fs.appendFileSync(logPath, `${JSON.stringify(line)}\n`, { encoding: 'utf-8', mode: 0o600 });
}
