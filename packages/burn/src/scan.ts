import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import type { BurnPaths } from './config';
import {
  readFingerprints,
  readRecords,
  STORE_VERSION,
  withScanLock,
  writeFingerprints,
  writeRecords,
} from './store';
import type { ScanInfo, UsageRecord } from './types';

/** Below this ratio of the asserted count, the store is treated as having lost rows. */
const INTEGRITY_FLOOR = 0.98;

function listTranscripts(root: string): string[] {
  const found: string[] = [];
  const walk = (dir: string): void => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return; // unreadable directory is not a reason to abandon the scan
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name.endsWith('.jsonl')) found.push(full);
    }
  };
  if (existsSync(root)) walk(root);
  return found;
}

interface TranscriptLine {
  requestId?: string;
  timestamp?: string;
  /** Claude Code marks a dispatched subagent's turn with this flag. */
  isSidechain?: boolean;
  /** The individual dispatch this turn belonged to — one fleet lane. */
  agentId?: string;
  /** The agent TYPE, e.g. `harness-task-executor`. */
  attributionAgent?: string;
  message?: {
    model?: string;
    usage?: {
      output_tokens?: number;
      input_tokens?: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
    };
  };
}

/**
 * Fold one transcript into `records`, keyed by requestId.
 *
 * Transcripts repeat the same usage block ~3x per request, so counting rows
 * instead of request ids inflates every figure by roughly 3.5x. First write
 * wins: a requestId already present is skipped, which also makes the scan
 * idempotent across overlapping files.
 *
 * One exception, and only one: a `pre-migration` row — a row read off a
 * 7-column store, which never carried a label at all — is upgraded to any
 * label a later read produces. Classification never yields `pre-migration`,
 * so this cannot fire between two ordinary reads; it exists so the migration
 * does not pin a row to `pre-migration` forever while its transcript is still
 * on disk. An upgrade is not an add.
 */
/**
 * Whether a transcript path is a dispatched subagent's.
 *
 * Two independent signals classify subagent spend — this path check and the
 * line's own `isSidechain` flag — because both are undocumented Claude Code
 * internals. Either one alone keeps classification working if the other
 * moves; both must change at once before attribution degrades.
 */
export function isSubagentPath(file: string): boolean {
  return path.normalize(file).split(path.sep).includes('subagents');
}

/** One transcript line -> a record, or null when the line is not a usage turn. */
function toRecord(
  line: string,
  isSubagentFile: boolean
): { id: string; record: UsageRecord } | null {
  // Cheap prefilter: most lines are not assistant turns.
  if (!line.includes('"usage"')) return null;

  let obj: TranscriptLine;
  try {
    obj = JSON.parse(line) as TranscriptLine;
  } catch {
    return null;
  }

  const id = obj.requestId;
  const usage = obj.message?.usage;
  if (!id || !usage || typeof usage !== 'object') return null;

  const named = typeof obj.attributionAgent === 'string' ? obj.attributionAgent.trim() : '';
  // Type-guarded for the same reason `attributionAgent` is. These are
  // undocumented Claude Code internals, so a release may change the TYPE of a
  // field as easily as its name — and the store writer sanitises this column
  // with `String.replace`, which throws on a non-string and aborts the entire
  // scan. A shape change must degrade to a missing lane id, never to a scan
  // that cannot complete.
  const lane = typeof obj.agentId === 'string' ? obj.agentId : '';
  const isSubagent = obj.isSidechain === true || isSubagentFile;
  // A missing label must never collapse into `main` — that would understate
  // the lanes and overstate the human.
  const agent = named !== '' ? named : isSubagent ? 'unattributed' : 'main';

  return {
    id,
    record: {
      ts: obj.timestamp ?? '',
      model: obj.message?.model ?? 'unknown',
      out: Number(usage.output_tokens) || 0,
      in: Number(usage.input_tokens) || 0,
      cacheWrite: Number(usage.cache_creation_input_tokens) || 0,
      cacheRead: Number(usage.cache_read_input_tokens) || 0,
      agent,
      agentId: agent === 'main' ? '' : lane,
    },
  };
}

export function parseTranscript(file: string, records: Map<string, UsageRecord>): number {
  let text: string;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    return 0;
  }

  // Once per file, not once per line: the path does not change mid-file.
  const isSubagentFile = isSubagentPath(file);

  let added = 0;
  for (const line of text.split('\n')) {
    const parsed = toRecord(line, isSubagentFile);
    if (!parsed) continue;
    const existing = records.get(parsed.id);
    if (existing) {
      // First write wins, with exactly one exception: a row that NEVER carried
      // a label — a `pre-migration` row read off a 7-column store — is
      // replaced once a read produces any real label. Without it, every
      // migrated row would stay `pre-migration` forever even though its
      // transcript is still on disk. The rule is deliberately narrow:
      // classification never yields `pre-migration`, so ordinary dedup across
      // overlapping transcripts keeps first-write-wins untouched, and an
      // `unattributed` row (a current observation, not a missing one) is never
      // revised. An upgrade is not an add — counting it would make the record
      // count disagree with the store it describes.
      if (existing.agent === 'pre-migration' && parsed.record.agent !== 'pre-migration') {
        records.set(parsed.id, parsed.record);
      }
      continue;
    }
    records.set(parsed.id, parsed.record);
    added += 1;
  }
  return added;
}

/**
 * Incrementally rescan changed transcripts and rewrite the record store.
 *
 * Scans fire from the SessionStart hook, the Stop hook and the CLI, and several
 * Claude sessions run at once, so the whole body is serialised. A scan that
 * cannot take the lock returns what is already on disk rather than joining in.
 */
export function scan(paths: BurnPaths): ScanInfo {
  return withScanLock(paths, (acquired): ScanInfo => {
    if (!acquired) {
      // Another scan is mid-flight and will publish a fresher summary.
      const records = readRecords(paths);
      const { fingerprints } = readFingerprints(paths);
      return {
        files_total: fingerprints.size,
        files_rescanned: 0,
        records_added: 0,
        records_total: records.size,
        skipped_locked: true,
      };
    }

    let { fingerprints, expected, version } = readFingerprints(paths);
    const records = readRecords(paths);

    // Integrity gate. If the store holds materially fewer records than the
    // fingerprints claim were scanned, the store lost rows — so every
    // fingerprint is now a lie that would suppress the rebuild. Distrust them
    // all and re-read from source.
    let lost = 0;
    if (expected !== null && records.size < expected * INTEGRITY_FLOOR) {
      lost = expected - records.size;
      fingerprints = new Map();
    }

    // A store written before the current format cannot be trusted to carry
    // the columns this code reads, so its fingerprints are dropped the same
    // way a failed integrity gate drops them: re-read every transcript.
    if (version === null || version < STORE_VERSION) fingerprints = new Map();

    const seen = new Map<string, string>();
    let rescanned = 0;
    let added = 0;

    for (const file of listTranscripts(paths.projects)) {
      let st;
      try {
        st = statSync(file);
      } catch {
        continue;
      }
      const sig = `${Math.floor(st.mtimeMs / 1000)}\t${st.size}`;
      seen.set(file, sig);
      if (fingerprints.get(file) === sig) continue;
      rescanned += 1;
      added += parseTranscript(file, records);
    }

    // Fingerprints first, so the count and the fingerprints it describes land
    // in one atomic write and can never disagree.
    writeFingerprints(paths, seen, records.size);
    writeRecords(paths, records);

    const info: ScanInfo = {
      files_total: seen.size,
      files_rescanned: rescanned,
      records_added: added,
      records_total: records.size,
    };
    if (lost > 0) {
      // Degraded tooling is a headline, not a footnote.
      info.data_loss_detected = true;
      info.records_lost = lost;
      info.records_recovered = added;
      info.unrecovered = Math.max(lost - added, 0);
    }
    return info;
  });
}

/** Recompute from the stored records without touching transcripts. */
export function scanInfoFromStore(paths: BurnPaths): ScanInfo {
  const { fingerprints } = readFingerprints(paths);
  return {
    files_total: fingerprints.size,
    files_rescanned: 0,
    records_added: 0,
    records_total: readRecords(paths).size,
  };
}
