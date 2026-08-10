import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
  writeSync,
} from 'node:fs';
import path from 'node:path';

import type { BurnPaths } from './config';
import type { UsageRecord } from './types';

/**
 * Write via temp + rename.
 *
 * A plain truncating write leaves a short file if the process is killed or a
 * racing writer lands mid-write, and a short file still parses — which is how
 * 85% of the record store was lost on 2026-08-04 while the HUD went on
 * reporting a comfortable green.
 */
export function atomicWrite(target: string, contents: string): void {
  mkdirSync(path.dirname(target), { recursive: true });
  const tmp = `${target}.tmp`;
  const fd = openSync(tmp, 'w');
  try {
    writeSync(fd, contents);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(tmp, target);
}

/**
 * Cross-process scan lock.
 *
 * PORTING NOTE: the Python HUD used `fcntl.flock`, which the kernel releases
 * when the holder dies. Node has no `flock` in its standard library, so this
 * uses an atomic `mkdir` instead — equally exclusive, but NOT auto-released,
 * so a crashed holder would otherwise wedge every future scan. The staleness
 * reclaim below is what replaces the kernel's cleanup: a lock whose owner is
 * gone, or which is older than a scan could plausibly take, is broken.
 */
const LOCK_STALE_MS = 60_000;
const LOCK_POLL_MS = 150;

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function holderIsGone(lockDir: string): boolean {
  let meta: { pid?: number; at?: number };
  try {
    meta = JSON.parse(readFileSync(path.join(lockDir, 'owner.json'), 'utf8')) as {
      pid?: number;
      at?: number;
    };
  } catch {
    // No readable owner record: either mid-acquisition or debris. Treat as
    // stale only once it is old enough that it cannot be mid-acquisition.
    return false;
  }
  if (typeof meta.at === 'number' && Date.now() - meta.at > LOCK_STALE_MS) return true;
  if (typeof meta.pid === 'number') {
    try {
      process.kill(meta.pid, 0);
      return false;
    } catch (err) {
      // EPERM means the process exists but belongs to another user — alive.
      return (err as NodeJS.ErrnoException).code !== 'EPERM';
    }
  }
  return false;
}

/**
 * Run `fn` under the scan lock. `fn` receives whether the lock was actually
 * acquired; a caller that did not get it must NOT write the store — joining in
 * is the very race the lock exists to prevent.
 */
export function withScanLock<T>(
  paths: BurnPaths,
  fn: (acquired: boolean) => T,
  timeoutMs = 6000
): T {
  mkdirSync(paths.state, { recursive: true });
  const lockDir = paths.lock;
  const deadline = Date.now() + timeoutMs;
  let acquired = false;

  while (Date.now() < deadline) {
    try {
      mkdirSync(lockDir);
      writeFileSync(
        path.join(lockDir, 'owner.json'),
        JSON.stringify({ pid: process.pid, at: Date.now() })
      );
      acquired = true;
      break;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
      if (holderIsGone(lockDir)) {
        try {
          rmSync(lockDir, { recursive: true, force: true });
        } catch {
          // Another process won the reclaim; fall through and retry normally.
        }
        continue;
      }
      sleepSync(LOCK_POLL_MS);
    }
  }

  try {
    return fn(acquired);
  } finally {
    if (acquired) {
      try {
        rmSync(lockDir, { recursive: true, force: true });
      } catch {
        // Losing the release only costs the next scan a staleness reclaim.
      }
    }
  }
}

/**
 * On-disk record format version.
 *
 * Bump it whenever the column count changes. A fingerprint written under an
 * older version asserts "already scanned" over rows that cannot carry the
 * new columns, which would pin the whole store to its migration default
 * forever. Dropping those fingerprints makes the migration a stated event
 * — one full rescan — rather than a silent, permanent mislabelling.
 */
export const STORE_VERSION = 2;

export interface Fingerprints {
  /** absolute transcript path -> [mtime seconds, size bytes] */
  fingerprints: Map<string, string>;
  /** Record count asserted by the header, or null when absent. */
  expected: number | null;
  /** Format version asserted by the header, or null when absent (pre-migration). */
  version: number | null;
}

/**
 * Read scan fingerprints plus the record count they claim to describe.
 *
 * The count lives in this file's header so it lands in the SAME atomic write as
 * the fingerprints. That pairing is what lets a later scan notice the record
 * store lost rows: fingerprints alone would go on asserting "already scanned"
 * over a gutted store forever.
 */
export function readFingerprints(paths: BurnPaths): Fingerprints {
  const fingerprints = new Map<string, string>();
  let expected: number | null = null;
  let version: number | null = null;
  if (!existsSync(paths.filesTsv)) return { fingerprints, expected, version };

  for (const line of readFileSync(paths.filesTsv, 'utf8').split('\n')) {
    if (!line) continue;
    if (line.startsWith('#count\t')) {
      const n = Number(line.split('\t')[1]);
      if (Number.isFinite(n)) expected = n;
      continue;
    }
    if (line.startsWith('#version\t')) {
      const n = Number(line.split('\t')[1]);
      if (Number.isFinite(n)) version = n;
      continue;
    }
    const parts = line.split('\t');
    if (parts.length === 3) fingerprints.set(parts[0]!, `${parts[1]}\t${parts[2]}`);
  }
  return { fingerprints, expected, version };
}

export function writeFingerprints(
  paths: BurnPaths,
  seen: Map<string, string>,
  recordCount: number
): void {
  // Count first: the count/fingerprint pairing is what detects a gutted
  // store, and `scan.test.ts` pins it to the first line.
  const lines = [`#count\t${recordCount}\n`, `#version\t${STORE_VERSION}\n`];
  for (const [file, sig] of seen) lines.push(`${file}\t${sig}\n`);
  atomicWrite(paths.filesTsv, lines.join(''));
}

/**
 * requestId -> record.
 *
 * A 7-field row predates attribution and is loaded as `pre-migration` rather
 * than discarded: discarding would delete the entire pre-migration store.
 * Nine or more fields carry the label and the lane id, and anything past the
 * ninth is ignored — accepting `>= 9` rather than `=== 9` costs nothing today
 * and makes a future column addition survivable by a reader that predates it.
 * Any other field count is a torn write and is still discarded.
 */
export function readRecords(paths: BurnPaths): Map<string, UsageRecord> {
  const records = new Map<string, UsageRecord>();
  if (!existsSync(paths.usageTsv)) return records;

  for (const line of readFileSync(paths.usageTsv, 'utf8').split('\n')) {
    if (!line) continue;
    const p = line.split('\t');
    if (p.length !== 7 && p.length < 9) continue;
    const agent = p.length >= 9 ? p[7]! : '';
    records.set(p[0]!, {
      ts: p[1]!,
      model: p[2]!,
      out: Number(p[3]) || 0,
      in: Number(p[4]) || 0,
      cacheWrite: Number(p[5]) || 0,
      cacheRead: Number(p[6]) || 0,
      // Never empty. A row of unknown provenance is `pre-migration`, not
      // `unattributed` — the latter is subagent spend and drives degradation.
      agent: agent || 'pre-migration',
      agentId: p.length >= 9 ? p[8]! : '',
    });
  }
  return records;
}

/**
 * `usage.tsv` is positional and tab-delimited, so a tab or newline inside an
 * undocumented upstream field would shift every later column and make the row
 * get discarded on the next read — a silent, self-inflicted undercount.
 * Observed values are agent slugs and hex ids, so this is expected to be a
 * no-op; it is here because the cost of being wrong is losing rows and the
 * cost of the guard is one `replace`.
 */
function tsvSafe(value: string): string {
  return value.replace(/[\t\r\n]/g, ' ');
}

export function writeRecords(paths: BurnPaths, records: Map<string, UsageRecord>): void {
  const lines: string[] = [];
  for (const [id, r] of records) {
    lines.push(
      `${id}\t${r.ts}\t${r.model}\t${r.out}\t${r.in}\t${r.cacheWrite}\t${r.cacheRead}\t${tsvSafe(r.agent)}\t${tsvSafe(r.agentId)}\n`
    );
  }
  atomicWrite(paths.usageTsv, lines.join(''));
}
