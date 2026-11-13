import * as fs from 'node:fs';
import * as path from 'node:path';
import type { AutoDecision, AutoDecisionInput, ResolvedAutonomy } from '@harness-engineering/types';
import type { Result } from '../shared/result';
import { Ok, Err } from '../shared/result';
import { resolveProjectRoot, validateOverrideSlug, type AutonomyPathOptions } from './paths';
import {
  AutoDecisionInvalidError,
  parseAutoDecisionLine,
  validateAutoDecisionInput,
} from './decision-schema';
import { resolveAutonomyForSession, type ResolveForSessionInput } from './session';

export const AUTO_DECISIONS_FILE = 'auto-decisions.jsonl';
/** Hard cap on one serialized entry (newline included); one entry is always one write(2). */
export const MAX_AUTO_DECISION_LINE_BYTES = 16 * 1024;

export const AUTO_DECISION_SESSION_NOT_FOUND = 'AUTO_DECISION_SESSION_NOT_FOUND';
export const AUTO_DECISION_WRITE_FAILED = 'AUTO_DECISION_WRITE_FAILED';

export class AutoDecisionSessionNotFoundError extends Error {
  readonly code = AUTO_DECISION_SESSION_NOT_FOUND;
  constructor(slug: string, dir: string) {
    super(
      `Cannot record an auto-decision for session "${slug}": ${dir} does not exist. The decision ` +
        'log never creates a session; pause and ask the human (fail-safe).'
    );
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
}

export interface AutoDecisionLogRead {
  file: string;
  present: boolean;
  entries: AutoDecision[];
  /** Lines that failed to parse (hand-edited or cut short), 1-based; never counted. */
  invalid: Array<{ line: number; error: string }>;
}

function isDirectory(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/** `<project root>/.harness/sessions/<slug>`: the resolveSessionDir layout, per worktree. */
function sessionDir(
  projectPath: string,
  slug: string,
  opts: AutonomyPathOptions
): Result<string, Error> {
  const valid = validateOverrideSlug(slug);
  if (!valid.ok) return Err(new AutoDecisionInvalidError(valid.error.message, ['session']));
  return Ok(path.join(resolveProjectRoot(projectPath, opts), '.harness', 'sessions', slug));
}

export function autoDecisionLogPath(
  projectPath: string,
  slug: string,
  opts: AutonomyPathOptions = {}
): Result<string, Error> {
  const dir = sessionDir(projectPath, slug, opts);
  return dir.ok ? Ok(path.join(dir.value, AUTO_DECISIONS_FILE)) : dir;
}

function defaultAppendBytes(file: string, data: Buffer): number {
  const fd = fs.openSync(file, 'a', 0o600);
  try {
    return fs.writeSync(fd, data, 0, data.length);
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
  const dir = sessionDir(projectPath, slug, opts);
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

/** Read the log back. Unreadable lines are reported, never silently dropped or counted. */
export function readAutoDecisions(
  projectPath: string,
  slug: string,
  opts: ReadAutoDecisionsOptions = {}
): Result<AutoDecisionLogRead, Error> {
  const dir = sessionDir(projectPath, slug, opts);
  if (!dir.ok) return dir;
  if (!isDirectory(dir.value)) return Err(new AutoDecisionSessionNotFoundError(slug, dir.value));
  const file = path.join(dir.value, AUTO_DECISIONS_FILE);
  let raw: string | undefined;
  try {
    raw = (opts.readFile ?? defaultReadFile)(file);
  } catch (err) {
    return Err(
      new Error(`Cannot read ${file}: ${err instanceof Error ? err.message : String(err)}`)
    );
  }
  if (raw === undefined) return Ok({ file, present: false, entries: [], invalid: [] });
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
    else invalid.push({ line: i + 1, error: parsed.error.message });
  });
  return Ok({ file, present: true, entries, invalid });
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
