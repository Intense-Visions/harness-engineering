import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createFixes, applyFixes } from '../../../src/entropy/fixers/safe-fixes';
import type { DeadCodeReport, Fix } from '../../../src/entropy/types';
import * as fs from 'fs';
import { promisify } from 'util';
import * as path from 'path';
import * as os from 'os';

const writeFile = promisify(fs.writeFile);
const readFile = promisify(fs.readFile);
const mkdir = promisify(fs.mkdir);
const rm = promisify(fs.rm);

describe('dead export fixes', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `dead-export-test-${Date.now()}`);
    await mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('should create fix for dead export with zero importers', () => {
    const report: DeadCodeReport = {
      deadExports: [
        {
          file: '/project/src/utils.ts',
          name: 'unusedHelper',
          line: 10,
          type: 'function',
          isDefault: false,
          reason: 'NO_IMPORTERS',
        },
      ],
      deadFiles: [],
      deadInternals: [],
      unusedImports: [],
      stats: {
        filesAnalyzed: 10,
        entryPointsUsed: [],
        totalExports: 20,
        deadExportCount: 1,
        totalFiles: 10,
        deadFileCount: 0,
        estimatedDeadLines: 5,
      },
    };

    const fixes = createFixes(report, { fixTypes: ['dead-exports'] });
    expect(fixes.length).toBe(1);
    expect(fixes[0].type).toBe('dead-exports');
    expect(fixes[0].action).toBe('replace');
    expect(fixes[0].file).toBe('/project/src/utils.ts');
    expect(fixes[0].safe).toBe(true);
  });

  it('should remove export keyword from function declaration', async () => {
    const testFile = path.join(tempDir, 'utils.ts');
    await writeFile(
      testFile,
      'export function unusedHelper() {\n  return 1;\n}\n\nexport function usedHelper() {\n  return 2;\n}\n'
    );

    const fixes: Fix[] = [
      {
        type: 'dead-exports',
        file: testFile,
        description: 'Remove export keyword from unusedHelper',
        action: 'replace',
        oldContent: 'export function unusedHelper',
        newContent: 'function unusedHelper',
        safe: true,
        reversible: true,
      },
    ];

    const result = await applyFixes(fixes, {
      dryRun: false,
      fixTypes: ['dead-exports'],
      createBackup: false,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.applied.length).toBe(1);
      const content = await readFile(testFile, 'utf-8');
      expect(content).toContain('function unusedHelper');
      expect(content).not.toMatch(/^export function unusedHelper/m);
      expect(content).toContain('export function usedHelper');
    }
  });
});
