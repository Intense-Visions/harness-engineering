import * as fs from 'node:fs';
import * as path from 'node:path';
import type { UsageRecord } from '@harness-engineering/types';

/**
 * Parses a single JSONL line into a UsageRecord, normalizing snake_case fields.
 * Returns null if the line is malformed or missing required fields.
 */
function parseLine(line: string, lineNumber: number): UsageRecord | null {
  let entry: Record<string, unknown>;
  try {
    entry = JSON.parse(line);
  } catch {
    console.warn(`[harness usage] Skipping malformed JSONL line ${lineNumber}`);
    return null;
  }

  const tokenUsage = entry.token_usage as Record<string, number> | null | undefined;
  if (!tokenUsage || typeof tokenUsage !== 'object') {
    console.warn(
      `[harness usage] Skipping malformed JSONL line ${lineNumber}: missing token_usage`
    );
    return null;
  }

  const inputTokens = tokenUsage.input_tokens ?? 0;
  const outputTokens = tokenUsage.output_tokens ?? 0;

  const record: UsageRecord = {
    sessionId: (entry.session_id as string) ?? 'unknown',
    timestamp: (entry.timestamp as string) ?? new Date().toISOString(),
    tokens: {
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
    },
  };

  if (entry.cacheCreationTokens != null) {
    record.cacheCreationTokens = entry.cacheCreationTokens as number;
  }
  if (entry.cacheReadTokens != null) {
    record.cacheReadTokens = entry.cacheReadTokens as number;
  }
  if (entry.model != null) {
    record.model = entry.model as string;
  }

  return record;
}

/**
 * Reads .harness/metrics/costs.jsonl and normalizes snake_case hook output
 * to camelCase UsageRecord format.
 *
 * - Skips malformed lines with a warning to stderr
 * - Handles legacy entries missing cache/model fields
 * - Returns empty array if file does not exist
 */
export function readCostRecords(projectRoot: string): UsageRecord[] {
  const costsFile = path.join(projectRoot, '.harness', 'metrics', 'costs.jsonl');

  let raw: string;
  try {
    raw = fs.readFileSync(costsFile, 'utf-8');
  } catch {
    return [];
  }

  const records: UsageRecord[] = [];
  const lines = raw.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const record = parseLine(line, i + 1);
    if (record) {
      records.push(record);
    }
  }

  return records;
}
