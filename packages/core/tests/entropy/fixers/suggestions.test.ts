import { describe, it, expect } from 'vitest';
import { generateSuggestions } from '../../../src/entropy/fixers/suggestions';
import type { DeadCodeReport, DriftReport, PatternReport } from '../../../src/entropy/types';

describe('generateSuggestions', () => {
  it('should return empty suggestions when no reports provided', () => {
    const result = generateSuggestions();

    expect(result.suggestions).toEqual([]);
    expect(result.byPriority.high).toEqual([]);
    expect(result.byPriority.medium).toEqual([]);
    expect(result.byPriority.low).toEqual([]);
    expect(result.estimatedEffort).toBe('trivial');
  });

  it('should generate suggestions from dead code report', () => {
    const deadCodeReport: DeadCodeReport = {
      deadFiles: [
        { path: '/project/src/unused.ts', reason: 'NO_IMPORTERS', exportCount: 2, lineCount: 50 },
      ],
      deadExports: [
        { file: '/project/src/utils.ts', name: 'unusedFn', line: 10, type: 'function', isDefault: false, reason: 'NO_IMPORTERS' },
      ],
      unusedImports: [
        { file: '/project/src/main.ts', line: 5, source: 'lodash', specifiers: ['map', 'filter'], isFullyUnused: true },
      ],
      deadInternals: [],
      stats: {
        filesAnalyzed: 10,
        entryPointsUsed: ['/project/src/index.ts'],
        totalExports: 20,
        deadExportCount: 1,
        totalFiles: 10,
        deadFileCount: 1,
        estimatedDeadLines: 50,
      },
    };

    const result = generateSuggestions(deadCodeReport);

    expect(result.suggestions.length).toBe(3);

    // Dead file suggestion
    const deadFileSuggestion = result.suggestions.find(s => s.title.includes('dead file'));
    expect(deadFileSuggestion).toBeDefined();
    expect(deadFileSuggestion?.type).toBe('delete');
    expect(deadFileSuggestion?.priority).toBe('high');
    expect(deadFileSuggestion?.source).toBe('dead-code');

    // Dead export suggestion
    const deadExportSuggestion = result.suggestions.find(s => s.title.includes('unused export'));
    expect(deadExportSuggestion).toBeDefined();
    expect(deadExportSuggestion?.type).toBe('refactor');
    expect(deadExportSuggestion?.priority).toBe('medium');

    // Unused import suggestion
    const unusedImportSuggestion = result.suggestions.find(s => s.title.includes('unused import'));
    expect(unusedImportSuggestion).toBeDefined();
    expect(unusedImportSuggestion?.type).toBe('delete');
  });

  it('should generate suggestions from drift report', () => {
    const driftReport: DriftReport = {
      drifts: [
        {
          type: 'api-signature',
          docFile: '/project/docs/api.md',
          line: 25,
          reference: 'fetchUser',
          context: 'code-block',
          issue: 'SIGNATURE_CHANGED',
          details: 'Function signature has changed',
          suggestion: 'Update docs to use new signature',
          confidence: 'high',
        },
        {
          type: 'example-code',
          docFile: '/project/README.md',
          line: 10,
          reference: 'example usage',
          context: 'code-block',
          issue: 'SYNTAX_ERROR',
          details: 'Example code has syntax error',
          confidence: 'medium',
        },
      ],
      stats: {
        docsScanned: 5,
        referencesChecked: 20,
        driftsFound: 2,
        byType: { api: 1, example: 1, structure: 0 },
      },
      severity: 'high',
    };

    const result = generateSuggestions(undefined, driftReport);

    expect(result.suggestions.length).toBe(2);

    // High confidence drift should be high priority
    const highConfidenceDrift = result.suggestions.find(s => s.relatedIssues[0].includes('fetchUser'));
    expect(highConfidenceDrift?.priority).toBe('high');

    // Medium confidence drift should be medium priority
    const mediumConfidenceDrift = result.suggestions.find(s => s.title.includes('example usage'));
    expect(mediumConfidenceDrift?.priority).toBe('medium');
  });

  it('should generate suggestions from pattern report', () => {
    const patternReport: PatternReport = {
      violations: [
        {
          pattern: 'max-exports',
          file: '/project/src/index.ts',
          line: 1,
          severity: 'error',
          message: 'File has too many exports (7 > 5)',
          suggestion: 'Split exports into multiple modules',
        },
        {
          pattern: 'no-lodash',
          file: '/project/src/utils.ts',
          line: 5,
          severity: 'warning',
          message: 'Import from lodash is not allowed',
        },
      ],
      stats: {
        filesChecked: 10,
        patternsApplied: 2,
        violationCount: 2,
        errorCount: 1,
        warningCount: 1,
      },
      passRate: 0.8,
    };

    const result = generateSuggestions(undefined, undefined, patternReport);

    expect(result.suggestions.length).toBe(2);

    // Error severity should be high priority
    const errorSuggestion = result.suggestions.find(s => s.title.includes('max-exports'));
    expect(errorSuggestion?.priority).toBe('high');
    expect(errorSuggestion?.steps[0]).toBe('Split exports into multiple modules');

    // Warning severity should be low priority
    const warningSuggestion = result.suggestions.find(s => s.title.includes('no-lodash'));
    expect(warningSuggestion?.priority).toBe('low');
    expect(warningSuggestion?.steps[0]).toBe('Follow pattern guidelines');
  });

  it('should sort suggestions by priority', () => {
    const deadCodeReport: DeadCodeReport = {
      deadFiles: [
        { path: '/project/src/unused.ts', reason: 'NO_IMPORTERS', exportCount: 2, lineCount: 50 },
      ],
      deadExports: [],
      unusedImports: [],
      deadInternals: [],
      stats: {
        filesAnalyzed: 10,
        entryPointsUsed: [],
        totalExports: 20,
        deadExportCount: 0,
        totalFiles: 10,
        deadFileCount: 1,
        estimatedDeadLines: 50,
      },
    };

    const patternReport: PatternReport = {
      violations: [
        {
          pattern: 'no-console',
          file: '/project/src/debug.ts',
          line: 5,
          severity: 'warning',
          message: 'Console statements not allowed',
        },
      ],
      stats: {
        filesChecked: 10,
        patternsApplied: 1,
        violationCount: 1,
        errorCount: 0,
        warningCount: 1,
      },
      passRate: 0.9,
    };

    const result = generateSuggestions(deadCodeReport, undefined, patternReport);

    expect(result.suggestions.length).toBe(2);
    // High priority should come first
    expect(result.suggestions[0].priority).toBe('high');
    expect(result.suggestions[1].priority).toBe('low');
  });

  it('should estimate effort based on suggestion count', () => {
    // No suggestions = trivial
    expect(generateSuggestions().estimatedEffort).toBe('trivial');

    // 1-5 suggestions = small
    const smallReport: DeadCodeReport = {
      deadFiles: [
        { path: '/project/src/a.ts', reason: 'NO_IMPORTERS', exportCount: 1, lineCount: 10 },
        { path: '/project/src/b.ts', reason: 'NO_IMPORTERS', exportCount: 1, lineCount: 10 },
      ],
      deadExports: [],
      unusedImports: [],
      deadInternals: [],
      stats: {
        filesAnalyzed: 10,
        entryPointsUsed: [],
        totalExports: 20,
        deadExportCount: 0,
        totalFiles: 10,
        deadFileCount: 2,
        estimatedDeadLines: 20,
      },
    };
    expect(generateSuggestions(smallReport).estimatedEffort).toBe('small');

    // 6-20 suggestions = medium
    const mediumReport: DeadCodeReport = {
      deadFiles: Array.from({ length: 10 }, (_, i) => ({
        path: `/project/src/file${i}.ts`,
        reason: 'NO_IMPORTERS' as const,
        exportCount: 1,
        lineCount: 10,
      })),
      deadExports: [],
      unusedImports: [],
      deadInternals: [],
      stats: {
        filesAnalyzed: 20,
        entryPointsUsed: [],
        totalExports: 40,
        deadExportCount: 0,
        totalFiles: 20,
        deadFileCount: 10,
        estimatedDeadLines: 100,
      },
    };
    expect(generateSuggestions(mediumReport).estimatedEffort).toBe('medium');

    // >20 suggestions = large
    const largeReport: DeadCodeReport = {
      deadFiles: Array.from({ length: 25 }, (_, i) => ({
        path: `/project/src/file${i}.ts`,
        reason: 'NO_IMPORTERS' as const,
        exportCount: 1,
        lineCount: 10,
      })),
      deadExports: [],
      unusedImports: [],
      deadInternals: [],
      stats: {
        filesAnalyzed: 50,
        entryPointsUsed: [],
        totalExports: 100,
        deadExportCount: 0,
        totalFiles: 50,
        deadFileCount: 25,
        estimatedDeadLines: 250,
      },
    };
    expect(generateSuggestions(largeReport).estimatedEffort).toBe('large');
  });
});
