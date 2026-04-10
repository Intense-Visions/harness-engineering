// packages/core/src/state/learnings-content.ts
//
// Content deduplication: normalization, hashing, and content hash index management.
// Extracted from learnings.ts to reduce blast radius.

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { CONTENT_HASHES_FILE } from './constants';

// --- Types ---

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

/** Content hash index: maps content hash -> metadata */
export interface ContentHashEntry {
  date: string;
  line: number;
}

export type ContentHashIndex = Record<string, ContentHashEntry>;

// --- Parsing ---

/** Parse a frontmatter comment line: <!-- hash:XXXX tags:a,b --> */
export function parseFrontmatter(line: string): LearningsFrontmatter | null {
  const match = line.match(/^<!--\s+hash:([a-f0-9]+)(?:\s+tags:([^\s]+))?\s+-->/);
  if (!match) return null;
  const hash = match[1]!;
  const tags = match[2] ? match[2].split(',').filter(Boolean) : [];
  return { hash, tags };
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

// --- Hashing ---

/** Compute an 8-char hex hash of the entry text. */
export function computeEntryHash(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex').slice(0, 8);
}

/**
 * Normalize learning content for deduplication.
 * Strips date prefixes, skill/outcome tags, list markers, bold markers;
 * lowercases; collapses whitespace; trims.
 */
export function normalizeLearningContent(text: string): string {
  let normalized = text;
  // Strip date prefix (YYYY-MM-DD)
  normalized = normalized.replace(/\d{4}-\d{2}-\d{2}/g, '');
  // Strip skill/outcome tags
  normalized = normalized.replace(/\[skill:[^\]]*\]/g, '');
  normalized = normalized.replace(/\[outcome:[^\]]*\]/g, '');
  // Strip list markers (- or *)
  normalized = normalized.replace(/^[\s]*[-*]\s+/gm, '');
  // Strip bold markers
  normalized = normalized.replace(/\*\*/g, '');
  // Strip colons left after tag removal (e.g., ":]" -> "")
  normalized = normalized.replace(/:\s*/g, ' ');
  // Lowercase
  normalized = normalized.toLowerCase();
  // Collapse whitespace
  normalized = normalized.replace(/\s+/g, ' ').trim();
  return normalized;
}

/**
 * Compute a 16-char hex SHA-256 hash of normalized content.
 */
export function computeContentHash(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex').slice(0, 16);
}

// --- Content Hash Index I/O ---

/** Load content hash index from sidecar file. Returns empty object on missing/corrupt. */
export function loadContentHashes(stateDir: string): ContentHashIndex {
  const hashesPath = path.join(stateDir, CONTENT_HASHES_FILE);
  if (!fs.existsSync(hashesPath)) return {};
  try {
    const raw = fs.readFileSync(hashesPath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    return parsed as ContentHashIndex;
  } catch {
    return {};
  }
}

/** Save content hash index to sidecar file. */
export function saveContentHashes(stateDir: string, index: ContentHashIndex): void {
  const hashesPath = path.join(stateDir, CONTENT_HASHES_FILE);
  fs.writeFileSync(hashesPath, JSON.stringify(index, null, 2) + '\n');
}

/**
 * Rebuild content hash index from learnings.md.
 * Used for self-healing when sidecar is missing or corrupted.
 */
export function rebuildContentHashes(stateDir: string, learningsFile: string): ContentHashIndex {
  const learningsPath = path.join(stateDir, learningsFile);
  if (!fs.existsSync(learningsPath)) return {};

  const content = fs.readFileSync(learningsPath, 'utf-8');
  const lines = content.split('\n');
  const index: ContentHashIndex = {};

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const isDatedBullet = /^- \*\*\d{4}-\d{2}-\d{2}/.test(line);
    if (isDatedBullet) {
      // Extract the raw learning text from the bullet line
      const learningMatch = line.match(/:\*\*\s*(.+)$/);
      if (learningMatch?.[1]) {
        const normalized = normalizeLearningContent(learningMatch[1]);
        const hash = computeContentHash(normalized);
        const dateMatch = line.match(/(\d{4}-\d{2}-\d{2})/);
        index[hash] = { date: dateMatch?.[1] ?? '', line: i + 1 };
      }
    }
  }

  saveContentHashes(stateDir, index);
  return index;
}

// --- Pattern Analysis ---

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

// Re-export from canonical source to avoid duplication
export { estimateTokens } from '../compaction/envelope';

/**
 * Score how relevant a learning entry is to a given intent.
 * Returns a number 0-1. Higher = more relevant.
 * Uses keyword overlap between intent words and entry text.
 */
export function scoreRelevance(entry: string, intent: string): number {
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
