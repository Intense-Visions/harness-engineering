import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  AutonomyOverrideOrigin,
  AutonomySessionOverride,
  AutonomySetting,
} from '@harness-engineering/types';
import type { Result } from '../shared/result';
import { Ok, Err } from '../shared/result';
import { parseSessionOverrideFields, validateAutonomySetting } from './schema';
import { sessionOverridePath, type AutonomyPathOptions } from './paths';

export interface OverrideStoreOptions extends AutonomyPathOptions {
  now?: () => Date;
  readFile?: (p: string) => string | undefined;
  /** How long a writer waits for the override lock before failing busy (default 2000ms). */
  lockTimeoutMs?: number;
  /** A lock older than this is from a crashed writer and is broken (default 30000ms). */
  staleLockMs?: number;
  /** @internal Test seam: runs inside the critical section, after the read, before the write. */
  beforeWrite?: () => void;
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
  for (;;) {
    try {
      const fd = fs.openSync(lockPath, 'wx', 0o600);
      fs.writeSync(fd, String(process.pid));
      fs.closeSync(fd);
      break;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
      if (isStale(lockPath, opts.staleLockMs ?? 30_000)) {
        fs.rmSync(lockPath, { force: true });
        continue;
      }
      if (Date.now() >= deadline) return Err(new AutonomyOverrideBusyError(lockPath));
      sleepSync(10);
    }
  }
  try {
    return fn();
  } finally {
    fs.rmSync(lockPath, { force: true });
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
  const setAt = (opts.now ?? (() => new Date()))().toISOString();
  // A recovered (corrupt) field is persisted at its fail-closed value, restamped by this write
  // so it does not carry the far-future sentinel forever. It is never dropped (I4).
  const prior: AutonomySessionOverride = { ...(current.value.override ?? {}) };
  const recovered = current.value.recovered ?? [];
  if (prior.level && recovered.includes('level')) prior.level = { ...prior.level, setAt, origin };
  if (prior.audit && recovered.includes('audit')) prior.audit = { ...prior.audit, setAt, origin };
  const next: AutonomySessionOverride = {
    ...prior,
    ...(change.level !== undefined && { level: { value: change.level, setAt, origin } }),
    ...(change.audit !== undefined && { audit: { value: change.audit, setAt, origin } }),
  };
  opts.beforeWrite?.();
  atomicWrite(file, `${JSON.stringify(next, null, 2)}\n`);
  return Ok(next);
}
