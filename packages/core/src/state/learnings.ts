// packages/core/src/state/learnings.ts
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import type { Result } from '../shared/result';
import { Ok, Err } from '../shared/result';
import { getStateDir, LEARNINGS_FILE, evictIfNeeded } from './state-shared';

export interface LearningsFrontmatter {
  hash: string;
  tags: string[];
}

export interface LearningsIndexEntry {
  hash: string;
  tags: string[];
  summary: string;
  fullText: string;
}

/** Parse a frontmatter comment line: <!-- hash:XXXX tags:a,b --> */
export function parseFrontmatter(line: string): LearningsFrontmatter | null {
  const match = line.match(/^<!--\s+hash:([a-f0-9]+)(?:\s+tags:([^\s]+))?\s+-->/);
  if (!match) return null;
  const hash = match[1]!;
  const tags = match[2] ? match[2].split(',').filter(Boolean) : [];
  return { hash, tags };
}

/** Compute an 8-char hex hash of the entry text. */
function computeEntryHash(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex').slice(0, 8);
}

/**
 * Extract a lightweight index entry from a full learning entry.
 * Summary = first line only. Tags extracted from [skill:X] and [outcome:Y] markers.
 * Hash computed from full entry text.
 */
export function extractIndexEntry(entry: string): LearningsIndexEntry {
  const lines = entry.split('\n');
  const summary = lines[0] ?? entry;
  const tags: string[] = [];
  const skillMatch = entry.match(/\[skill:([^\]]+)\]/);
  if (skillMatch?.[1]) tags.push(skillMatch[1]);
  const outcomeMatch = entry.match(/\[outcome:([^\]]+)\]/);
  if (outcomeMatch?.[1]) tags.push(outcomeMatch[1]);
  return {
    hash: computeEntryHash(entry),
    tags,
    summary,
    fullText: entry,
  };
}

interface LearningsCache {
  mtimeMs: number;
  entries: string[];
}

const learningsCacheMap = new Map<string, LearningsCache>();

export function clearLearningsCache(): void {
  learningsCacheMap.clear();
}

export async function appendLearning(
  projectPath: string,
  learning: string,
  skillName?: string,
  outcome?: string,
  stream?: string,
  session?: string
): Promise<Result<void, Error>> {
  try {
    const dirResult = await getStateDir(projectPath, stream, session);
    if (!dirResult.ok) return dirResult;
    const stateDir = dirResult.value;
    const learningsPath = path.join(stateDir, LEARNINGS_FILE);

    fs.mkdirSync(stateDir, { recursive: true });
    const timestamp = new Date().toISOString().split('T')[0];

    // Build tags list for frontmatter
    const fmTags: string[] = [];
    if (skillName) fmTags.push(skillName);
    if (outcome) fmTags.push(outcome);

    let bulletLine: string;
    if (skillName && outcome) {
      bulletLine = `- **${timestamp} [skill:${skillName}] [outcome:${outcome}]:** ${learning}`;
    } else if (skillName) {
      bulletLine = `- **${timestamp} [skill:${skillName}]:** ${learning}`;
    } else {
      bulletLine = `- **${timestamp}:** ${learning}`;
    }

    const hash = crypto.createHash('sha256').update(bulletLine).digest('hex').slice(0, 8);
    const tagsStr = fmTags.length > 0 ? ` tags:${fmTags.join(',')}` : '';
    const frontmatter = `<!-- hash:${hash}${tagsStr} -->`;
    const entry = `\n${frontmatter}\n${bulletLine}\n`;

    if (!fs.existsSync(learningsPath)) {
      fs.writeFileSync(learningsPath, `# Learnings\n${entry}`);
    } else {
      fs.appendFileSync(learningsPath, entry);
    }

    // Invalidate cache on write
    learningsCacheMap.delete(learningsPath);

    return Ok(undefined);
  } catch (error) {
    return Err(
      new Error(
        `Failed to append learning: ${error instanceof Error ? error.message : String(error)}`
      )
    );
  }
}

/** Estimate token count from a string (chars / 4, ceiling). */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Score how relevant a learning entry is to a given intent.
 * Returns a number 0-1. Higher = more relevant.
 * Uses keyword overlap between intent words and entry text.
 */
function scoreRelevance(entry: string, intent: string): number {
  if (!intent || intent.trim() === '') return 0;
  const intentWords = intent
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2); // skip short words like "a", "to", "in"
  if (intentWords.length === 0) return 0;
  const entryLower = entry.toLowerCase();
  const matches = intentWords.filter((word) => entryLower.includes(word));
  return matches.length / intentWords.length;
}

/**
 * Parse date from a learning entry. Returns the date string or null.
 * Entries look like: "- **2026-03-25 [skill:X]:** content"
 * or heading format: "## 2026-03-25 — Task 3: ..."
 */
export function parseDateFromEntry(entry: string): string | null {
  const match = entry.match(/(\d{4}-\d{2}-\d{2})/);
  return match ? (match[1] ?? null) : null;
}

export interface LearningPattern {
  tag: string;
  count: number;
  entries: string[];
}

/**
 * Analyze learning entries for recurring patterns.
 * Groups entries by [skill:X] and [outcome:Y] tags.
 * Returns patterns where 3+ entries share the same tag.
 */
export function analyzeLearningPatterns(entries: string[]): LearningPattern[] {
  const tagGroups = new Map<string, string[]>();

  for (const entry of entries) {
    const tagMatches = entry.matchAll(/\[(skill:[^\]]+)\]|\[(outcome:[^\]]+)\]/g);
    for (const match of tagMatches) {
      const tag = match[1] ?? match[2];
      if (tag) {
        const group = tagGroups.get(tag) ?? [];
        group.push(entry);
        tagGroups.set(tag, group);
      }
    }
  }

  const patterns: LearningPattern[] = [];
  for (const [tag, groupEntries] of tagGroups) {
    if (groupEntries.length >= 3) {
      patterns.push({ tag, count: groupEntries.length, entries: groupEntries });
    }
  }

  return patterns.sort((a, b) => b.count - a.count);
}

export interface BudgetedLearningsOptions {
  intent: string;
  tokenBudget?: number;
  skill?: string;
  session?: string;
  stream?: string;
}

/**
 * Load learnings with token budget, two-tier loading, recency sorting, and relevance filtering.
 *
 * - Session learnings (primary): always loaded first if session is provided
 * - Global learnings (secondary): loaded to fill remaining budget
 * - Sorted by recency (newest first) within each tier
 * - Filtered by relevance to intent (matching entries prioritized)
 * - Capped at tokenBudget (default 1000 tokens)
 */
export async function loadBudgetedLearnings(
  projectPath: string,
  options: BudgetedLearningsOptions
): Promise<Result<string[], Error>> {
  const { intent, tokenBudget = 1000, skill, session, stream } = options;

  const sortByRecencyAndRelevance = (entries: string[]): string[] => {
    return [...entries].sort((a, b) => {
      const dateA = parseDateFromEntry(a) ?? '0000-00-00';
      const dateB = parseDateFromEntry(b) ?? '0000-00-00';
      // Primary sort: date descending (newest first)
      const dateCompare = dateB.localeCompare(dateA);
      if (dateCompare !== 0) return dateCompare;
      // Secondary sort: relevance descending
      return scoreRelevance(b, intent) - scoreRelevance(a, intent);
    });
  };

  const allEntries: string[] = [];

  // Tier 1: Session learnings (primary)
  if (session) {
    const sessionResult = await loadRelevantLearnings(projectPath, skill, stream, session);
    if (sessionResult.ok) {
      allEntries.push(...sortByRecencyAndRelevance(sessionResult.value));
    }
  }

  // Tier 2: Global learnings (secondary, deduplicated against session entries)
  const globalResult = await loadRelevantLearnings(projectPath, skill, stream);
  if (globalResult.ok) {
    const sessionSet = new Set(allEntries.map((e) => e.trim()));
    const uniqueGlobal = globalResult.value.filter((e) => !sessionSet.has(e.trim()));
    allEntries.push(...sortByRecencyAndRelevance(uniqueGlobal));
  }

  // Apply token budget: greedily add entries until budget exhausted
  const budgeted: string[] = [];
  let totalTokens = 0;
  for (const entry of allEntries) {
    const separator = budgeted.length > 0 ? '\n' : '';
    const entryCost = estimateTokens(entry + separator);
    if (totalTokens + entryCost > tokenBudget) break;
    budgeted.push(entry);
    totalTokens += entryCost;
  }

  return Ok(budgeted);
}

export async function loadRelevantLearnings(
  projectPath: string,
  skillName?: string,
  stream?: string,
  session?: string
): Promise<Result<string[], Error>> {
  try {
    const dirResult = await getStateDir(projectPath, stream, session);
    if (!dirResult.ok) return dirResult;
    const stateDir = dirResult.value;
    const learningsPath = path.join(stateDir, LEARNINGS_FILE);

    if (!fs.existsSync(learningsPath)) {
      return Ok([]);
    }

    // Cache check: use mtime to determine if re-parse is needed
    const stats = fs.statSync(learningsPath);
    const cacheKey = learningsPath;
    const cached = learningsCacheMap.get(cacheKey);

    let entries: string[];

    if (cached && cached.mtimeMs === stats.mtimeMs) {
      entries = cached.entries;
    } else {
      // Parse file and populate cache
      const content = fs.readFileSync(learningsPath, 'utf-8');
      const lines = content.split('\n');
      entries = [];
      let currentBlock: string[] = [];

      for (const line of lines) {
        if (line.startsWith('# ')) continue;

        // Skip frontmatter comment lines — they are metadata, not entry content
        if (/^<!--\s+hash:[a-f0-9]+/.test(line)) continue;

        const isDatedBullet = /^- \*\*\d{4}-\d{2}-\d{2}/.test(line);
        const isHeading = /^## \d{4}-\d{2}-\d{2}/.test(line);

        if (isDatedBullet || isHeading) {
          if (currentBlock.length > 0) {
            entries.push(currentBlock.join('\n'));
          }
          currentBlock = [line];
        } else if (line.trim() !== '' && currentBlock.length > 0) {
          currentBlock.push(line);
        }
      }

      if (currentBlock.length > 0) {
        entries.push(currentBlock.join('\n'));
      }

      learningsCacheMap.set(cacheKey, { mtimeMs: stats.mtimeMs, entries });
      evictIfNeeded(learningsCacheMap);
    }

    if (!skillName) {
      return Ok(entries);
    }

    const filtered = entries.filter((entry) => entry.includes(`[skill:${skillName}]`));
    return Ok(filtered);
  } catch (error) {
    return Err(
      new Error(
        `Failed to load learnings: ${error instanceof Error ? error.message : String(error)}`
      )
    );
  }
}

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

    // Invalidate cache
    learningsCacheMap.delete(learningsPath);

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

    // Invalidate cache
    learningsCacheMap.delete(globalPath);

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
