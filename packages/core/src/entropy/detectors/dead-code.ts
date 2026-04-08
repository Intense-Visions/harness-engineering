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

function enqueueResolved(
  sources: Array<{ source?: string }>,
  current: string,
  snapshot: CodebaseSnapshot,
  visited: Set<string>,
  queue: string[]
): void {
  for (const item of sources) {
    if (!item.source) continue;
    const resolved = resolveImportToFile(item.source, current, snapshot);
    if (resolved && !visited.has(resolved)) {
      queue.push(resolved);
    }
  }
}

function processReachabilityNode(
  current: string,
  snapshot: CodebaseSnapshot,
  reachability: Map<string, boolean>,
  visited: Set<string>,
  queue: string[]
): void {
  reachability.set(current, true);
  const sourceFile = snapshot.files.find((f) => f.path === current);
  if (!sourceFile) return;

  enqueueResolved(sourceFile.imports, current, snapshot, visited, queue);
  const reExports = sourceFile.exports.filter((e) => e.isReExport);
  enqueueResolved(reExports, current, snapshot, visited, queue);
}

export function buildReachabilityMap(snapshot: CodebaseSnapshot): Map<string, boolean> {
  const reachability = new Map<string, boolean>();
  for (const file of snapshot.files) {
    reachability.set(file.path, false);
  }

  const queue = [...snapshot.entryPoints];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);
    processReachabilityNode(current, snapshot, reachability, visited, queue);
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
 * Traverse an AST node and find the maximum line number.
 */
function maxLineOfValue(value: unknown): number {
  if (Array.isArray(value)) {
    return value.reduce((m: number, item: unknown) => Math.max(m, findMaxLineInNode(item)), 0);
  }
  if (value && typeof value === 'object') {
    return findMaxLineInNode(value);
  }
  return 0;
}

function findMaxLineInNode(node: unknown): number {
  if (!node || typeof node !== 'object') return 0;

  const n = node as { loc?: { end?: { line?: number } } };
  let maxLine = n.loc?.end?.line ?? 0;

  for (const key of Object.keys(node)) {
    maxLine = Math.max(maxLine, maxLineOfValue((node as Record<string, unknown>)[key]));
  }

  return maxLine;
}

/**
 * Estimate line count from AST.
 * Uses a simple heuristic based on AST body length.
 */
function countLinesFromAST(ast: AST): number {
  if (!ast.body || !Array.isArray(ast.body)) return 1;

  const maxLine = findMaxLineInNode(ast);
  if (maxLine > 0) return maxLine;

  // Fallback: estimate based on body length
  return Math.max(ast.body.length * 3, 1);
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

type GraphDeadCodeData = {
  reachableNodeIds: Set<string> | string[];
  unreachableNodes: Array<{ id: string; type: string; name: string; path?: string }>;
};

const FILE_TYPES = new Set(['file', 'module']);
const EXPORT_TYPES = new Set(['function', 'class', 'method', 'interface', 'variable']);

function buildReportFromGraph(data: GraphDeadCodeData): DeadCodeReport {
  const deadFiles: DeadFile[] = [];
  const deadExports: DeadExport[] = [];

  for (const node of data.unreachableNodes) {
    if (FILE_TYPES.has(node.type)) {
      deadFiles.push({
        path: node.path || node.id,
        reason: 'NO_IMPORTERS',
        exportCount: 0,
        lineCount: 0,
      });
    } else if (EXPORT_TYPES.has(node.type)) {
      const exportType: DeadExport['type'] =
        node.type === 'method' ? 'function' : (node.type as DeadExport['type']);
      deadExports.push({
        file: node.path || node.id,
        name: node.name,
        line: 0,
        type: exportType,
        isDefault: false,
        reason: 'NO_IMPORTERS',
      });
    }
  }

  const reachableCount =
    data.reachableNodeIds instanceof Set
      ? data.reachableNodeIds.size
      : data.reachableNodeIds.length;
  const fileNodes = data.unreachableNodes.filter((n) => FILE_TYPES.has(n.type));
  const exportNodes = data.unreachableNodes.filter((n) => EXPORT_TYPES.has(n.type));
  const totalFiles = reachableCount + fileNodes.length;
  const totalExports = exportNodes.length + (reachableCount > 0 ? reachableCount : 0);

  return {
    deadExports,
    deadFiles,
    deadInternals: [],
    unusedImports: [],
    stats: {
      filesAnalyzed: totalFiles,
      entryPointsUsed: [],
      totalExports,
      deadExportCount: deadExports.length,
      totalFiles,
      deadFileCount: deadFiles.length,
      estimatedDeadLines: 0,
    },
  };
}

function buildReportFromSnapshot(snapshot: CodebaseSnapshot): DeadCodeReport {
  const reachability = buildReachabilityMap(snapshot);
  const usageMap = buildExportUsageMap(snapshot);
  const deadExports = findDeadExports(snapshot, usageMap, reachability);
  const deadFiles = findDeadFiles(snapshot, reachability);
  const unusedImports = findUnusedImports(snapshot);
  const deadInternals = findDeadInternals(snapshot, reachability);
  const totalExports = snapshot.files.reduce(
    (acc, file) => acc + file.exports.filter((e) => !e.isReExport).length,
    0
  );
  const estimatedDeadLines = deadFiles.reduce((acc, file) => acc + file.lineCount, 0);

  return {
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
}

export async function detectDeadCode(
  snapshot: CodebaseSnapshot,
  graphDeadCodeData?: GraphDeadCodeData
): Promise<Result<DeadCodeReport, EntropyError>> {
  const report = graphDeadCodeData
    ? buildReportFromGraph(graphDeadCodeData)
    : buildReportFromSnapshot(snapshot);
  return Ok(report);
}
