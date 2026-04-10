import * as fs from 'node:fs';
import * as path from 'node:path';
import type { SkillInvocationRecord } from '@harness-engineering/types';

/**
 * Parses a single JSONL line into a SkillInvocationRecord.
 * Returns null if the line is not valid JSON.
 */
function parseLine(line: string, lineNumber: number): SkillInvocationRecord | null {
  try {
    const parsed = JSON.parse(line);
    if (
      typeof parsed.skill !== 'string' ||
      typeof parsed.startedAt !== 'string' ||
      typeof parsed.duration !== 'number' ||
      typeof parsed.outcome !== 'string' ||
      !Array.isArray(parsed.phasesReached)
    ) {
      console.warn(
        `[harness adoption] Skipping malformed JSONL line ${lineNumber}: missing required fields`
      );
      return null;
    }
    return parsed as SkillInvocationRecord;
  } catch {
    console.warn(`[harness adoption] Skipping malformed JSONL line ${lineNumber}`);
    return null;
  }
}

/**
 * Reads .harness/metrics/adoption.jsonl and returns parsed SkillInvocationRecord[].
 *
 * - Returns empty array if the file does not exist
 * - Skips malformed lines with a warning to stderr
 * - Skips blank lines silently
 */
export function readAdoptionRecords(projectRoot: string): SkillInvocationRecord[] {
  const adoptionFile = path.join(projectRoot, '.harness', 'metrics', 'adoption.jsonl');

  let raw: string;
  try {
    raw = fs.readFileSync(adoptionFile, 'utf-8');
  } catch {
    return [];
  }

  const records: SkillInvocationRecord[] = [];
  const lines = raw.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]?.trim();
    if (!line) continue;

    const record = parseLine(line, i + 1);
    if (record) {
      records.push(record);
    }
  }

  return records;
}
