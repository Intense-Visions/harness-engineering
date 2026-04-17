// packages/core/src/state/learnings-staleness.ts
//
// Active staleness detection: audits learnings against current code state.
// Flags entries referencing files that no longer exist.

import * as fs from 'fs';
import * as path from 'path';
import type { Result } from '../shared/result';
import { Ok, Err } from '../shared/result';
import { loadRelevantLearnings } from './learnings-loader';
import { extractIndexEntry, parseDateFromEntry } from './learnings-content';
import { extractFileReferences } from './learnings-overlap';

// --- Types ---

export interface StalenessEntry {
  entryHash: string;
  entrySummary: string;
  missingReferences: string[];
  entryDate: string;
}

export interface StalenessReport {
  total: number;
  stale: StalenessEntry[];
  fresh: number;
}

// --- Detection ---

/**
 * Detect stale learnings by checking file references against the filesystem.
 * A learning is stale if it references files that no longer exist.
 */
export async function detectStaleLearnings(
  projectPath: string,
  stream?: string,
  session?: string
): Promise<Result<StalenessReport, Error>> {
  try {
    const loadResult = await loadRelevantLearnings(projectPath, undefined, stream, session);
    if (!loadResult.ok) return loadResult;
    const entries = loadResult.value;

    if (entries.length === 0) {
      return Ok({ total: 0, stale: [], fresh: 0 });
    }

    const staleEntries: StalenessEntry[] = [];
    let freshCount = 0;

    for (const entry of entries) {
      const refs = extractFileReferences(entry);
      if (refs.length === 0) {
        // Entries without file references are not considered stale
        freshCount++;
        continue;
      }

      const resolvedRoot = path.resolve(projectPath);
      const missing = refs.filter((ref) => {
        const absPath = path.resolve(projectPath, ref);
        // Prevent path traversal outside project root (CWE-22)
        if (!absPath.startsWith(resolvedRoot + path.sep) && absPath !== resolvedRoot) {
          return false; // Skip refs that escape project root
        }
        return !fs.existsSync(absPath);
      });

      if (missing.length > 0) {
        const idx = extractIndexEntry(entry);
        staleEntries.push({
          entryHash: idx.hash,
          entrySummary: idx.summary,
          missingReferences: missing,
          entryDate: parseDateFromEntry(entry) ?? 'unknown',
        });
      } else {
        freshCount++;
      }
    }

    return Ok({
      total: entries.length,
      stale: staleEntries,
      fresh: freshCount,
    });
  } catch (error) {
    return Err(
      new Error(
        `Failed to detect stale learnings: ${error instanceof Error ? error.message : String(error)}`
      )
    );
  }
}
