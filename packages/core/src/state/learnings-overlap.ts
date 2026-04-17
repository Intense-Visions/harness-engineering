// packages/core/src/state/learnings-overlap.ts
//
// Semantic overlap detection for learnings: 5-dimension scoring.
// Prevents near-duplicate learnings with different wording.
// Leaf module — imports only from learnings-content.ts.

import {
  normalizeLearningContent,
  parseDateFromEntry,
  computeEntryHash,
} from './learnings-content';

// --- Types ---

export interface OverlapDimensions {
  lexical: number;
  structural: number;
  rootCause: number;
  temporal: number;
  codeReference: number;
}

export interface OverlapResult {
  score: number;
  dimensions: OverlapDimensions;
  matchedEntry?: string;
  matchedHash?: string;
}

// --- Dimension Weights ---

const WEIGHTS = {
  lexical: 0.3,
  structural: 0.25,
  rootCause: 0.2,
  temporal: 0.1,
  codeReference: 0.15,
} as const;

// --- Dimension Scorers ---

/**
 * Jaccard coefficient on word sets from normalized content.
 */
export function computeLexicalSimilarity(a: string, b: string): number {
  const wordsA = new Set(
    normalizeLearningContent(a)
      .split(/\s+/)
      .filter((w) => w.length > 2)
  );
  const wordsB = new Set(
    normalizeLearningContent(b)
      .split(/\s+/)
      .filter((w) => w.length > 2)
  );
  if (wordsA.size === 0 && wordsB.size === 0) return 0;
  const intersection = new Set([...wordsA].filter((w) => wordsB.has(w)));
  const union = new Set([...wordsA, ...wordsB]);
  if (union.size === 0) return 0;
  return intersection.size / union.size;
}

/** Extract a tag value from an entry string, or undefined. */
function extractTag(entry: string, tag: string): string | undefined {
  return entry.match(new RegExp(`\\[${tag}:([^\\]]+)\\]`))?.[1];
}

/**
 * Binary match on skill and outcome tags, averaged.
 * Returns 1.0 if both match, 0.5 if one matches, 0.0 if neither.
 */
export function computeStructuralMatch(a: string, b: string): number {
  const pairs: [string | undefined, string | undefined][] = [
    [extractTag(a, 'skill'), extractTag(b, 'skill')],
    [extractTag(a, 'outcome'), extractTag(b, 'outcome')],
  ];

  const comparable = pairs.filter(([va, vb]) => va !== undefined && vb !== undefined);
  if (comparable.length === 0) return 0;

  const matched = comparable.filter(([va, vb]) => va === vb).length;
  return matched / comparable.length;
}

/**
 * Binary match on root_cause tag. 1.0 if same, 0.0 otherwise.
 */
export function computeRootCauseMatch(a: string, b: string): number {
  const rcA = a.match(/\[root_cause:([^\]]+)\]/)?.[1];
  const rcB = b.match(/\[root_cause:([^\]]+)\]/)?.[1];
  if (!rcA || !rcB) return 0;
  return rcA === rcB ? 1.0 : 0.0;
}

/**
 * Temporal decay: 1.0 at same day, ~0.5 at 7 days, 0.0 at 30+ days.
 * Uses exponential decay: e^(-daysDiff * ln(2) / 7)
 */
export function computeTemporalProximity(a: string, b: string): number {
  const dateA = parseDateFromEntry(a);
  const dateB = parseDateFromEntry(b);
  if (!dateA || !dateB) return 0;

  const msA = new Date(dateA).getTime();
  const msB = new Date(dateB).getTime();
  const daysDiff = Math.abs(msA - msB) / (1000 * 60 * 60 * 24);

  if (daysDiff >= 30) return 0;
  return Math.exp((-daysDiff * Math.LN2) / 7);
}

/**
 * Extract file path references from text.
 * Matches patterns like src/foo/bar.ts, packages/X/Y.ts, etc.
 */
export function extractFileReferences(text: string): string[] {
  const pattern = /(?:^|\s)((?:[\w@.-]+\/)+[\w.-]+\.(?:ts|js|tsx|jsx|json|md|mts|mjs))/g;
  const refs: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    if (match[1]) refs.push(match[1]);
  }
  return refs;
}

/**
 * Jaccard coefficient on file path references.
 */
export function computeCodeReferenceOverlap(a: string, b: string): number {
  const refsA = new Set(extractFileReferences(a));
  const refsB = new Set(extractFileReferences(b));
  if (refsA.size === 0 && refsB.size === 0) return 0;
  const intersection = new Set([...refsA].filter((r) => refsB.has(r)));
  const union = new Set([...refsA, ...refsB]);
  if (union.size === 0) return 0;
  return intersection.size / union.size;
}

// --- Composite Scorer ---

/**
 * Check overlap between a new entry and existing entries.
 * Returns the highest-scoring match with dimension breakdown.
 */
export function checkOverlap(
  newEntry: string,
  existingEntries: string[],
  options?: { threshold?: number }
): OverlapResult {
  const threshold = options?.threshold ?? 0.7;

  if (existingEntries.length === 0) {
    return {
      score: 0,
      dimensions: { lexical: 0, structural: 0, rootCause: 0, temporal: 0, codeReference: 0 },
    };
  }

  let bestScore = 0;
  let bestDimensions: OverlapDimensions = {
    lexical: 0,
    structural: 0,
    rootCause: 0,
    temporal: 0,
    codeReference: 0,
  };
  let bestEntry: string | undefined;

  for (const existing of existingEntries) {
    const dimensions: OverlapDimensions = {
      lexical: computeLexicalSimilarity(newEntry, existing),
      structural: computeStructuralMatch(newEntry, existing),
      rootCause: computeRootCauseMatch(newEntry, existing),
      temporal: computeTemporalProximity(newEntry, existing),
      codeReference: computeCodeReferenceOverlap(newEntry, existing),
    };

    const score =
      dimensions.lexical * WEIGHTS.lexical +
      dimensions.structural * WEIGHTS.structural +
      dimensions.rootCause * WEIGHTS.rootCause +
      dimensions.temporal * WEIGHTS.temporal +
      dimensions.codeReference * WEIGHTS.codeReference;

    if (score > bestScore) {
      bestScore = score;
      bestDimensions = dimensions;
      bestEntry = existing;
    }
  }

  return {
    score: bestScore,
    dimensions: bestDimensions,
    ...(bestScore >= threshold && bestEntry
      ? { matchedEntry: bestEntry, matchedHash: computeEntryHash(bestEntry) }
      : {}),
  };
}
