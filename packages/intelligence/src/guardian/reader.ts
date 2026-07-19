/**
 * Tolerant reader for guardian diff-coverage records in `.harness/analyses/`.
 *
 * Contract (issue #914): NEVER throw and NEVER change consumer behavior when the
 * archive is absent, empty, or full of foreign/malformed records. The reader
 * lists the directory, parses each JSON file best-effort, selects guardian
 * records by the `schema` discriminator, validates them with zod, and skips
 * anything that does not validate. The result is advisory input only.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { guardianAnalysisSchema } from './schema.js';
import type { GuardianAnalysis } from './types.js';

/**
 * Read every valid guardian diff-coverage record from `analysesDir`
 * (conventionally `<projectRoot>/.harness/analyses`).
 *
 * Degrade-safe: a missing directory yields `[]`; a file that is unreadable, is
 * not JSON, or is not a valid guardian record is skipped. Order follows
 * directory listing and is not otherwise guaranteed.
 */
export async function readGuardianAnalyses(analysesDir: string): Promise<GuardianAnalysis[]> {
  let entries: string[];
  try {
    entries = await fs.readdir(analysesDir);
  } catch {
    // Absent directory (ENOENT) or any listing error → no guardian input.
    return [];
  }

  const out: GuardianAnalysis[] = [];
  for (const entry of entries) {
    if (!entry.endsWith('.json')) continue;
    const record = await tryReadGuardianRecord(path.join(analysesDir, entry));
    if (record) out.push(record);
  }
  return out;
}

/** Read + parse + validate a single file, returning null on any failure. */
async function tryReadGuardianRecord(filePath: string): Promise<GuardianAnalysis | null> {
  let raw: string;
  try {
    raw = await fs.readFile(filePath, 'utf-8');
  } catch {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  // Discriminator + shape are both enforced by the schema (the `schema`/
  // `version` literals). A non-guardian record (e.g. an intelligence
  // AnalysisRecord) fails the literal check and is skipped silently.
  const result = guardianAnalysisSchema.safeParse(parsed);
  return result.success ? (result.data as GuardianAnalysis) : null;
}
