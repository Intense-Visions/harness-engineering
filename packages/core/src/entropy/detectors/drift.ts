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

const DEFAULT_DRIFT_CONFIG: DriftConfig = {
  docPaths: [],
  checkApiSignatures: true,
  checkExamples: true,
  checkStructure: true,
  ignorePatterns: [],
};

/**
 * Check API signature drift - docs reference symbols that don't exist
 */
function checkApiSignatureDrift(
  snapshot: CodebaseSnapshot,
  config: DriftConfig
): DocumentationDrift[] {
  const drifts: DocumentationDrift[] = [];
  const exportNames = Array.from(snapshot.exportMap.byName.keys());

  for (const ref of snapshot.codeReferences) {
    if (config.ignorePatterns.some(p => ref.reference.match(new RegExp(p)))) {
      continue;
    }

    // Check if reference exists in exports
    if (!snapshot.exportMap.byName.has(ref.reference)) {
      const possibleMatches = findPossibleMatches(ref.reference, exportNames);
      const confidence = possibleMatches.length > 0 ? 'high' : 'medium';

      drifts.push({
        type: 'api-signature',
        docFile: ref.docFile,
        line: ref.line,
        reference: ref.reference,
        context: ref.context,
        issue: possibleMatches.length > 0 ? 'RENAMED' : 'NOT_FOUND',
        details: possibleMatches.length > 0
          ? `Symbol "${ref.reference}" not found. Similar: ${possibleMatches.join(', ')}`
          : `Symbol "${ref.reference}" not found in codebase`,
        suggestion: possibleMatches.length > 0
          ? `Did you mean "${possibleMatches[0]}"?`
          : 'Remove reference or add the missing export',
        possibleMatches: possibleMatches.length > 0 ? possibleMatches : undefined,
        confidence,
      });
    }
  }

  return drifts;
}

/**
 * Detect documentation drift in a codebase
 */
export function detectDocDrift(
  snapshot: CodebaseSnapshot,
  config?: Partial<DriftConfig>
): Result<DriftReport, EntropyError> {
  const fullConfig = { ...DEFAULT_DRIFT_CONFIG, ...config };
  const drifts: DocumentationDrift[] = [];

  // Check API signature drift
  if (fullConfig.checkApiSignatures) {
    drifts.push(...checkApiSignatureDrift(snapshot, fullConfig));
  }

  // Calculate stats
  const apiDrifts = drifts.filter(d => d.type === 'api-signature').length;
  const exampleDrifts = drifts.filter(d => d.type === 'example-code').length;
  const structureDrifts = drifts.filter(d => d.type === 'structure').length;

  const severity = drifts.length === 0 ? 'none'
    : drifts.length <= 3 ? 'low'
    : drifts.length <= 10 ? 'medium'
    : 'high';

  return Ok({
    drifts,
    stats: {
      docsScanned: snapshot.docs.length,
      referencesChecked: snapshot.codeReferences.length,
      driftsFound: drifts.length,
      byType: { api: apiDrifts, example: exampleDrifts, structure: structureDrifts },
    },
    severity,
  });
}
