import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import type { ArmState, BanditConfig, Pull } from '@harness-engineering/types';

import { foldArms } from './arm-model.js';
import { resolveBanditConfig } from './config.js';
import { parseLine } from './ledger-parse.js';
import { outcomeOnly, type Utility } from './utility.js';

/** One ledger per project (D4); `.harness/metrics/` is git-ignored. Relative to the process cwd. */
export const DEFAULT_LEDGER_PATH = path.join('.harness', 'metrics', 'bandit.jsonl');

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
  /** Byte length of the file that was folded (0 when missing). A hot consumer re-folds only when this changes. */
  bytes: number;
  /**
   * True when the ledger could not be read for a reason other than ENOENT
   * (EISDIR, EACCES, ...): the error went to `onError`, `arms` is empty and
   * `bytes` is 0, so a consumer can tell "unreadable" from "empty" without a throw.
   */
  readError: boolean;
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

/** Split on newlines; only the empty segment after a trailing newline is dropped. Everything else is parsed. */
function ledgerLines(text: string): string[] {
  const lines = text.split('\n');
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

/**
 * Late scoring by `ref` (spec "Ledger"). Within one bucket, `ref` is unique:
 * a later full `Pull` with the same `ref` and a reward replaces the earlier
 * unscored line; the latest scored line wins; a scored line is never
 * downgraded by a later unscored one. A different `arm` on the same `ref` is
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
 * `appendFileSync` per pull (A2, A6); `fold` re-reads the whole file per call
 * in this phase (spec: O(lines); incremental fold is the routing consumer's).
 */
export class BanditLedger {
  readonly path: string;
  private readonly onError: ((error: Error) => void) | undefined;

  constructor(options: BanditLedgerOptions = {}) {
    this.path = options.path ?? path.resolve(DEFAULT_LEDGER_PATH);
    this.onError = options.onError;
  }

  /** Record one pull. Never throws: IO failures go to `onError`. */
  append(pull: Pull): void {
    try {
      mkdirSync(path.dirname(this.path), { recursive: true });
      appendFileSync(this.path, JSON.stringify(pull) + '\n');
    } catch (error) {
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
      bytes: bucket.bytes,
      readError: bucket.readError,
    };
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
