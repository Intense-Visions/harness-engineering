// packages/core/src/state/learnings-lifecycle.ts
//
// Lifecycle operations: archival, pruning, session promotion, counting.
// Extracted from learnings.ts to reduce blast radius.

import * as fs from 'fs';
import * as path from 'path';
import type { Result } from '../shared/result';
import { Ok, Err } from '../shared/result';
import { getStateDir } from './state-shared';
import { LEARNINGS_FILE } from './constants';
import { parseDateFromEntry, analyzeLearningPatterns } from './learnings-content';
import type { LearningPattern } from './learnings-content';
import { loadRelevantLearnings, invalidateLearningsCacheEntry } from './learnings-loader';

export interface PruneResult {
  kept: number;
  archived: number;
  patterns: LearningPattern[];
}

/**
 * Archive learning entries to .harness/learnings-archive/{YYYY-MM}.md.
 * Appends to existing archive file if one exists for the current month.
 */
export async function archiveLearnings(
  projectPath: string,
  entries: string[],
  stream?: string
): Promise<Result<void, Error>> {
  try {
    const dirResult = await getStateDir(projectPath, stream);
    if (!dirResult.ok) return dirResult;
    const stateDir = dirResult.value;

    const archiveDir = path.join(stateDir, 'learnings-archive');
    fs.mkdirSync(archiveDir, { recursive: true });

    const now = new Date();
    const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const archivePath = path.join(archiveDir, `${yearMonth}.md`);

    const archiveContent = entries.join('\n\n') + '\n';

    if (fs.existsSync(archivePath)) {
      fs.appendFileSync(archivePath, '\n' + archiveContent);
    } else {
      fs.writeFileSync(archivePath, `# Learnings Archive\n\n${archiveContent}`);
    }

    return Ok(undefined);
  } catch (error) {
    return Err(
      new Error(
        `Failed to archive learnings: ${error instanceof Error ? error.message : String(error)}`
      )
    );
  }
}

/**
 * Prune global learnings: analyze patterns, archive old entries, keep 20 most recent.
 *
 * Pruning triggers when:
 * - Entry count exceeds 30, OR
 * - Entries older than 14 days exist AND total count exceeds 20
 *
 * Returns the prune result with pattern analysis and counts.
 */
export async function pruneLearnings(
  projectPath: string,
  stream?: string
): Promise<Result<PruneResult, Error>> {
  try {
    const dirResult = await getStateDir(projectPath, stream);
    if (!dirResult.ok) return dirResult;
    const stateDir = dirResult.value;
    const learningsPath = path.join(stateDir, LEARNINGS_FILE);

    if (!fs.existsSync(learningsPath)) {
      return Ok({ kept: 0, archived: 0, patterns: [] });
    }

    const loadResult = await loadRelevantLearnings(projectPath, undefined, stream);
    if (!loadResult.ok) return loadResult;
    const allEntries = loadResult.value;

    if (allEntries.length <= 20) {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 14);
      const cutoffStr = cutoffDate.toISOString().split('T')[0];

      const hasOld = allEntries.some((entry) => {
        const date = parseDateFromEntry(entry);
        return date !== null && date < cutoffStr!;
      });

      if (!hasOld) {
        return Ok({ kept: allEntries.length, archived: 0, patterns: [] });
      }
    }

    // Sort by date descending (newest first)
    const sorted = [...allEntries].sort((a, b) => {
      const dateA = parseDateFromEntry(a) ?? '0000-00-00';
      const dateB = parseDateFromEntry(b) ?? '0000-00-00';
      return dateB.localeCompare(dateA);
    });

    const toKeep = sorted.slice(0, 20);
    const toArchive = sorted.slice(20);

    // Analyze patterns in ALL entries before pruning
    const patterns = analyzeLearningPatterns(allEntries);

    if (toArchive.length > 0) {
      const archiveResult = await archiveLearnings(projectPath, toArchive, stream);
      if (!archiveResult.ok) return archiveResult;
    }

    // Rewrite learnings.md with only kept entries
    const newContent = '# Learnings\n\n' + toKeep.join('\n\n') + '\n';
    fs.writeFileSync(learningsPath, newContent);

    // Invalidate cache (targeted — only this file, not all cached entries)
    invalidateLearningsCacheEntry(learningsPath);

    return Ok({
      kept: toKeep.length,
      archived: toArchive.length,
      patterns,
    });
  } catch (error) {
    return Err(
      new Error(
        `Failed to prune learnings: ${error instanceof Error ? error.message : String(error)}`
      )
    );
  }
}

export interface PromoteResult {
  promoted: number;
  skipped: number;
}

/**
 * Outcomes considered generalizable (applicable beyond the current session).
 * Entries with these tags get promoted to global learnings.
 * Task-completion entries ([outcome:success] with no broader insight,
 * or entries with no outcome tag) stay in the session.
 */
const PROMOTABLE_OUTCOMES = ['gotcha', 'decision', 'observation'];

/**
 * Check if a learning entry is generalizable (should be promoted to global).
 * Generalizable = has an outcome tag that indicates a reusable insight.
 */
function isGeneralizable(entry: string): boolean {
  for (const outcome of PROMOTABLE_OUTCOMES) {
    if (entry.includes(`[outcome:${outcome}]`)) return true;
  }
  return false;
}

/**
 * Promote generalizable session learnings to global learnings.md.
 *
 * Generalizable entries are those tagged with [outcome:gotcha],
 * [outcome:decision], or [outcome:observation]. These represent
 * reusable insights that apply beyond the current session.
 *
 * Task-specific entries (e.g., [outcome:success] completion summaries,
 * or entries without outcome tags) stay in the session directory.
 */
export async function promoteSessionLearnings(
  projectPath: string,
  sessionSlug: string,
  stream?: string
): Promise<Result<PromoteResult, Error>> {
  try {
    // Load session learnings
    const sessionResult = await loadRelevantLearnings(projectPath, undefined, stream, sessionSlug);
    if (!sessionResult.ok) return sessionResult;
    const sessionEntries = sessionResult.value;

    if (sessionEntries.length === 0) {
      return Ok({ promoted: 0, skipped: 0 });
    }

    const toPromote: string[] = [];
    let skipped = 0;

    for (const entry of sessionEntries) {
      if (isGeneralizable(entry)) {
        toPromote.push(entry);
      } else {
        skipped++;
      }
    }

    if (toPromote.length === 0) {
      return Ok({ promoted: 0, skipped });
    }

    // Append promoted entries to global learnings (with dedup for idempotency)
    const dirResult = await getStateDir(projectPath, stream);
    if (!dirResult.ok) return dirResult;
    const stateDir = dirResult.value;
    const globalPath = path.join(stateDir, LEARNINGS_FILE);

    // Load existing global entries for duplicate detection
    const existingGlobal = fs.existsSync(globalPath) ? fs.readFileSync(globalPath, 'utf-8') : '';
    const newEntries = toPromote.filter((entry) => !existingGlobal.includes(entry.trim()));

    if (newEntries.length === 0) {
      return Ok({ promoted: 0, skipped: skipped + toPromote.length });
    }

    const promotedContent = newEntries.join('\n\n') + '\n';

    if (!existingGlobal) {
      fs.writeFileSync(globalPath, `# Learnings\n\n${promotedContent}`);
    } else {
      fs.appendFileSync(globalPath, '\n\n' + promotedContent);
    }

    // Invalidate cache (targeted — only the global file, not all cached entries)
    invalidateLearningsCacheEntry(globalPath);

    return Ok({
      promoted: newEntries.length,
      skipped: skipped + (toPromote.length - newEntries.length),
    });
  } catch (error) {
    return Err(
      new Error(
        `Failed to promote session learnings: ${error instanceof Error ? error.message : String(error)}`
      )
    );
  }
}

/**
 * Count the number of learning entries in the global learnings.md file.
 * Useful for checking if pruning should be suggested (threshold: 30).
 */
export async function countLearningEntries(projectPath: string, stream?: string): Promise<number> {
  const loadResult = await loadRelevantLearnings(projectPath, undefined, stream);
  if (!loadResult.ok) return 0;
  return loadResult.value.length;
}
