import * as fs from 'node:fs';
import * as path from 'node:path';
import type { AutoDecision, AutoDecisionInput, ResolvedAutonomy } from '@harness-engineering/types';
import type { Result } from '../shared/result';
import { Ok, Err } from '../shared/result';
import {
  isDirectory,
  sessionDirPath,
  validateOverrideSlug,
  type AutonomyPathOptions,
} from './paths';
import {
  AutoDecisionInvalidError,
  escapeUnsafeLogText,
  parseAutoDecisionLine,
  validateAutoDecisionInput,
} from './decision-schema';
import { resolveAutonomyForSession, type ResolveForSessionInput } from './session';

export const AUTO_DECISIONS_FILE = 'auto-decisions.jsonl';
/** Hard cap on one serialized entry (newline included); one entry is always one write(2). */
export const MAX_AUTO_DECISION_LINE_BYTES = 16 * 1024;

export const AUTO_DECISION_SESSION_NOT_FOUND = 'AUTO_DECISION_SESSION_NOT_FOUND';
export const AUTO_DECISION_WRITE_FAILED = 'AUTO_DECISION_WRITE_FAILED';

const RECORD_NOT_FOUND_TAIL =
  'The auto-decision was NOT recorded (the decision log never creates a session); pause and ask ' +
  'the human (fail-safe).';
const READ_NOT_FOUND_TAIL = 'There is no decision log to read.';

export class AutoDecisionSessionNotFoundError extends Error {
  readonly code = AUTO_DECISION_SESSION_NOT_FOUND;
  /** `tail` says what this means for the caller; the default is the write path's (review S1). */
  constructor(slug: string, dir: string, tail: string = RECORD_NOT_FOUND_TAIL) {
    super(`Session "${slug}" not found: ${dir} does not exist. ${tail}`);
    this.name = 'AutoDecisionSessionNotFoundError';
  }
}

export class AutoDecisionWriteFailedError extends Error {
  readonly code = AUTO_DECISION_WRITE_FAILED;
  constructor(file: string, reason: string) {
    super(
      `Failed to append to ${file}: ${reason}. The decision was NOT recorded; pause instead of ` +
        'auto-proceeding (SC14).'
    );
    this.name = 'AutoDecisionWriteFailedError';
  }
}

export interface DecisionLogOptions extends AutonomyPathOptions {
  /** @internal Test seam: append `data` to `file`, returning the bytes written. */
  appendBytes?: (file: string, data: Buffer) => number;
}

export interface ReadAutoDecisionsOptions extends AutonomyPathOptions {
  /** Returns undefined when the file does not exist. */
  readFile?: (p: string) => string | undefined;
  /** Replaces the session-not-found tail, e.g. "Check the session slug." for a CLI reader. */
  sessionNotFoundHint?: string;
  /**
   * When the live session dir is gone, read the newest archived copy
   * (`.harness/archive/sessions/<slug>-<YYYY-MM-DD>[-<n>]`, the archiveSession naming).
   */
  archiveFallback?: boolean;
}

export interface AutoDecisionLogRead {
  file: string;
  /** True when the live session dir was gone and an archived copy was read. */
  archived: boolean;
  /** Archived copies of this slug older than the one read (0 when the live dir was read). */
  olderArchives: number;
  present: boolean;
  entries: AutoDecision[];
  /** Lines that failed to parse (hand-edited or cut short), 1-based; never counted. */
  invalid: Array<{ line: number; error: string }>;
}

/** The session dir (paths.sessionDirPath); a bad slug is AUTO_DECISION_INVALID on `session`. */
function sessionDir(projectPath: string, slug: string): Result<string, Error> {
  const dir = sessionDirPath(projectPath, slug);
  return dir.ok ? dir : Err(new AutoDecisionInvalidError(dir.error.message, ['session']));
}

export function autoDecisionLogPath(projectPath: string, slug: string): Result<string, Error> {
  const dir = sessionDir(projectPath, slug);
  return dir.ok ? Ok(path.join(dir.value, AUTO_DECISIONS_FILE)) : dir;
}

const NEWLINE = 0x0a;

/** True when the file's last byte is not a newline (a cut-short line), read via `fd`. */
function endsMidLine(fd: number): boolean {
  const size = fs.fstatSync(fd).size;
  if (size === 0) return false;
  const last = Buffer.alloc(1);
  fs.readSync(fd, last, 0, 1, size - 1);
  return last[0] !== NEWLINE;
}

/**
 * One write(2) on an O_APPEND descriptor ('a+' = append-only writes, plus reads for the tail
 * check). If the log ends mid-line (a cut-short write), a newline is prepended in the SAME write
 * so the fragment cannot swallow this entry (review S2). Returns the bytes of `data` written.
 */
function defaultAppendBytes(file: string, data: Buffer): number {
  const fd = fs.openSync(file, 'a+', 0o600);
  try {
    const prefix = endsMidLine(fd) ? 1 : 0;
    const out = prefix ? Buffer.concat([Buffer.from([NEWLINE]), data]) : data;
    return fs.writeSync(fd, out, 0, out.length) - prefix;
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * Append one entry as one line. Append-only: the file is opened only in append mode and this
 * module never rewrites or deletes it. The whole line is a single write(2) on an O_APPEND
 * descriptor, so concurrent writers never interleave partial lines. The entry is NOT validated
 * here; recordAutoDecision (below) is the public path (validate, authorize, stamp, then append).
 * Exported for tests only: the autonomy barrel does not re-export it.
 */
export function appendAutoDecision(
  projectPath: string,
  slug: string,
  entry: AutoDecision,
  opts: DecisionLogOptions = {}
): Result<string, Error> {
  const dir = sessionDir(projectPath, slug);
  if (!dir.ok) return dir;
  if (!isDirectory(dir.value)) return Err(new AutoDecisionSessionNotFoundError(slug, dir.value));
  const file = path.join(dir.value, AUTO_DECISIONS_FILE);
  const data = Buffer.from(`${JSON.stringify(entry)}\n`, 'utf-8');
  if (data.length > MAX_AUTO_DECISION_LINE_BYTES) {
    return Err(
      new AutoDecisionInvalidError(
        `entry serializes to ${data.length} bytes; the limit is ${MAX_AUTO_DECISION_LINE_BYTES}. Shorten question or rationale.`,
        ['entry']
      )
    );
  }
  try {
    const written = (opts.appendBytes ?? defaultAppendBytes)(file, data);
    if (written !== data.length) {
      return Err(
        new AutoDecisionWriteFailedError(file, `partial write (${written} of ${data.length} bytes)`)
      );
    }
  } catch (err) {
    return Err(
      new AutoDecisionWriteFailedError(file, err instanceof Error ? err.message : String(err))
    );
  }
  return Ok(file);
}

function defaultReadFile(p: string): string | undefined {
  try {
    return fs.readFileSync(p, 'utf-8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw err;
  }
}

const ARCHIVE_SUFFIX = /^(\d{4}-\d{2}-\d{2})(?:-(\d+))?$/;

/** Newest `<slug>-<date>[-<n>]` dir beside the live sessions dir, and how many older ones exist. */
function newestArchivedSessionDir(
  liveDir: string,
  slug: string
): { dir: string; older: number } | undefined {
  const base = path.join(liveDir, '..', '..', 'archive', 'sessions');
  let names: string[];
  try {
    names = fs.readdirSync(base);
  } catch {
    return undefined;
  }
  const copies = names
    .flatMap((name) => {
      const m = name.startsWith(`${slug}-`)
        ? ARCHIVE_SUFFIX.exec(name.slice(slug.length + 1))
        : null;
      return m ? [{ name, date: m[1] ?? '', n: Number(m[2] ?? 0) }] : [];
    })
    .filter((c) => isDirectory(path.join(base, c.name)))
    .sort((a, b) => (a.date === b.date ? b.n - a.n : b.date.localeCompare(a.date)));
  const newest = copies[0];
  return newest && { dir: path.join(base, newest.name), older: copies.length - 1 };
}

/** The directory to read: the live session dir, else (if allowed) its newest archived copy. */
function locateSessionForRead(
  liveDir: string,
  slug: string,
  opts: ReadAutoDecisionsOptions
): Result<{ dir: string; archived: boolean; older: number }, Error> {
  if (isDirectory(liveDir)) return Ok({ dir: liveDir, archived: false, older: 0 });
  const copy = opts.archiveFallback ? newestArchivedSessionDir(liveDir, slug) : undefined;
  if (copy !== undefined) return Ok({ dir: copy.dir, archived: true, older: copy.older });
  const tail = opts.sessionNotFoundHint ?? READ_NOT_FOUND_TAIL;
  return Err(new AutoDecisionSessionNotFoundError(slug, liveDir, tail));
}

/** Read the log back. Unreadable lines are reported, never silently dropped or counted. */
export function readAutoDecisions(
  projectPath: string,
  slug: string,
  opts: ReadAutoDecisionsOptions = {}
): Result<AutoDecisionLogRead, Error> {
  const dir = sessionDir(projectPath, slug);
  if (!dir.ok) return dir;
  const located = locateSessionForRead(dir.value, slug, opts);
  if (!located.ok) return located;
  const { archived, older: olderArchives } = located.value;
  const file = path.join(located.value.dir, AUTO_DECISIONS_FILE);
  let raw: string | undefined;
  try {
    raw = (opts.readFile ?? defaultReadFile)(file);
  } catch (err) {
    return Err(
      new Error(`Cannot read ${file}: ${err instanceof Error ? err.message : String(err)}`)
    );
  }
  if (raw === undefined)
    return Ok({ file, archived, olderArchives, present: false, entries: [], invalid: [] });
  const lines = raw.split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  const entries: AutoDecision[] = [];
  const invalid: AutoDecisionLogRead['invalid'] = [];
  lines.forEach((line, i) => {
    if (line.trim() === '') {
      invalid.push({ line: i + 1, error: 'blank line' });
      return;
    }
    const parsed = parseAutoDecisionLine(line);
    if (parsed.ok) entries.push(parsed.value);
    // Parse errors echo the raw line; escape it so --json never carries C1/bidi (review S6).
    else invalid.push({ line: i + 1, error: escapeUnsafeLogText(parsed.error.message) });
  });
  return Ok({ file, archived, olderArchives, present: true, entries, invalid });
}

// --- recordAutoDecision: the only public write path -------------------------------------

export const AUTO_DECISION_NOT_AUTHORIZED = 'AUTO_DECISION_NOT_AUTHORIZED';

export class AutoDecisionNotAuthorizedError extends Error {
  readonly code = AUTO_DECISION_NOT_AUTHORIZED;
  constructor(message: string) {
    super(`${message} Pause and ask the human (fail-safe).`);
    this.name = 'AutoDecisionNotAuthorizedError';
  }
}

/** No invocation flag: a flag relayed by an agent is agent-asserted (Phase 1 deferral to Phase 3). */
export type RecordAutoDecisionOptions = DecisionLogOptions &
  Omit<ResolveForSessionInput, 'projectPath' | 'session' | 'flag'>;

/**
 * The log records only what the resolved autonomy permitted. Anything else is refused, and a
 * refused log entry makes the skill pause (fail-safe rule), so on the sanctioned path an agent
 * cannot auto-proceed while supervised or skip an audit that is on. Escalated entries get no
 * exemption: "the human chose X" is still the agent's report, so outside trusted mode it would
 * let an agent log a fabricated escalation (review I1). Supervised mode records nothing.
 */
export function authorizationError(
  d: AutoDecisionInput,
  r: ResolvedAutonomy
): AutoDecisionNotAuthorizedError | null {
  if (r.level !== 'trusted') {
    return new AutoDecisionNotAuthorizedError(
      `Autonomy resolves to ${r.level} (source: ${r.source.level}); only trusted mode may auto-take a ${d.pauseClass} decision.`
    );
  }
  if (d.audit?.status === 'off' && r.audit) {
    return new AutoDecisionNotAuthorizedError(
      `Audit is on (source: ${r.source.audit}); a judgment cannot be recorded with audit "off". Run the self-audit, or record "unavailable" if no subagent can be spawned (D11).`
    );
  }
  return null;
}

/**
 * The only public write path for auto-decisions.jsonl. Order: validate the slug (shared rule),
 * validate the entry (strict; caller ts/autonomySource rejected), resolve autonomy for the
 * session, authorize, stamp ts and autonomySource, append one line. Never throws.
 */
export function recordAutoDecision(
  projectPath: string,
  session: unknown,
  input: unknown,
  opts: RecordAutoDecisionOptions = {}
): Result<AutoDecision, Error> {
  try {
    const slug = validateOverrideSlug(session as string);
    if (!slug.ok) return Err(new AutoDecisionInvalidError(slug.error.message, ['session']));
    const valid = validateAutoDecisionInput(input);
    if (!valid.ok) return valid;
    const resolved = resolveAutonomyForSession({ ...opts, projectPath, session: slug.value });
    const denied = authorizationError(valid.value, resolved);
    if (denied) return Err(denied);
    const entry: AutoDecision = {
      ts: (opts.now ?? (() => new Date()))().toISOString(),
      ...valid.value,
      autonomySource: resolved.source.level,
    };
    const appended = appendAutoDecision(projectPath, slug.value, entry, opts);
    return appended.ok ? Ok(entry) : appended;
  } catch (err) {
    return Err(err instanceof Error ? err : new Error(String(err)));
  }
}
