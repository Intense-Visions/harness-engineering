// packages/core/src/state/learnings.ts
import * as fs from 'fs';
import * as path from 'path';
import type { Result } from '../shared/result';
import { Ok, Err } from '../shared/result';
import { getStateDir, LEARNINGS_FILE, evictIfNeeded } from './state-shared';

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

    let entry: string;
    if (skillName && outcome) {
      entry = `\n- **${timestamp} [skill:${skillName}] [outcome:${outcome}]:** ${learning}\n`;
    } else if (skillName) {
      entry = `\n- **${timestamp} [skill:${skillName}]:** ${learning}\n`;
    } else {
      entry = `\n- **${timestamp}:** ${learning}\n`;
    }

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
function parseDateFromEntry(entry: string): string | null {
  const match = entry.match(/(\d{4}-\d{2}-\d{2})/);
  return match ? (match[1] ?? null) : null;
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

  // Tier 2: Global learnings (secondary)
  const globalResult = await loadRelevantLearnings(projectPath, skill, stream);
  if (globalResult.ok) {
    allEntries.push(...sortByRecencyAndRelevance(globalResult.value));
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
