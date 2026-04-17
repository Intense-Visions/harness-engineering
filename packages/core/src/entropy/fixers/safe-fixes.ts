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
 * Map export type to its keyword for code generation.
 */
const EXPORT_TYPE_KEYWORD: Record<string, string> = {
  class: 'class',
  function: 'function',
  variable: 'const',
  type: 'type',
  interface: 'interface',
  enum: 'enum',
};

/**
 * Get the declaration keyword for a named export type.
 */
function getExportKeyword(exportType: string): string {
  return EXPORT_TYPE_KEYWORD[exportType] ?? 'enum';
}

/**
 * Get the declaration keyword for a default export type.
 */
function getDefaultExportKeyword(exportType: string): string {
  if (exportType === 'class' || exportType === 'function') return exportType;
  return '';
}

/**
 * Create fixes for dead exports (non-public, zero importers)
 */
function createDeadExportFixes(deadCodeReport: DeadCodeReport): Fix[] {
  return deadCodeReport.deadExports
    .filter((exp) => exp.reason === 'NO_IMPORTERS')
    .map((exp) => {
      const keyword = exp.isDefault
        ? getDefaultExportKeyword(exp.type)
        : getExportKeyword(exp.type);

      return {
        type: 'dead-exports' as FixType,
        file: exp.file,
        description: `Remove export keyword from ${exp.name} (${exp.reason})`,
        action: 'replace' as const,
        oldContent: exp.isDefault
          ? `export default ${keyword} ${exp.name}`
          : `export ${keyword} ${exp.name}`,
        newContent: `${keyword} ${exp.name}`,
        safe: true as const,
        reversible: true,
      };
    });
}

export interface CommentedCodeBlock {
  file: string;
  startLine: number;
  endLine: number;
  content: string;
}

/**
 * Create fixes for commented-out code blocks
 */
export function createCommentedCodeFixes(blocks: CommentedCodeBlock[]): Fix[] {
  return blocks.map((block) => ({
    type: 'commented-code' as FixType,
    file: block.file,
    description: `Remove commented-out code block (lines ${block.startLine}-${block.endLine})`,
    action: 'replace' as const,
    oldContent: block.content,
    newContent: '',
    safe: true as const,
    reversible: true,
  }));
}

export interface OrphanedDep {
  name: string;
  packageJsonPath: string;
  depType: 'dependencies' | 'devDependencies';
}

/**
 * Create fixes for orphaned npm dependencies
 */
export function createOrphanedDepFixes(deps: OrphanedDep[]): Fix[] {
  return deps.map((dep) => ({
    type: 'orphaned-deps' as FixType,
    file: dep.packageJsonPath,
    description: `Remove orphaned dependency: ${dep.name}`,
    action: 'replace' as const,
    safe: true as const,
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

  if (fullConfig.fixTypes.includes('dead-exports')) {
    fixes.push(...createDeadExportFixes(deadCodeReport));
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

/** Apply the delete-file action, optionally creating a backup first. */
async function applyDeleteFile(
  fix: Fix,
  config: FixConfig
): Promise<Result<void, { fix: Fix; error: string }>> {
  if (config.createBackup && config.backupDir) {
    const backupResult = await createBackup(fix.file, config.backupDir);
    if (!backupResult.ok) return Err({ fix, error: backupResult.error.message });
  }
  await unlink(fix.file);
  return Ok(undefined);
}

/** Apply the delete-lines action. */
async function applyDeleteLines(fix: Fix): Promise<void> {
  if (fix.line !== undefined) {
    const content = await readFile(fix.file, 'utf-8');
    const lines = content.split('\n');
    lines.splice(fix.line - 1, 1);
    await writeFile(fix.file, lines.join('\n'));
  }
}

/** Apply the replace action. */
async function applyReplace(fix: Fix): Promise<void> {
  if (fix.oldContent && fix.newContent !== undefined) {
    const content = await readFile(fix.file, 'utf-8');
    await writeFile(fix.file, content.replace(fix.oldContent, fix.newContent));
  }
}

/** Apply the insert action. */
async function applyInsert(fix: Fix): Promise<void> {
  if (fix.line !== undefined && fix.newContent) {
    const content = await readFile(fix.file, 'utf-8');
    const lines = content.split('\n');
    lines.splice(fix.line - 1, 0, fix.newContent);
    await writeFile(fix.file, lines.join('\n'));
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
      case 'delete-file': {
        const result = await applyDeleteFile(fix, config);
        if (!result.ok) return result;
        break;
      }
      case 'delete-lines':
        await applyDeleteLines(fix);
        break;
      case 'replace':
        await applyReplace(fix);
        break;
      case 'insert':
        await applyInsert(fix);
        break;
    }

    return Ok(fix);
  } catch (e) {
    return Err({ fix, error: (e as Error).message });
  }
}

/** Check if a fix targets a protected region and should be skipped. */
function isFixProtected(fix: Fix, config: FixConfig): boolean {
  if (!config.protectedRegions) return false;
  const pr = config.protectedRegions;
  if (fix.action === 'delete-file') return pr.getRegions(fix.file).length > 0;
  if (fix.line !== undefined) return pr.isProtected(fix.file, fix.line, 'entropy');
  return false;
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

    // Skip fixes in protected regions
    if (isFixProtected(fix, fullConfig)) {
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
