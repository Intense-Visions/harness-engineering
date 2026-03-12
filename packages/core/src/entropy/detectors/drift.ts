import type { Result } from '../../shared/result';
import { Ok, Err } from '../../shared/result';
import type {
  EntropyError,
  CodebaseSnapshot,
  DriftConfig,
  DriftReport,
  DocumentationDrift
} from '../types';
import { createEntropyError } from '../../shared/errors';
import { fileExists } from '../../shared/fs-utils';
import { dirname, join, resolve } from 'path';

/**
 * Calculate Levenshtein distance between two strings
 */
export function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Find possible matches for a reference in a list of exports
 */
export function findPossibleMatches(
  reference: string,
  exportNames: string[],
  maxDistance: number = 5
): string[] {
  const matches: { name: string; score: number }[] = [];
  const refLower = reference.toLowerCase();

  for (const name of exportNames) {
    const nameLower = name.toLowerCase();

    // Exact match (case-insensitive)
    if (nameLower === refLower) {
      matches.push({ name, score: 0 });
      continue;
    }

    // Prefix/suffix match
    if (nameLower.includes(refLower) || refLower.includes(nameLower)) {
      matches.push({ name, score: 1 });
      continue;
    }

    // Levenshtein distance
    const distance = levenshteinDistance(refLower, nameLower);
    if (distance <= maxDistance) {
      matches.push({ name, score: distance });
    }
  }

  return matches
    .sort((a, b) => a.score - b.score)
    .slice(0, 3)
    .map(m => m.name);
}
