import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { UsageRecord } from '@harness-engineering/types';

/**
 * Internal tagged record type matching the aggregator's merge convention.
 */
type TaggedRecord = UsageRecord & { _source: 'claude-code' };

/**
 * Intermediate parsed entry before deduplication.
 * Carries requestId for dedup of streaming chunks.
 */
interface ParsedCCEntry {
  record: TaggedRecord;
  requestId: string | null;
}

/**
 * Extracts the usage object from a parsed CC JSONL entry, or returns null
 * if the entry is not an assistant message with usage data.
 */
function extractUsage(entry: Record<string, unknown>): Record<string, number> | null {
  if (entry.type !== 'assistant') return null;

  const message = entry.message as Record<string, unknown> | null | undefined;
  if (!message || typeof message !== 'object') return null;

  const usage = message.usage as Record<string, number> | null | undefined;
  return usage && typeof usage === 'object' ? usage : null;
}

/**
 * Builds a TaggedRecord from a validated CC JSONL entry and its usage data.
 */
function buildRecord(entry: Record<string, unknown>, usage: Record<string, number>): TaggedRecord {
  const inputTokens = usage.input_tokens ?? 0;
  const outputTokens = usage.output_tokens ?? 0;
  const message = entry.message as Record<string, unknown>;

  const record: TaggedRecord = {
    sessionId: (entry.sessionId as string) ?? 'unknown',
    timestamp: (entry.timestamp as string) ?? new Date().toISOString(),
    tokens: { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens },
    _source: 'claude-code',
  };

  const model = message.model as string | undefined;
  if (model) record.model = model;

  const cacheCreate = usage.cache_creation_input_tokens as number | undefined;
  const cacheRead = usage.cache_read_input_tokens as number | undefined;
  if (typeof cacheCreate === 'number' && cacheCreate > 0) record.cacheCreationTokens = cacheCreate;
  if (typeof cacheRead === 'number' && cacheRead > 0) record.cacheReadTokens = cacheRead;

  return record;
}

/**
 * Parses a single CC JSONL line into a ParsedCCEntry if it is an assistant
 * message with usage data. Returns null for all other entry types.
 */
function parseCCLine(line: string, filePath: string, lineNumber: number): ParsedCCEntry | null {
  let entry: Record<string, unknown>;
  try {
    entry = JSON.parse(line);
  } catch {
    console.warn(
      `[harness usage] Skipping malformed CC JSONL line ${lineNumber} in ${path.basename(filePath)}`
    );
    return null;
  }

  const usage = extractUsage(entry);
  if (!usage) return null;

  return {
    record: buildRecord(entry, usage),
    requestId: (entry.requestId as string) ?? null,
  };
}

/**
 * Reads a single CC JSONL file and extracts UsageRecords from assistant entries.
 *
 * Deduplicates streaming chunks: CC emits multiple assistant entries per API
 * request (same requestId). Each chunk carries cumulative-ish usage, but the
 * last chunk for a given requestId has the authoritative output_tokens count.
 * We keep only the last entry per requestId.
 */
function readCCFile(filePath: string): TaggedRecord[] {
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, 'utf-8');
  } catch {
    return [];
  }

  // Map from requestId -> last parsed entry (for dedup)
  const byRequestId = new Map<string, TaggedRecord>();
  // Entries without a requestId (no dedup needed)
  const noRequestId: TaggedRecord[] = [];

  const lines = raw.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]?.trim();
    if (!line) continue;

    const parsed = parseCCLine(line, filePath, i + 1);
    if (!parsed) continue;

    if (parsed.requestId) {
      // Last entry wins — overwrites previous chunks with same requestId
      byRequestId.set(parsed.requestId, parsed.record);
    } else {
      noRequestId.push(parsed.record);
    }
  }

  return [...byRequestId.values(), ...noRequestId];
}

/**
 * Discovers and parses Claude Code JSONL files from ~/.claude/projects/ directories.
 *
 * Best-effort: the path is not a public API and may change across CC versions.
 * - If ~/.claude/projects/ does not exist, returns empty array (no error)
 * - Malformed entries are skipped with a console.warn
 * - Each valid assistant entry with usage data maps to a UsageRecord tagged with _source: 'claude-code'
 */
export function parseCCRecords(): UsageRecord[] {
  const homeDir = process.env.HOME ?? os.homedir();
  const projectsDir = path.join(homeDir, '.claude', 'projects');

  let projectDirs: string[];
  try {
    projectDirs = fs
      .readdirSync(projectsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => path.join(projectsDir, d.name));
  } catch {
    return [];
  }

  const records: TaggedRecord[] = [];

  for (const dir of projectDirs) {
    let files: string[];
    try {
      files = fs
        .readdirSync(dir)
        .filter((f) => f.endsWith('.jsonl'))
        .map((f) => path.join(dir, f));
    } catch {
      continue;
    }

    for (const file of files) {
      records.push(...readCCFile(file));
    }
  }

  return records;
}
