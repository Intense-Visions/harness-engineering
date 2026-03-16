import type { Result } from '../../shared/result';
import { Ok, Err } from '../../shared/result';
import type { EntropyError, DeadCodeReport, Fix, FixConfig, FixResult, FixType } from '../types';
import { createEntropyError } from '../../shared/errors';
import * as fs from 'fs';
import { promisify } from 'util';
import { dirname, basename, join } from 'path';

const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);
const unlink = promisify(fs.unlink);
const mkdir = promisify(fs.mkdir);
const copyFile = promisify(fs.copyFile);

const DEFAULT_FIX_CONFIG: FixConfig = {
  dryRun: false,
  fixTypes: ['unused-imports', 'dead-files'],
  createBackup: true,
  backupDir: '.entropy-backups',
};

/**
 * Create fixes for dead files
 */
function createDeadFileFixes(deadCodeReport: DeadCodeReport): Fix[] {
  return deadCodeReport.deadFiles.map((file) => ({
    type: 'dead-files' as FixType,
    file: file.path,
    description: `Delete dead file (${file.reason}): ${basename(file.path)}`,
    action: 'delete-file' as const,
    safe: true,
    reversible: true,
  }));
}

/**
 * Create fixes for unused imports
 */
function createUnusedImportFixes(deadCodeReport: DeadCodeReport): Fix[] {
  return deadCodeReport.unusedImports.map((imp) => ({
    type: 'unused-imports' as FixType,
    file: imp.file,
    description: `Remove unused import: ${imp.specifiers.join(', ')} from ${imp.source}`,
    action: 'delete-lines' as const,
    line: imp.line,
    safe: true,
    reversible: true,
  }));
}

/**
 * Create fixes from dead code report
 */
export function createFixes(deadCodeReport: DeadCodeReport, config?: Partial<FixConfig>): Fix[] {
  const fullConfig = { ...DEFAULT_FIX_CONFIG, ...config };
  const fixes: Fix[] = [];

  if (fullConfig.fixTypes.includes('dead-files')) {
    fixes.push(...createDeadFileFixes(deadCodeReport));
  }

  if (fullConfig.fixTypes.includes('unused-imports')) {
    fixes.push(...createUnusedImportFixes(deadCodeReport));
  }

  return fixes;
}

/**
 * Preview what a fix would do
 */
export function previewFix(fix: Fix): string {
  switch (fix.action) {
    case 'delete-file':
      return `Would delete file: ${fix.file}`;
    case 'delete-lines':
      return `Would delete line ${fix.line} in ${fix.file}: ${fix.description}`;
    case 'replace':
      return `Would replace in ${fix.file}:\n  - ${fix.oldContent}\n  + ${fix.newContent}`;
    case 'insert':
      return `Would insert at line ${fix.line} in ${fix.file}:\n  + ${fix.newContent}`;
    default:
      return `Would apply fix: ${fix.description}`;
  }
}

/**
 * Create backup of a file
 */
async function createBackup(
  filePath: string,
  backupDir: string
): Promise<Result<string, EntropyError>> {
  const backupPath = join(backupDir, `${Date.now()}-${basename(filePath)}`);

  try {
    await mkdir(dirname(backupPath), { recursive: true });
    await copyFile(filePath, backupPath);
    return Ok(backupPath);
  } catch (e) {
    return Err(
      createEntropyError(
        'BACKUP_FAILED',
        `Failed to create backup: ${filePath}`,
        { file: filePath, originalError: e as Error },
        ['Check file permissions', 'Ensure backup directory is writable']
      )
    );
  }
}

/**
 * Apply a single fix
 */
async function applySingleFix(
  fix: Fix,
  config: FixConfig
): Promise<Result<Fix, { fix: Fix; error: string }>> {
  if (config.dryRun) {
    return Ok(fix);
  }

  try {
    switch (fix.action) {
      case 'delete-file':
        if (config.createBackup && config.backupDir) {
          const backupResult = await createBackup(fix.file, config.backupDir);
          if (!backupResult.ok) {
            return Err({ fix, error: backupResult.error.message });
          }
        }
        await unlink(fix.file);
        break;

      case 'delete-lines':
        if (fix.line !== undefined) {
          const content = await readFile(fix.file, 'utf-8');
          const lines = content.split('\n');
          lines.splice(fix.line - 1, 1); // Remove line (1-indexed)
          await writeFile(fix.file, lines.join('\n'));
        }
        break;

      case 'replace':
        if (fix.oldContent && fix.newContent !== undefined) {
          const content = await readFile(fix.file, 'utf-8');
          const newContent = content.replace(fix.oldContent, fix.newContent);
          await writeFile(fix.file, newContent);
        }
        break;

      case 'insert':
        if (fix.line !== undefined && fix.newContent) {
          const content = await readFile(fix.file, 'utf-8');
          const lines = content.split('\n');
          lines.splice(fix.line - 1, 0, fix.newContent);
          await writeFile(fix.file, lines.join('\n'));
        }
        break;
    }

    return Ok(fix);
  } catch (e) {
    return Err({ fix, error: (e as Error).message });
  }
}

/**
 * Apply fixes to codebase
 */
export async function applyFixes(
  fixes: Fix[],
  config?: Partial<FixConfig>
): Promise<Result<FixResult, EntropyError>> {
  const fullConfig = { ...DEFAULT_FIX_CONFIG, ...config };

  const applied: Fix[] = [];
  const skipped: Fix[] = [];
  const errors: { fix: Fix; error: string }[] = [];

  let filesModified = 0;
  let filesDeleted = 0;
  let linesRemoved = 0;

  for (const fix of fixes) {
    // Filter by fixTypes
    if (!fullConfig.fixTypes.includes(fix.type)) {
      skipped.push(fix);
      continue;
    }

    const result = await applySingleFix(fix, fullConfig);

    if (result.ok) {
      applied.push(result.value);

      // Update stats
      if (fix.action === 'delete-file') {
        filesDeleted++;
      } else {
        filesModified++;
      }

      if (fix.action === 'delete-lines') {
        linesRemoved++;
      }
    } else {
      errors.push(result.error);
    }
  }

  return Ok({
    applied,
    skipped,
    errors,
    stats: {
      filesModified,
      filesDeleted,
      linesRemoved,
    },
  });
}
