// packages/core/src/state/learnings.ts
//
// Core CRUD operations for learnings: append, load index, budgeted loading.
// Delegates to:
//   learnings-content.ts — parsing, hashing, dedup (leaf)
//   learnings-loader.ts  — file loading with cache (leaf)
//   learnings-lifecycle.ts — prune, archive, promote (imports from loader)

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import type { Result } from '../shared/result';
import { Ok, Err } from '../shared/result';
import { getStateDir, LEARNINGS_FILE } from './state-shared';
import { CONTENT_HASHES_FILE } from './constants';
import {
  normalizeLearningContent,
  computeContentHash,
  loadContentHashes,
  saveContentHashes,
  rebuildContentHashes,
  parseFrontmatter,
  extractIndexEntry,
  parseDateFromEntry,
  scoreRelevance,
  estimateTokens,
} from './learnings-content';
import type {
  LearningsFrontmatter,
  LearningsIndexEntry,
  ContentHashIndex,
} from './learnings-content';
import { loadRelevantLearnings, invalidateLearningsCacheEntry } from './learnings-loader';
import { checkOverlap } from './learnings-overlap';
import type { OverlapResult } from './learnings-overlap';

// --- Core CRUD ---

export interface AppendLearningResult {
  appended: boolean;
  overlap?: OverlapResult;
}

export interface BudgetedLearningsOptions {
  intent: string;
  tokenBudget?: number;
  skill?: string;
  session?: string;
  stream?: string;
  depth?: 'index' | 'summary' | 'full';
}

/** Load or rebuild the content hash index, self-healing on corruption. */
function loadOrRebuildHashes(stateDir: string, learningsPath: string): ContentHashIndex {
  const hashesPath = path.join(stateDir, CONTENT_HASHES_FILE);
  if (fs.existsSync(hashesPath)) {
    const hashes = loadContentHashes(stateDir);
    if (Object.keys(hashes).length === 0 && fs.existsSync(learningsPath)) {
      return rebuildContentHashes(stateDir, LEARNINGS_FILE);
    }
    return hashes;
  }
  if (fs.existsSync(learningsPath)) {
    return rebuildContentHashes(stateDir, LEARNINGS_FILE);
  }
  return {};
}

/** Format a learning bullet line with tags. */
function formatBulletLine(
  timestamp: string,
  learning: string,
  skillName?: string,
  outcome?: string,
  rootCause?: string,
  triedAndFailed?: string[]
): string {
  const structuredTags: string[] = [];
  if (rootCause) structuredTags.push(`[root_cause:${rootCause}]`);
  if (triedAndFailed && triedAndFailed.length > 0)
    structuredTags.push(`[tried:${triedAndFailed.join(',')}]`);
  const structuredStr = structuredTags.length > 0 ? ' ' + structuredTags.join(' ') : '';

  if (skillName && outcome) {
    return `- **${timestamp} [skill:${skillName}] [outcome:${outcome}]${structuredStr}:** ${learning}`;
  }
  if (skillName) {
    return `- **${timestamp} [skill:${skillName}]${structuredStr}:** ${learning}`;
  }
  return `- **${timestamp}${structuredStr}:** ${learning}`;
}

export async function appendLearning(
  projectPath: string,
  learning: string,
  skillName?: string,
  outcome?: string,
  stream?: string,
  session?: string,
  rootCause?: string,
  triedAndFailed?: string[]
): Promise<Result<AppendLearningResult, Error>> {
  try {
    const dirResult = await getStateDir(projectPath, stream, session);
    if (!dirResult.ok) return dirResult;
    const stateDir = dirResult.value;
    const learningsPath = path.join(stateDir, LEARNINGS_FILE);

    fs.mkdirSync(stateDir, { recursive: true });

    // Content deduplication
    const normalizedContent = normalizeLearningContent(learning);
    const contentHash = computeContentHash(normalizedContent);
    const contentHashes = loadOrRebuildHashes(stateDir, learningsPath);

    if (contentHashes[contentHash]) {
      return Ok({ appended: false });
    }

    const timestamp = new Date().toISOString().split('T')[0]!;
    const bulletLine = formatBulletLine(
      timestamp,
      learning,
      skillName,
      outcome,
      rootCause,
      triedAndFailed
    );

    // Build frontmatter
    const fmTags: string[] = [];
    if (skillName) fmTags.push(skillName);
    if (outcome) fmTags.push(outcome);
    const hash = crypto.createHash('sha256').update(bulletLine).digest('hex').slice(0, 8);
    const tagsStr = fmTags.length > 0 ? ` tags:${fmTags.join(',')}` : '';
    const entry = `\n<!-- hash:${hash}${tagsStr} -->\n${bulletLine}\n`;

    // Write entry and check overlap (single file read)
    let overlapResult: OverlapResult | undefined;
    let existingLineCount: number;
    if (!fs.existsSync(learningsPath)) {
      fs.writeFileSync(learningsPath, `# Learnings\n${entry}`);
      existingLineCount = 1;
    } else {
      const existingContent = fs.readFileSync(learningsPath, 'utf-8');
      const existingEntries = existingContent
        .split('\n')
        .filter((line) => /^- \*\*\d{4}-\d{2}-\d{2}/.test(line));
      const overlap = checkOverlap(bulletLine, existingEntries);
      if (overlap.score >= 0.7) overlapResult = overlap;
      existingLineCount = existingContent.split('\n').length;
      fs.appendFileSync(learningsPath, entry);
    }

    // Update content hash index
    const bulletLineNum = existingLineCount + 2;
    contentHashes[contentHash] = { date: timestamp ?? '', line: bulletLineNum };
    saveContentHashes(stateDir, contentHashes);
    invalidateLearningsCacheEntry(learningsPath);

    return Ok({
      appended: true,
      ...(overlapResult ? { overlap: overlapResult } : {}),
    });
  } catch (error) {
    return Err(
      new Error(
        `Failed to append learning: ${error instanceof Error ? error.message : String(error)}`
      )
    );
  }
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
  const { intent, tokenBudget = 1000, skill, session, stream, depth = 'summary' } = options;

  // Layer 1: Index-only mode — return summaries, skip full text loading
  if (depth === 'index') {
    const indexEntries: LearningsIndexEntry[] = [];

    if (session) {
      const sessionResult = await loadIndexEntries(projectPath, skill, stream, session);
      if (sessionResult.ok) indexEntries.push(...sessionResult.value);
    }

    const globalResult = await loadIndexEntries(projectPath, skill, stream);
    if (globalResult.ok) {
      const sessionHashes = new Set(indexEntries.map((e) => e.hash));
      const uniqueGlobal = globalResult.value.filter((e) => !sessionHashes.has(e.hash));
      indexEntries.push(...uniqueGlobal);
    }

    // Apply token budget to summaries
    const budgeted: string[] = [];
    let totalTokens = 0;
    for (const entry of indexEntries) {
      const separator = budgeted.length > 0 ? '\n' : '';
      const entryCost = estimateTokens(entry.summary + separator);
      if (totalTokens + entryCost > tokenBudget) break;
      budgeted.push(entry.summary);
      totalTokens += entryCost;
    }

    return Ok(budgeted);
  }

  // Layer 2 ("summary") and Layer 3 ("full"): existing full-text behavior
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

/**
 * Load lightweight index entries from a learnings file.
 * Returns summaries (first line) with hash and tags for each entry.
 * Uses frontmatter when available; computes hash and extracts tags on-the-fly when not.
 *
 * This is Layer 1 of the progressive disclosure pipeline.
 */
export async function loadIndexEntries(
  projectPath: string,
  skillName?: string,
  stream?: string,
  session?: string
): Promise<Result<LearningsIndexEntry[], Error>> {
  try {
    const dirResult = await getStateDir(projectPath, stream, session);
    if (!dirResult.ok) return dirResult;
    const stateDir = dirResult.value;
    const learningsPath = path.join(stateDir, LEARNINGS_FILE);

    if (!fs.existsSync(learningsPath)) {
      return Ok([]);
    }

    const content = fs.readFileSync(learningsPath, 'utf-8');
    const lines = content.split('\n');
    const indexEntries: LearningsIndexEntry[] = [];
    let pendingFrontmatter: LearningsFrontmatter | null = null;
    let currentBlock: string[] = [];

    for (const line of lines) {
      if (line.startsWith('# ')) continue;

      const fm = parseFrontmatter(line);
      if (fm) {
        pendingFrontmatter = fm;
        continue;
      }

      const isDatedBullet = /^- \*\*\d{4}-\d{2}-\d{2}/.test(line);
      const isHeading = /^## \d{4}-\d{2}-\d{2}/.test(line);

      if (isDatedBullet || isHeading) {
        // Start new entry
        if (pendingFrontmatter) {
          // Extract structured fields from the entry line even when frontmatter is present
          const rootCauseMatch = line.match(/\[root_cause:([^\]]+)\]/);
          const triedMatch = line.match(/\[tried:([^\]]+)\]/);
          indexEntries.push({
            hash: pendingFrontmatter.hash,
            tags: pendingFrontmatter.tags,
            summary: line,
            fullText: '', // Placeholder — full text not loaded in index mode
            ...(rootCauseMatch?.[1] ? { rootCause: rootCauseMatch[1] } : {}),
            ...(triedMatch?.[1]
              ? { triedAndFailed: triedMatch[1].split(',').map((s) => s.trim()) }
              : {}),
          });
          pendingFrontmatter = null;
        } else {
          const idx = extractIndexEntry(line);
          indexEntries.push({
            hash: idx.hash,
            tags: idx.tags,
            summary: line,
            fullText: '',
          });
        }
        currentBlock = [line];
      } else if (line.trim() !== '' && currentBlock.length > 0) {
        currentBlock.push(line);
      }
    }

    if (skillName) {
      const filtered = indexEntries.filter(
        (e) => e.tags.includes(skillName) || e.summary.includes(`[skill:${skillName}]`)
      );
      return Ok(filtered);
    }

    return Ok(indexEntries);
  } catch (error) {
    return Err(
      new Error(
        `Failed to load index entries: ${error instanceof Error ? error.message : String(error)}`
      )
    );
  }
}
