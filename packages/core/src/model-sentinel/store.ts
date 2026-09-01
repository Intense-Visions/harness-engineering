/**
 * Model-update regression sentinel (#1617) — append-only store.
 *
 * Persists sentinel records as JSON Lines at
 * `.harness/model-sentinel/history.jsonl`. The file is strictly append-only:
 * detections and acknowledgements each add a line; nothing is ever rewritten,
 * so the changelog history is immutable (an acknowledgement is itself a new
 * record). Mirrors the read-and-skip-malformed convention of
 * `adoption/reader.ts`.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ModelSnapshot, SentinelRecord } from './types';

/** Relative location of the append-only history file under a project root. */
export const SENTINEL_HISTORY_RELPATH = path.join('.harness', 'model-sentinel', 'history.jsonl');

/** Absolute path to the history file for a given project root. */
export function sentinelHistoryPath(projectRoot: string): string {
  return path.join(projectRoot, SENTINEL_HISTORY_RELPATH);
}

function isSentinelRecord(value: unknown): value is SentinelRecord {
  if (value === null || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v['id'] === 'string' &&
    typeof v['observedAt'] === 'string' &&
    typeof v['acknowledged'] === 'boolean' &&
    typeof v['snapshot'] === 'object' &&
    v['snapshot'] !== null &&
    typeof v['drift'] === 'object' &&
    v['drift'] !== null
  );
}

/**
 * Read every sentinel record from `.harness/model-sentinel/history.jsonl`.
 * Returns `[]` if the file does not exist; skips malformed lines with a stderr
 * warning (never throws on a corrupt line).
 */
export function readSentinelHistory(projectRoot: string): SentinelRecord[] {
  const file = sentinelHistoryPath(projectRoot);
  let raw: string;
  try {
    raw = fs.readFileSync(file, 'utf-8');
  } catch {
    return [];
  }

  const records: SentinelRecord[] = [];
  const lines = raw.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]?.trim();
    if (!line) continue;
    try {
      const parsed: unknown = JSON.parse(line);
      if (isSentinelRecord(parsed)) {
        records.push(parsed);
      } else {
        process.stderr.write(
          `[harness model-sentinel] Skipping malformed history line ${i + 1}: missing required fields\n`
        );
      }
    } catch {
      process.stderr.write(`[harness model-sentinel] Skipping malformed history line ${i + 1}\n`);
    }
  }
  return records;
}

/** The snapshot of the most recent record, or null when history is empty. */
export function latestSnapshot(records: readonly SentinelRecord[]): ModelSnapshot | null {
  const last = records[records.length - 1];
  return last ? last.snapshot : null;
}

/**
 * Append one sentinel record as a JSON line. Creates the
 * `.harness/model-sentinel/` directory if needed. Append-only — never truncates
 * or rewrites existing lines.
 */
export function appendSentinelRecord(projectRoot: string, record: SentinelRecord): void {
  const file = sentinelHistoryPath(projectRoot);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, `${JSON.stringify(record)}\n`, 'utf-8');
}
