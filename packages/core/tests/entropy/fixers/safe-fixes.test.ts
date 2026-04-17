import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createFixes, previewFix, applyFixes } from '../../../src/entropy/fixers/safe-fixes';
import type { DeadCodeReport, Fix } from '../../../src/entropy/types';
import { createRegionMap } from '../../../src/annotations';
import * as fs from 'fs';
import { promisify } from 'util';
import * as path from 'path';
import * as os from 'os';

const writeFile = promisify(fs.writeFile);
const readFile = promisify(fs.readFile);
const mkdir = promisify(fs.mkdir);
const rm = promisify(fs.rm);
const exists = (p: string) =>
  fs.promises
    .access(p)
    .then(() => true)
    .catch(() => false);

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

    const fixes = createFixes(deadCodeReport, {
      fixTypes: ['dead-files'],
      dryRun: false,
      createBackup: true,
    });

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
        {
          file: '/project/src/used.ts',
          line: 1,
          source: './helper',
          specifiers: ['unused'],
          isFullyUnused: false,
        },
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

    const fixes = createFixes(deadCodeReport, {
      fixTypes: ['unused-imports'],
      dryRun: false,
      createBackup: false,
    });

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
        {
          file: '/project/src/used.ts',
          line: 1,
          source: './helper',
          specifiers: ['unused'],
          isFullyUnused: false,
        },
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
    const fixes = createFixes(deadCodeReport, {
      fixTypes: ['unused-imports'],
      dryRun: false,
      createBackup: false,
    });

    expect(fixes.every((f) => f.type === 'unused-imports')).toBe(true);
    expect(fixes.some((f) => f.type === 'dead-files')).toBe(false);
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

describe('applyFixes', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `safe-fixes-test-${Date.now()}`);
    await mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('should not modify files in dry-run mode', async () => {
    const testFile = path.join(tempDir, 'test.ts');
    await writeFile(testFile, 'const x = 1;');

    const fixes: Fix[] = [
      {
        type: 'dead-files',
        file: testFile,
        description: 'Delete file',
        action: 'delete-file',
        safe: true,
        reversible: true,
      },
    ];

    const result = await applyFixes(fixes, {
      dryRun: true,
      fixTypes: ['dead-files'],
      createBackup: false,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.applied.length).toBe(1);
      // File should still exist in dry-run mode
      expect(await exists(testFile)).toBe(true);
    }
  });

  it('should delete file when applying delete-file fix', async () => {
    const testFile = path.join(tempDir, 'to-delete.ts');
    await writeFile(testFile, 'const unused = 1;');

    const fixes: Fix[] = [
      {
        type: 'dead-files',
        file: testFile,
        description: 'Delete dead file',
        action: 'delete-file',
        safe: true,
        reversible: true,
      },
    ];

    const result = await applyFixes(fixes, {
      dryRun: false,
      fixTypes: ['dead-files'],
      createBackup: false,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.applied.length).toBe(1);
      expect(result.value.stats.filesDeleted).toBe(1);
      expect(await exists(testFile)).toBe(false);
    }
  });

  it('should delete line when applying delete-lines fix', async () => {
    const testFile = path.join(tempDir, 'with-unused-import.ts');
    await writeFile(testFile, 'import { unused } from "./helper";\nconst x = 1;\nexport { x };');

    const fixes: Fix[] = [
      {
        type: 'unused-imports',
        file: testFile,
        description: 'Remove unused import',
        action: 'delete-lines',
        line: 1,
        safe: true,
        reversible: true,
      },
    ];

    const result = await applyFixes(fixes, {
      dryRun: false,
      fixTypes: ['unused-imports'],
      createBackup: false,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.applied.length).toBe(1);
      expect(result.value.stats.linesRemoved).toBe(1);
      const content = await readFile(testFile, 'utf-8');
      expect(content).not.toContain('import');
      expect(content).toContain('const x = 1');
    }
  });

  it('should skip fixes not in fixTypes', async () => {
    const testFile = path.join(tempDir, 'keep-me.ts');
    await writeFile(testFile, 'const x = 1;');

    const fixes: Fix[] = [
      {
        type: 'dead-files',
        file: testFile,
        description: 'Delete file',
        action: 'delete-file',
        safe: true,
        reversible: true,
      },
    ];

    // Request only unused-imports, not dead-files
    const result = await applyFixes(fixes, {
      dryRun: false,
      fixTypes: ['unused-imports'],
      createBackup: false,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.skipped.length).toBe(1);
      expect(result.value.applied.length).toBe(0);
      expect(await exists(testFile)).toBe(true);
    }
  });

  it('should track errors when file operation fails', async () => {
    const nonExistentFile = path.join(tempDir, 'does-not-exist.ts');

    const fixes: Fix[] = [
      {
        type: 'dead-files',
        file: nonExistentFile,
        description: 'Delete non-existent file',
        action: 'delete-file',
        safe: true,
        reversible: true,
      },
    ];

    const result = await applyFixes(fixes, {
      dryRun: false,
      fixTypes: ['dead-files'],
      createBackup: false,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.errors.length).toBe(1);
      expect(result.value.errors[0].fix.file).toBe(nonExistentFile);
    }
  });

  it('should create backup when configured', async () => {
    const testFile = path.join(tempDir, 'backup-me.ts');
    const backupDir = path.join(tempDir, 'backups');
    await writeFile(testFile, 'const original = 1;');

    const fixes: Fix[] = [
      {
        type: 'dead-files',
        file: testFile,
        description: 'Delete file with backup',
        action: 'delete-file',
        safe: true,
        reversible: true,
      },
    ];

    const result = await applyFixes(fixes, {
      dryRun: false,
      fixTypes: ['dead-files'],
      createBackup: true,
      backupDir,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.applied.length).toBe(1);
      // Original file should be deleted
      expect(await exists(testFile)).toBe(false);
      // Backup directory should have a file
      const backupFiles = fs.readdirSync(backupDir);
      expect(backupFiles.length).toBe(1);
      expect(backupFiles[0]).toContain('backup-me.ts');
    }
  });
});

describe('applyFixes with protectedRegions', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = path.join(os.tmpdir(), `safe-fixes-protected-${Date.now()}`);
    await mkdir(tmpDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('skips fixes in protected lines', async () => {
    const testFile = path.join(tmpDir, 'protected.ts');
    await writeFile(testFile, 'import { unused } from "mod";\nconst a = 1;\n');

    const protectedRegions = createRegionMap([
      {
        file: testFile,
        startLine: 1,
        endLine: 1,
        scopes: ['entropy'],
        reason: 'protected import',
        type: 'line',
      },
    ]);

    const fixes: Fix[] = [
      {
        type: 'unused-imports',
        file: testFile,
        description: 'Remove unused import',
        action: 'delete-lines',
        line: 1,
        safe: true,
        reversible: true,
      },
    ];

    const result = await applyFixes(fixes, {
      fixTypes: ['unused-imports'],
      dryRun: false,
      createBackup: false,
      protectedRegions,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.applied).toHaveLength(0);
      expect(result.value.skipped).toHaveLength(1);
      // File should be unchanged
      const content = await readFile(testFile, 'utf-8');
      expect(content).toBe('import { unused } from "mod";\nconst a = 1;\n');
    }
  });

  it('applies fixes when no protectedRegions provided (backward compatible)', async () => {
    const testFile = path.join(tmpDir, 'unprotected.ts');
    await writeFile(testFile, 'import { unused } from "mod";\nconst a = 1;\n');

    const fixes: Fix[] = [
      {
        type: 'unused-imports',
        file: testFile,
        description: 'Remove unused import',
        action: 'delete-lines',
        line: 1,
        safe: true,
        reversible: true,
      },
    ];

    const result = await applyFixes(fixes, {
      fixTypes: ['unused-imports'],
      dryRun: false,
      createBackup: false,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.applied).toHaveLength(1);
      expect(result.value.skipped).toHaveLength(0);
    }
  });

  it('skips delete-file when file has any protected region', async () => {
    const testFile = path.join(tmpDir, 'protected-file.ts');
    await writeFile(testFile, 'const a = 1;\n');

    const protectedRegions = createRegionMap([
      {
        file: testFile,
        startLine: 1,
        endLine: 1,
        scopes: ['all'],
        reason: 'do not delete',
        type: 'line',
      },
    ]);

    const fixes: Fix[] = [
      {
        type: 'dead-files',
        file: testFile,
        description: 'Delete dead file',
        action: 'delete-file',
        safe: true,
        reversible: true,
      },
    ];

    const result = await applyFixes(fixes, {
      fixTypes: ['dead-files'],
      dryRun: false,
      createBackup: false,
      protectedRegions,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.applied).toHaveLength(0);
      expect(result.value.skipped).toHaveLength(1);
      // File should still exist
      expect(await exists(testFile)).toBe(true);
    }
  });

  it('applies non-protected fixes normally when protectedRegions is set', async () => {
    const testFile = path.join(tmpDir, 'mixed.ts');
    await writeFile(
      testFile,
      'import { used } from "mod";\nimport { unused } from "other";\nconst a = 1;\n'
    );

    const protectedRegions = createRegionMap([
      {
        file: testFile,
        startLine: 1,
        endLine: 1,
        scopes: ['entropy'],
        reason: 'keep this import',
        type: 'line',
      },
    ]);

    const fixes: Fix[] = [
      {
        type: 'unused-imports',
        file: testFile,
        description: 'Remove protected import',
        action: 'delete-lines',
        line: 1,
        safe: true,
        reversible: true,
      },
      {
        type: 'unused-imports',
        file: testFile,
        description: 'Remove unprotected import',
        action: 'delete-lines',
        line: 2,
        safe: true,
        reversible: true,
      },
    ];

    const result = await applyFixes(fixes, {
      fixTypes: ['unused-imports'],
      dryRun: false,
      createBackup: false,
      protectedRegions,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.applied).toHaveLength(1);
      expect(result.value.skipped).toHaveLength(1);
      expect(result.value.applied[0]!.description).toBe('Remove unprotected import');
      expect(result.value.skipped[0]!.description).toBe('Remove protected import');
    }
  });
});
