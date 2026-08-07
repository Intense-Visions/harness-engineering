import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import type { BurnPaths } from './config';
import {
  readFingerprints,
  readRecords,
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
 */
/** One transcript line -> a record, or null when the line is not a usage turn. */
function toRecord(line: string): { id: string; record: UsageRecord } | null {
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

  return {
    id,
    record: {
      ts: obj.timestamp ?? '',
      model: obj.message?.model ?? 'unknown',
      out: Number(usage.output_tokens) || 0,
      in: Number(usage.input_tokens) || 0,
      cacheWrite: Number(usage.cache_creation_input_tokens) || 0,
      cacheRead: Number(usage.cache_read_input_tokens) || 0,
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

  let added = 0;
  for (const line of text.split('\n')) {
    const parsed = toRecord(line);
    if (!parsed || records.has(parsed.id)) continue;
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

    let { fingerprints, expected } = readFingerprints(paths);
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
