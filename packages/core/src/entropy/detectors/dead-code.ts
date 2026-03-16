import type { Result } from '../../shared/result';
import { Ok } from '../../shared/result';
import type {
  EntropyError,
  CodebaseSnapshot,
  DeadCodeReport,
  DeadExport,
  DeadFile,
  DeadInternal,
  UnusedImport,
} from '../types';
import type { AST } from '../../shared/parsers';
import { dirname, resolve } from 'path';

/**
 * Resolve import source to absolute path
 */
function resolveImportToFile(
  importSource: string,
  fromFile: string,
  snapshot: CodebaseSnapshot
): string | null {
  if (!importSource.startsWith('.')) {
    return null; // External package
  }

  const fromDir = dirname(fromFile);
  let resolved = resolve(fromDir, importSource);

  // Try with .ts extension
  if (!resolved.endsWith('.ts') && !resolved.endsWith('.tsx')) {
    const withTs = resolved + '.ts';
    if (snapshot.files.some((f) => f.path === withTs)) {
      return withTs;
    }
    const withIndex = resolve(resolved, 'index.ts');
    if (snapshot.files.some((f) => f.path === withIndex)) {
      return withIndex;
    }
  }

  if (snapshot.files.some((f) => f.path === resolved)) {
    return resolved;
  }

  return null;
}

/**
 * Build a map of file reachability from entry points
 */
export function buildReachabilityMap(snapshot: CodebaseSnapshot): Map<string, boolean> {
  const reachability = new Map<string, boolean>();

  // Initialize all files as unreachable
  for (const file of snapshot.files) {
    reachability.set(file.path, false);
  }

  // BFS from entry points
  const queue = [...snapshot.entryPoints];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const current = queue.shift()!;

    if (visited.has(current)) continue;
    visited.add(current);

    // Mark as reachable
    reachability.set(current, true);

    // Find the source file
    const sourceFile = snapshot.files.find((f) => f.path === current);
    if (!sourceFile) continue;

    // Add all imports to queue
    for (const imp of sourceFile.imports) {
      const resolved = resolveImportToFile(imp.source, current, snapshot);
      if (resolved && !visited.has(resolved)) {
        queue.push(resolved);
      }
    }

    // Add re-exports (export { x } from './module') to queue
    for (const exp of sourceFile.exports) {
      if (exp.isReExport && exp.source) {
        const resolved = resolveImportToFile(exp.source, current, snapshot);
        if (resolved && !visited.has(resolved)) {
          queue.push(resolved);
        }
      }
    }
  }

  return reachability;
}

/**
 * Build a map of export usage across the codebase.
 * Maps each export to the list of files that import it.
 */
function buildExportUsageMap(
  snapshot: CodebaseSnapshot
): Map<string, { importers: string[]; isReExported: boolean }> {
  const usageMap = new Map<string, { importers: string[]; isReExported: boolean }>();

  // Initialize all exports with empty usage
  for (const file of snapshot.files) {
    for (const exp of file.exports) {
      const key = `${file.path}:${exp.name}`;
      usageMap.set(key, { importers: [], isReExported: exp.isReExport });
    }
  }

  // Track which exports are imported
  for (const file of snapshot.files) {
    for (const imp of file.imports) {
      const resolvedFile = resolveImportToFile(imp.source, file.path, snapshot);
      if (!resolvedFile) continue;

      // Find the source file to match imports with exports
      const sourceFile = snapshot.files.find((f) => f.path === resolvedFile);
      if (!sourceFile) continue;

      for (const specifier of imp.specifiers) {
        // Match import specifier to export
        const matchingExport = sourceFile.exports.find(
          (e) => e.name === specifier || (specifier === 'default' && e.type === 'default')
        );

        if (matchingExport) {
          const key = `${resolvedFile}:${matchingExport.name}`;
          const usage = usageMap.get(key);
          if (usage) {
            usage.importers.push(file.path);
          }
        }
      }
    }
  }

  return usageMap;
}

/**
 * Find exports that are never imported anywhere.
 */
function findDeadExports(
  snapshot: CodebaseSnapshot,
  usageMap: Map<string, { importers: string[]; isReExported: boolean }>,
  reachability: Map<string, boolean>
): DeadExport[] {
  const deadExports: DeadExport[] = [];

  for (const file of snapshot.files) {
    // Skip entry points - their exports are considered "used" by definition
    if (snapshot.entryPoints.includes(file.path)) continue;

    for (const exp of file.exports) {
      // Skip re-exports as they're just forwarding
      if (exp.isReExport) continue;

      const key = `${file.path}:${exp.name}`;
      const usage = usageMap.get(key);

      if (!usage || usage.importers.length === 0) {
        // This export has no importers
        deadExports.push({
          file: file.path,
          name: exp.name,
          line: exp.location.line,
          type: 'variable', // Default type since Export doesn't track declaration kind
          isDefault: exp.type === 'default',
          reason: 'NO_IMPORTERS',
        });
      } else {
        // Check if all importers are themselves dead/unreachable
        const allImportersDead = usage.importers.every((importer) => !reachability.get(importer));

        if (allImportersDead) {
          deadExports.push({
            file: file.path,
            name: exp.name,
            line: exp.location.line,
            type: 'variable', // Default type since Export doesn't track declaration kind
            isDefault: exp.type === 'default',
            reason: 'IMPORTERS_ALSO_DEAD',
          });
        }
      }
    }
  }

  return deadExports;
}

/**
 * Estimate line count from AST.
 * Uses a simple heuristic based on AST body length.
 */
function countLinesFromAST(ast: AST): number {
  // A simple heuristic: count the number of statements in the body
  // and estimate ~3 lines per statement on average
  if (ast.body && Array.isArray(ast.body)) {
    // Try to find the max line number from the AST
    let maxLine = 0;
    const traverse = (node: unknown): void => {
      if (node && typeof node === 'object') {
        const n = node as { loc?: { end?: { line?: number } } };
        if (n.loc?.end?.line && n.loc.end.line > maxLine) {
          maxLine = n.loc.end.line;
        }
        for (const key of Object.keys(node)) {
          const value = (node as Record<string, unknown>)[key];
          if (Array.isArray(value)) {
            for (const item of value) {
              traverse(item);
            }
          } else if (value && typeof value === 'object') {
            traverse(value);
          }
        }
      }
    };
    traverse(ast);

    if (maxLine > 0) return maxLine;

    // Fallback: estimate based on body length
    return Math.max(ast.body.length * 3, 1);
  }
  return 1;
}

/**
 * Find files that are completely dead (unreachable from entry points).
 */
function findDeadFiles(snapshot: CodebaseSnapshot, reachability: Map<string, boolean>): DeadFile[] {
  const deadFiles: DeadFile[] = [];

  for (const file of snapshot.files) {
    const isReachable = reachability.get(file.path) ?? false;

    if (!isReachable) {
      deadFiles.push({
        path: file.path,
        reason: 'NO_IMPORTERS',
        exportCount: file.exports.filter((e) => !e.isReExport).length,
        lineCount: countLinesFromAST(file.ast),
      });
    }
  }

  return deadFiles;
}

/**
 * Check if an identifier is used in the AST.
 * Uses a simple heuristic: stringify the AST and search for the identifier.
 */
function isIdentifierUsedInAST(
  ast: AST,
  identifier: string,
  skipImportDeclaration: boolean = true
): boolean {
  // Simple heuristic: convert AST to string and search for identifier usage
  const astString = JSON.stringify(ast);

  // Look for identifier references (not just the declaration)
  // The identifier should appear as a value in the AST (not just in the name field of declarations)
  const identifierPattern = new RegExp(`"name"\\s*:\\s*"${identifier}"`, 'g');
  const matches = astString.match(identifierPattern);

  if (!matches) return false;

  // If skipImportDeclaration is true, we need more than 2 occurrences
  // Import specifiers appear TWICE in the AST:
  // 1. ImportSpecifier.imported.name
  // 2. ImportSpecifier.local.name
  // So we need at least 3 occurrences for an import to be "used"
  if (skipImportDeclaration) {
    return matches.length > 2;
  }

  return matches.length > 0;
}

/**
 * Find imports that are declared but never used in the file.
 */
function findUnusedImports(snapshot: CodebaseSnapshot): UnusedImport[] {
  const unusedImports: UnusedImport[] = [];

  for (const file of snapshot.files) {
    for (const imp of file.imports) {
      const unusedSpecifiers: string[] = [];

      for (const specifier of imp.specifiers) {
        // Check if this specifier is used in the file's AST
        // Skip checking the import declaration itself
        if (!isIdentifierUsedInAST(file.ast, specifier, true)) {
          unusedSpecifiers.push(specifier);
        }
      }

      if (unusedSpecifiers.length > 0) {
        unusedImports.push({
          file: file.path,
          line: imp.location.line,
          source: imp.source,
          specifiers: unusedSpecifiers,
          isFullyUnused: unusedSpecifiers.length === imp.specifiers.length,
        });
      }
    }
  }

  return unusedImports;
}

/**
 * Find internal (non-exported) symbols that are never called.
 */
function findDeadInternals(
  snapshot: CodebaseSnapshot,
  _reachability: Map<string, boolean>
): DeadInternal[] {
  const deadInternals: DeadInternal[] = [];

  for (const file of snapshot.files) {
    for (const symbol of file.internalSymbols) {
      // Skip types as they're often used implicitly
      if (symbol.type === 'type') continue;

      // Check if symbol is referenced anywhere in the file
      if (symbol.references === 0 && symbol.calledBy.length === 0) {
        deadInternals.push({
          file: file.path,
          name: symbol.name,
          line: symbol.line,
          type: symbol.type,
          reason: 'NEVER_CALLED',
        });
      }
    }
  }

  return deadInternals;
}

/**
 * Detect dead code in a codebase snapshot.
 * Analyzes exports, files, imports, and internal symbols to find unused code.
 */
// eslint-disable-next-line @typescript-eslint/require-await
export async function detectDeadCode(
  snapshot: CodebaseSnapshot
): Promise<Result<DeadCodeReport, EntropyError>> {
  // Build reachability map from entry points
  const reachability = buildReachabilityMap(snapshot);

  // Build export usage map
  const usageMap = buildExportUsageMap(snapshot);

  // Find dead exports
  const deadExports = findDeadExports(snapshot, usageMap, reachability);

  // Find dead files
  const deadFiles = findDeadFiles(snapshot, reachability);

  // Find unused imports
  const unusedImports = findUnusedImports(snapshot);

  // Find dead internals
  const deadInternals = findDeadInternals(snapshot, reachability);

  // Calculate total exports
  const totalExports = snapshot.files.reduce(
    (acc, file) => acc + file.exports.filter((e) => !e.isReExport).length,
    0
  );

  // Estimate dead lines
  const estimatedDeadLines = deadFiles.reduce((acc, file) => acc + file.lineCount, 0);

  const report: DeadCodeReport = {
    deadExports,
    deadFiles,
    deadInternals,
    unusedImports,
    stats: {
      filesAnalyzed: snapshot.files.length,
      entryPointsUsed: snapshot.entryPoints,
      totalExports,
      deadExportCount: deadExports.length,
      totalFiles: snapshot.files.length,
      deadFileCount: deadFiles.length,
      estimatedDeadLines,
    },
  };

  return Ok(report);
}
