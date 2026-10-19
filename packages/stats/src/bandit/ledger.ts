import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

import type { ArmState, BanditConfig, Pull } from '@harness-engineering/types';

import { foldArms, isExpired } from './arm-model.js';
import { resolveBanditConfig, type ResolvedBanditConfig } from './config.js';
import { parseLine } from './ledger-parse.js';
import { outcomeOnly, type Utility } from './utility.js';

/** One ledger per project (D4); `.harness/metrics/` is git-ignored. Relative to the process cwd. */
export const DEFAULT_LEDGER_PATH = path.join('.harness', 'metrics', 'bandit.jsonl');

const NEWLINE_BYTE = 0x0a;
/** A missing file and a failed rewrite report the same zeros; a failure is distinguished by `onError`. */
const EMPTY_COMPACTION: CompactResult = { kept: 0, dropped: 0, bytes: 0 };

export interface BanditLedgerOptions {
  /** Ledger file; defaults to `<cwd>/.harness/metrics/bandit.jsonl`. Injectable for tests. */
  path?: string;
  /**
   * Receives IO failures from `append` and from a `fold` read that fails for
   * any reason other than a missing file. A consumer that omits it loses one
   * pull (or folds an empty ledger), never a dispatch (spec "Error handling").
   */
  onError?: (error: Error) => void;
}

export interface FoldResult {
  arms: ArmState[];
  /** Lines skipped under the malformed-line definition, counted over the whole file plus in-bucket ref mismatches. */
  malformed: number;
  /**
   * Pulls in this bucket that fell outside the retention bound
   * (`retentionHalfLives` x `halfLifeDays` before `now`) and so contributed
   * nothing. Deliberately its own field: an expired pull is well-formed, not
   * malformed. A positive count is the signal that `compact` has work to do.
   */
  expired: number;
  /** Byte length of the file that was folded (0 when missing). A hot consumer re-folds only when this changes. */
  bytes: number;
  /**
   * True when the ledger could not be read for a reason other than ENOENT
   * (EISDIR, EACCES, ...): the error went to `onError`, `arms` is empty and
   * `bytes` is 0, so a consumer can tell "unreadable" from "empty" without a throw.
   */
  readError: boolean;
}

export interface CompactResult {
  /** Lines the rewrite kept: everything within retention, plus any line whose `ts` could not be judged. */
  kept: number;
  /** Lines deleted because they fell outside the retention bound. */
  dropped: number;
  /** Byte length of the ledger after the call (0 when the file is missing or the rewrite failed). */
  bytes: number;
}

interface Bucket {
  pulls: Pull[];
  malformed: number;
  bytes: number;
  readError: boolean;
}

interface LedgerRead {
  raw: Buffer;
  readError: boolean;
}

interface ResolvedPulls {
  pulls: Pull[];
  malformed: number;
}

/** A missing file is an empty ledger; any other read failure goes to `onError` and is flagged. */
function readLedger(file: string, onError: BanditLedgerOptions['onError']): LedgerRead {
  try {
    return { raw: readFileSync(file), readError: false };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { raw: Buffer.alloc(0), readError: false };
    }
    onError?.(toError(error));
    return { raw: Buffer.alloc(0), readError: true };
  }
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

/** A newline-terminated ledger body, or the empty string when nothing is kept (never a lone newline). */
function joinLedger(lines: readonly string[], trailingNewline: boolean): string {
  if (lines.length === 0) return '';
  return lines.join('\n') + (trailingNewline ? '\n' : '');
}

/**
 * Move `tmp` onto `file`. `renameSync` replaces the destination on POSIX, and
 * normally on Windows too, but there a sharing violation surfaces as EPERM even
 * where POSIX would have succeeded (#2218). Re-check the destination on failure:
 * if it survived, the ledger is intact and the error propagates so the caller can
 * report an untouched no-op; if the rename removed it, `tmp` holds the only copy,
 * so retry onto the now-free path and let a second failure propagate.
 */
/**
 * Remove a temp file, swallowing its own failure. Cleanup runs on the error path
 * too, where the directory may be exactly what is unwritable; a throw here would
 * escape `compact` and break its never-throws-on-IO contract, replacing the real
 * failure with the cleanup's. `force` alone is not enough — it ignores a missing
 * path, not EACCES.
 */
function discard(tmp: string): void {
  try {
    rmSync(tmp, { force: true });
  } catch {
    // a leaked *.tmp is strictly better than losing the failure that caused it
  }
}

function replaceFile(tmp: string, file: string): void {
  try {
    renameSync(tmp, file);
  } catch (error) {
    if (existsSync(file)) throw error;
    renameSync(tmp, file);
  }
}

interface Partitioned {
  keep: string[];
  dropped: number;
}

/**
 * Split the ledger into the lines a fold can still use and a count of the ones it
 * cannot. Kept verbatim, so the survivors are byte-identical to their originals.
 */
function partitionByRetention(text: string, config: ResolvedBanditConfig, now: Date): Partitioned {
  const keep: string[] = [];
  let dropped = 0;
  for (const line of ledgerLines(text)) {
    const parsed = parseLine(line);
    if (parsed.ok && isExpired(parsed.pull.ts, config, now)) {
      dropped += 1;
      continue;
    }
    keep.push(line);
  }
  return { keep, dropped };
}

/** Split on newlines; only the empty segment after a trailing newline is dropped. Everything else is parsed. */
function ledgerLines(text: string): string[] {
  const lines = text.split('\n');
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

/**
 * Late scoring by `ref` (spec "Ledger"). Within one bucket, `ref` is unique:
 * a later full `Pull` with the same `ref` and a reward replaces the earlier
 * unscored line; the latest scored line wins, and its `ts` is what gets
 * decayed and reported as `lastPull`, so writers copy the dispatch `ts` onto
 * the scoring line; a scored line is never downgraded by a later unscored one. A different `arm` on the same `ref` is
 * malformed and skipped. Lines with no `ref` pass through untouched (they can
 * only be scored inline). `consumer`/`context` already match: the bucket
 * filter ran first, so the same `ref` in another bucket is a different pull.
 */
function resolveRefs(pulls: readonly Pull[]): ResolvedPulls {
  const direct: Pull[] = [];
  const byRef = new Map<string, Pull>();
  let malformed = 0;
  for (const pull of pulls) {
    if (pull.ref === undefined) {
      direct.push(pull);
      continue;
    }
    const existing = byRef.get(pull.ref);
    if (existing === undefined) {
      byRef.set(pull.ref, pull);
    } else if (existing.arm !== pull.arm) {
      malformed += 1;
    } else if (pull.reward !== undefined || existing.reward === undefined) {
      byRef.set(pull.ref, pull);
    }
  }
  return { pulls: [...direct, ...byRef.values()], malformed };
}

/**
 * Append-only JSONL ledger of bandit pulls (D4). `append` is one synchronous
 * `appendFileSync` per pull (A2, A6); `fold` re-reads the file per call.
 *
 * The retention bound is what keeps that bounded rather than growing forever:
 * the posterior is a function of only the pulls within `retentionHalfLives`
 * half-lives of `now`, and `compact` deletes exactly the lines outside it, so on
 * a compacted ledger a fold is O(lines within retention). Call `compact` on
 * whatever cadence suits the consumer — it is idempotent and cannot change a
 * posterior. Uncompacted, the read is still O(all lines); the retention skip
 * bounds the arithmetic, not the file.
 *
 * `DEFAULT_LEDGER_PATH` is relative, so it resolves against `process.cwd()` at
 * construction: a git worktree gets its own ledger, and a consumer that wants one
 * shared ledger across worktrees must pass an absolute `path`.
 */
export class BanditLedger {
  readonly path: string;
  private readonly onError: ((error: Error) => void) | undefined;
  /** True once the ledger directory has been created by this instance; reset when an append hits ENOENT. */
  private dirReady = false;

  constructor(options: BanditLedgerOptions = {}) {
    this.path = options.path ?? path.resolve(DEFAULT_LEDGER_PATH);
    this.onError = options.onError;
  }

  /** Record one pull. Never throws: IO failures go to `onError`. The directory is created once per instance. */
  append(pull: Pull): void {
    try {
      if (!this.dirReady) {
        mkdirSync(path.dirname(this.path), { recursive: true });
        this.dirReady = true;
      }
      appendFileSync(this.path, JSON.stringify(pull) + '\n');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') this.dirReady = false;
      this.onError?.(toError(error));
    }
  }

  /**
   * Fold the (consumer, context) bucket into one `ArmState` per arm at the
   * reference instant `now`. Never throws on IO: an unreadable ledger folds
   * empty with `readError: true` after notifying `onError`. Only an invalid
   * config throws.
   */
  fold(
    consumer: string,
    context: string,
    config: BanditConfig,
    now: Date,
    utility: Utility = outcomeOnly
  ): FoldResult {
    const resolved = resolveBanditConfig(config);
    const bucket = this.readBucket(consumer, context);
    const { pulls, malformed } = resolveRefs(bucket.pulls);
    return {
      arms: foldArms(pulls, resolved, now, utility),
      malformed: bucket.malformed + malformed,
      expired: pulls.filter((p) => isExpired(p.ts, resolved, now)).length,
      bytes: bucket.bytes,
      readError: bucket.readError,
    };
  }

  /**
   * Rewrite the ledger keeping only the lines a fold at `now` can still use, and
   * report `{ kept, dropped, bytes }`. This is the ledger's only bound on growth
   * and it cannot change a posterior: `fold` already skips exactly the lines this
   * deletes. Lines are judged individually by their own `ts`, which is sound
   * because a scoring line copies the dispatch `ts` (see `resolveRefs`).
   *
   * A line whose `ts` does not parse is kept verbatim — retention cannot judge it,
   * and deleting it would move the `malformed` count a consumer reads, so a
   * compaction leaves that count alone.
   *
   * Idempotent: with nothing to drop the file is not rewritten at all, so a second
   * call at the same `now` returns `dropped: 0` over identical bytes. A missing
   * file is a no-op reporting zeros that creates neither the file nor its
   * directory. Never throws on IO: a failed read or rewrite goes to `onError` and
   * reports zeros with the ledger left intact (only an invalid config throws).
   */
  compact(config: BanditConfig, now: Date): CompactResult {
    const resolved = resolveBanditConfig(config);
    const { raw, readError } = readLedger(this.path, this.onError);
    if (readError || raw.length === 0) return EMPTY_COMPACTION;
    const { keep, dropped } = partitionByRetention(raw.toString('utf8'), resolved, now);
    if (dropped === 0) return { kept: keep.length, dropped: 0, bytes: raw.length };
    return this.rewrite(keep, dropped, raw[raw.length - 1] === NEWLINE_BYTE);
  }

  /** Write the kept lines to a temp file and move it onto the ledger; report zeros if that fails. */
  private rewrite(
    keep: readonly string[],
    dropped: number,
    trailingNewline: boolean
  ): CompactResult {
    const text = joinLedger(keep, trailingNewline);
    const tmp = `${this.path}.${String(process.pid)}.tmp`;
    try {
      writeFileSync(tmp, text);
      replaceFile(tmp, this.path);
      return { kept: keep.length, dropped, bytes: Buffer.byteLength(text) };
    } catch (error) {
      this.onError?.(toError(error));
      return EMPTY_COMPACTION;
    } finally {
      discard(tmp); // no-op once the rename moved it; never leaks a *.tmp it can remove
    }
  }

  private readBucket(consumer: string, context: string): Bucket {
    const { raw, readError } = readLedger(this.path, this.onError);
    const bucket: Bucket = { pulls: [], malformed: 0, bytes: raw.length, readError };
    for (const line of ledgerLines(raw.toString('utf8'))) {
      const parsed = parseLine(line);
      if (!parsed.ok) {
        bucket.malformed += 1;
        continue;
      }
      if (parsed.pull.consumer === consumer && parsed.pull.context === context)
        bucket.pulls.push(parsed.pull);
    }
    return bucket;
  }
}
