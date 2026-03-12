import { describe, it, expect } from 'vitest';
import { createFixes, previewFix } from '../../../src/entropy/fixers/safe-fixes';
import type { DeadCodeReport, Fix } from '../../../src/entropy/types';

describe('createFixes', () => {
  it('should create fix for dead files', () => {
    const deadCodeReport: DeadCodeReport = {
      deadExports: [],
      deadFiles: [
        { path: '/project/src/unused.ts', reason: 'NO_IMPORTERS', exportCount: 2, lineCount: 50 },
      ],
      deadInternals: [],
      unusedImports: [],
      stats: {
        filesAnalyzed: 10,
        entryPointsUsed: ['/project/src/index.ts'],
        totalExports: 20,
        deadExportCount: 2,
        totalFiles: 10,
        deadFileCount: 1,
        estimatedDeadLines: 50,
      },
    };

    const fixes = createFixes(deadCodeReport, { fixTypes: ['dead-files'], dryRun: false, createBackup: true });

    expect(fixes.length).toBe(1);
    expect(fixes[0].type).toBe('dead-files');
    expect(fixes[0].action).toBe('delete-file');
    expect(fixes[0].file).toBe('/project/src/unused.ts');
    expect(fixes[0].safe).toBe(true);
    expect(fixes[0].reversible).toBe(true);
  });

  it('should create fix for unused imports', () => {
    const deadCodeReport: DeadCodeReport = {
      deadExports: [],
      deadFiles: [],
      deadInternals: [],
      unusedImports: [
        { file: '/project/src/used.ts', line: 1, source: './helper', specifiers: ['unused'], isFullyUnused: false },
      ],
      stats: {
        filesAnalyzed: 10,
        entryPointsUsed: [],
        totalExports: 20,
        deadExportCount: 0,
        totalFiles: 10,
        deadFileCount: 0,
        estimatedDeadLines: 0,
      },
    };

    const fixes = createFixes(deadCodeReport, { fixTypes: ['unused-imports'], dryRun: false, createBackup: false });

    expect(fixes.length).toBe(1);
    expect(fixes[0].type).toBe('unused-imports');
    expect(fixes[0].action).toBe('delete-lines');
  });

  it('should filter by fixTypes config', () => {
    const deadCodeReport: DeadCodeReport = {
      deadExports: [],
      deadFiles: [
        { path: '/project/src/unused.ts', reason: 'NO_IMPORTERS', exportCount: 2, lineCount: 50 },
      ],
      deadInternals: [],
      unusedImports: [
        { file: '/project/src/used.ts', line: 1, source: './helper', specifiers: ['unused'], isFullyUnused: false },
      ],
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

    // Only request unused-imports fixes, not dead-files
    const fixes = createFixes(deadCodeReport, { fixTypes: ['unused-imports'], dryRun: false, createBackup: false });

    expect(fixes.every(f => f.type === 'unused-imports')).toBe(true);
    expect(fixes.some(f => f.type === 'dead-files')).toBe(false);
  });
});

describe('previewFix', () => {
  it('should show what a delete-file fix would do', () => {
    const fix: Fix = {
      type: 'dead-files',
      file: '/project/src/unused.ts',
      description: 'Delete dead file',
      action: 'delete-file',
      safe: true,
      reversible: true,
    };

    const preview = previewFix(fix);

    expect(preview).toContain('unused.ts');
    expect(preview).toContain('delete');
  });

  it('should show what a delete-lines fix would do', () => {
    const fix: Fix = {
      type: 'unused-imports',
      file: '/project/src/file.ts',
      description: 'Remove unused import',
      action: 'delete-lines',
      line: 5,
      safe: true,
      reversible: true,
    };

    const preview = previewFix(fix);

    expect(preview).toContain('line 5');
    expect(preview).toContain('file.ts');
  });
});
