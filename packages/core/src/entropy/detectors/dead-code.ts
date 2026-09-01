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
import type { ProtectedRegionMap } from '../../annotations';
import type { AST } from '../../shared/parsers';
import { resolveAliasCandidates } from '../path-aliases';
import { basename, dirname, extname, resolve } from 'path';

/**
 * Build entry points are reachable at build/runtime, not through static `import`
 * edges, so they appear "unreachable" in the import graph when they are not listed
 * in `entropy.entryPoints`. Deleting one breaks the build; the correct remediation
 * is to declare it in `entryPoints` (issue #1325). These conventions let the
 * detector classify such a file as `UNREFERENCED_ENTRY_POINT` instead of a generic
 * dead file, so the fixers offer "configure entry point" rather than "delete".
 *
 * The set is intentionally convention-based (filename/path) and easy to extend; it
 * is not derived from build-tool configs.
 */

/** Build-config files: `*.config.ts|mts|cts|js|mjs|cjs` (vite/vitest/tsup/rollup/…). */
const CONFIG_FILE_RE = /\.config\.(m|c)?[jt]s$/;

/** Framework module roots addressed by tooling, not by a static import. */
const ENTRY_POINT_BASENAMES = new Set([
  'main.ts', // Vue / Angular / NestJS root
  'main.tsx', // React (Vite) root
  'main.mts',
  'app.module.ts', // NestJS root module
]);

/**
 * True when an unreachable file's path matches a build entry-point convention and
 * should be declared in `entryPoints` rather than deleted.
 */
export function isEntryPointConvention(filePath: string): boolean {
  const base = basename(filePath);
  return CONFIG_FILE_RE.test(base) || ENTRY_POINT_BASENAMES.has(base);
}

/**
 * Classify an unreachable file's `DeadFile.reason`: an entry-point-convention file
 * is `UNREFERENCED_ENTRY_POINT` (declare in entryPoints), everything else is a
 * genuine `NO_IMPORTERS` dead file.
 */
function unreachableFileReason(filePath: string): 'NO_IMPORTERS' | 'UNREFERENCED_ENTRY_POINT' {
  return isEntryPointConvention(filePath) ? 'UNREFERENCED_ENTRY_POINT' : 'NO_IMPORTERS';
}

/**
 * Module-resolution conventions where the import specifier writes a runtime
 * extension that does not match the on-disk source extension. Two real-world
 * cases (issue #279):
 *
 * - TS NodeNext / "Bundler": `import "./foo.js"` from a TS source file resolves
 *   to `foo.ts`/`foo.tsx` on disk.
 * - Babel/webpack JSX: `import "./Foo.js"` from a JS source file resolves to
 *   `Foo.jsx` on disk via webpack `resolve.extensions`.
 *
 * Each JS-style import extension maps to the source extensions to try, in
 * priority order. Existence of the candidate is verified before returning.
 */
const JS_EXT_FALLBACKS: Record<string, string[]> = {
  '.js': ['.ts', '.tsx', '.jsx'],
  '.jsx': ['.tsx'],
  '.mjs': ['.mts'],
  '.cjs': ['.cts'],
};

/** Build a Map keyed by file path for O(1) lookups. */
function buildFileIndex(
  snapshot: CodebaseSnapshot
): Map<string, CodebaseSnapshot['files'][number]> {
  const index = new Map<string, CodebaseSnapshot['files'][number]>();
  for (const file of snapshot.files) {
    index.set(file.path, file);
  }
  return index;
}

/**
 * Resolve an already-absolute candidate base path to an on-disk source file,
 * applying the same extension/index conventions used for both relative and
 * tsconfig-alias imports.
 *
 * Handles NodeNext / "Bundler" module resolution where TS source imports with
 * `.js` extensions even though the file on disk is `.ts` (issue #279). When the
 * candidate ends in a JS-style extension, strip and try TS equivalents (and
 * directory-with-index) before falling back to the literal path.
 */
/** First path in `candidates` that exists on disk, else null. */
function firstExisting(candidates: string[], hasFile: (p: string) => boolean): string | null {
  for (const candidate of candidates) {
    if (hasFile(candidate)) return candidate;
  }
  return null;
}

/** Candidate paths for a JS-style import extension that maps to a TS source or directory index. */
function jsExtCandidates(resolved: string, sourceExt: string): string[] {
  const fallbacks = JS_EXT_FALLBACKS[sourceExt];
  if (!fallbacks) return [];
  const base = resolved.slice(0, -sourceExt.length);
  // Direct source-extension swaps, then directory-with-index (`./folder/index.js`
  // → `./folder/index.ts`, `./folder.js` → `./folder/index.ts`).
  return [
    ...fallbacks.map((ext) => base + ext),
    ...['.ts', '.tsx', '.jsx'].map((ext) => resolve(base, 'index' + ext)),
  ];
}

/** Candidate paths for an extensionless import: bare TS files, then directory index. */
function extensionlessCandidates(resolved: string): string[] {
  return [
    ...['.ts', '.tsx'].map((ext) => resolved + ext),
    ...['.ts', '.tsx'].map((ext) => resolve(resolved, 'index' + ext)),
  ];
}

function resolveCandidatePath(resolved: string, hasFile: (p: string) => boolean): string | null {
  const sourceExt = extname(resolved);

  const jsExt = firstExisting(jsExtCandidates(resolved, sourceExt), hasFile);
  if (jsExt) return jsExt;

  if (hasFile(resolved)) return resolved;

  if (!sourceExt) return firstExisting(extensionlessCandidates(resolved), hasFile);

  return null;
}

/**
 * Resolve import source to absolute path.
 *
 * Relative specifiers resolve against the importing file's directory. Non-relative
 * specifiers are matched against the project's tsconfig `paths` aliases (e.g.
 * `@lib/*` → `src/lib/*`); without this a file reached only through an alias
 * import was falsely reported dead (issue #1759). Anything that matches no alias
 * is treated as an external package.
 */
function resolveImportToFile(
  importSource: string,
  fromFile: string,
  snapshot: CodebaseSnapshot,
  fileIndex?: Map<string, CodebaseSnapshot['files'][number]>
): string | null {
  const hasFile = fileIndex
    ? (p: string) => fileIndex.has(p)
    : (p: string) => snapshot.files.some((f) => f.path === p);

  if (importSource.startsWith('.')) {
    const resolved = resolve(dirname(fromFile), importSource);
    return resolveCandidatePath(resolved, hasFile);
  }

  // Non-relative: try tsconfig `paths` aliases before giving up as external.
  const aliases = snapshot.pathAliases;
  if (aliases && aliases.length > 0) {
    for (const candidate of resolveAliasCandidates(importSource, aliases)) {
      const match = resolveCandidatePath(candidate, hasFile);
      if (match) return match;
    }
  }

  return null; // External package
}

function enqueueResolved(
  sources: Array<{ source?: string }>,
  current: string,
  snapshot: CodebaseSnapshot,
  visited: Set<string>,
  queue: string[],
  fileIndex?: Map<string, CodebaseSnapshot['files'][number]>
): void {
  for (const item of sources) {
    if (!item.source) continue;
    const resolved = resolveImportToFile(item.source, current, snapshot, fileIndex);
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
  queue: string[],
  fileIndex?: Map<string, CodebaseSnapshot['files'][number]>
): void {
  reachability.set(current, true);
  const sourceFile = fileIndex
    ? fileIndex.get(current)
    : snapshot.files.find((f) => f.path === current);
  if (!sourceFile) return;

  enqueueResolved(sourceFile.imports, current, snapshot, visited, queue, fileIndex);
  const reExports = sourceFile.exports.filter((e) => e.isReExport);
  enqueueResolved(reExports, current, snapshot, visited, queue, fileIndex);
}

export function buildReachabilityMap(snapshot: CodebaseSnapshot): Map<string, boolean> {
  const fileIndex = buildFileIndex(snapshot);
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
    processReachabilityNode(current, snapshot, reachability, visited, queue, fileIndex);
  }

  return reachability;
}

/**
 * Follow a re-export chain to the defining export.
 *
 * A barrel `export { X } from './origin'` records an `Export` with `isReExport:
 * true` and `source: './origin'` but no import edge, so usage attribution that
 * stops at the barrel credits `barrel:X` instead of the symbol that actually
 * defines `X`. Following the chain (cycle-guarded) lets a consumer importing `X`
 * through the barrel keep the origin export live, and lets the detector treat the
 * barrel re-export itself as NOT-a-use (issue #1479).
 *
 * Renamed re-exports (`export { a as b } from './x'`) lose the local name during
 * parsing, so the chain stops when the same name is absent in the target — no
 * over-crediting, just a conservative miss.
 */
function resolveReExportTarget(
  snapshot: CodebaseSnapshot,
  fileIndex: Map<string, CodebaseSnapshot['files'][number]>,
  file: string,
  exportName: string,
  seen: Set<string>
): { file: string; name: string } {
  const key = `${file}:${exportName}`;
  if (seen.has(key)) return { file, name: exportName };
  seen.add(key);

  const sourceFile = fileIndex.get(file);
  if (!sourceFile) return { file, name: exportName };

  const exp = sourceFile.exports.find(
    (e) => e.name === exportName || (exportName === 'default' && e.type === 'default')
  );
  if (!exp || !exp.isReExport || !exp.source) return { file, name: exportName };

  const target = resolveImportToFile(exp.source, file, snapshot, fileIndex);
  if (!target) return { file, name: exportName };

  return resolveReExportTarget(snapshot, fileIndex, target, exp.name, seen);
}

/** Usage record for one export: its source importers, whether it is re-exported, and whether any test imports it. */
type ExportUsage = { importers: string[]; isReExported: boolean; importedByTest: boolean };

type ImportEdge = { source: string; specifiers: string[] };

/**
 * Mark an export live: a test importer flips `importedByTest`, a real source
 * importer is appended to `importers`.
 */
function markExportUsage(usage: ExportUsage, importer: string, fromTest: boolean): void {
  if (fromTest) {
    usage.importedByTest = true;
  } else {
    usage.importers.push(importer);
  }
}

/** Record one import edge against the usage map (resolving specifiers to exports). */
function recordImportEdge(
  snapshot: CodebaseSnapshot,
  fileIndex: Map<string, CodebaseSnapshot['files'][number]>,
  usageMap: Map<string, ExportUsage>,
  fromFile: string,
  imp: ImportEdge,
  fromTest: boolean
): void {
  const resolvedFile = resolveImportToFile(imp.source, fromFile, snapshot, fileIndex);
  if (!resolvedFile) return;

  const sourceFile = fileIndex.get(resolvedFile);
  if (!sourceFile) return;

  for (const specifier of imp.specifiers) {
    const matchingExport = sourceFile.exports.find(
      (e) => e.name === specifier || (specifier === 'default' && e.type === 'default')
    );
    if (!matchingExport) continue;

    // Follow re-export chains so an import through a barrel credits the symbol
    // that actually defines the export, not the barrel's forwarding entry.
    const target = resolveReExportTarget(
      snapshot,
      fileIndex,
      resolvedFile,
      matchingExport.name,
      new Set()
    );
    const usage = usageMap.get(`${target.file}:${target.name}`);
    if (usage) markExportUsage(usage, fromFile, fromTest);
  }
}

/**
 * Record every import edge of a file. `fromTest` marks edges harvested from
 * test files: a test importer keeps its target export alive but is never itself
 * a classified source file.
 */
function recordImports(
  snapshot: CodebaseSnapshot,
  fileIndex: Map<string, CodebaseSnapshot['files'][number]>,
  usageMap: Map<string, ExportUsage>,
  fromFile: string,
  imports: ImportEdge[],
  fromTest: boolean
): void {
  for (const imp of imports) {
    recordImportEdge(snapshot, fileIndex, usageMap, fromFile, imp, fromTest);
  }
}

/**
 * Build a map of export usage across the codebase.
 * Maps each export to the list of files that import it.
 */
function buildExportUsageMap(snapshot: CodebaseSnapshot): Map<string, ExportUsage> {
  const fileIndex = buildFileIndex(snapshot);
  const usageMap = new Map<string, ExportUsage>();

  // Initialize all exports with empty usage
  for (const file of snapshot.files) {
    for (const exp of file.exports) {
      const key = `${file.path}:${exp.name}`;
      usageMap.set(key, { importers: [], isReExported: exp.isReExport, importedByTest: false });
    }
  }

  // Track which exports are imported by real source files
  for (const file of snapshot.files) {
    recordImports(snapshot, fileIndex, usageMap, file.path, file.imports, false);
  }

  // Track which exports are imported by test files (test-import-blind fix): an
  // export used only by its test is live, not dead.
  for (const testFile of snapshot.testImports ?? []) {
    recordImports(snapshot, fileIndex, usageMap, testFile.path, testFile.imports, true);
  }

  return usageMap;
}

/**
 * Build the set of `<file>:<name>` keys that form the package's public surface:
 * every export reachable by following a barrel `isReExport` entry to the symbol
 * that defines it. A public-surface export legitimately has zero internal callers
 * by design, so it is classified `PUBLIC_API_UNUSED` (advisory) rather than
 * `NO_IMPORTERS` (deletable) when uninvoked (issue #1479).
 */
function buildPublicSurface(snapshot: CodebaseSnapshot): Set<string> {
  const fileIndex = buildFileIndex(snapshot);
  const surface = new Set<string>();

  for (const file of snapshot.files) {
    for (const exp of file.exports) {
      if (!exp.isReExport || !exp.source) continue;
      const target = resolveReExportTarget(snapshot, fileIndex, file.path, exp.name, new Set());
      // A re-export that resolves back to itself (unresolved / renamed / cyclic)
      // names no defining symbol and is not treated as public surface.
      if (target.file === file.path) continue;
      surface.add(`${target.file}:${target.name}`);
    }
  }

  return surface;
}

/** Read the configured public-API allowlist from the (possibly boolean) dead-code config. */
function publicApiAllowlist(snapshot: CodebaseSnapshot): string[] {
  const deadCode = snapshot.config?.analyze?.deadCode;
  if (deadCode && typeof deadCode === 'object' && Array.isArray(deadCode.publicApiAllowlist)) {
    return deadCode.publicApiAllowlist;
  }
  return [];
}

const PUBLIC_ANNOTATION_RE = /@public(Api)?\b/i;

/**
 * True when an intentionally-public export is exempt from the `PUBLIC_API_UNUSED`
 * finding: a `@public` / `@publicApi` annotation in the nearest preceding JSDoc
 * block, or a match in the configured allowlist (`<name>`, `<file>:<name>`, or a
 * file-path substring).
 */
function isPublicApiExempt(
  file: CodebaseSnapshot['files'][number],
  exp: CodebaseSnapshot['files'][number]['exports'][number],
  allowlist: string[]
): boolean {
  const key = `${file.path}:${exp.name}`;
  if (
    allowlist.some(
      (entry) =>
        entry === exp.name || entry === key || (entry.length > 0 && file.path.includes(entry))
    )
  ) {
    return true;
  }

  // Nearest JSDoc block that starts above the export declaration.
  const exportLine = exp.location.line;
  let nearest: { line: number; content: string } | undefined;
  for (const doc of file.jsDocComments) {
    if (doc.line < exportLine && (!nearest || doc.line > nearest.line)) {
      nearest = doc;
    }
  }
  if (nearest && exportLine - nearest.line <= 15 && PUBLIC_ANNOTATION_RE.test(nearest.content)) {
    return true;
  }

  return false;
}

/**
 * Find exports that are never imported anywhere.
 */
function findDeadExports(
  snapshot: CodebaseSnapshot,
  usageMap: Map<string, ExportUsage>,
  reachability: Map<string, boolean>
): DeadExport[] {
  const deadExports: DeadExport[] = [];
  const publicSurface = buildPublicSurface(snapshot);
  const allowlist = publicApiAllowlist(snapshot);

  for (const file of snapshot.files) {
    // Skip entry points - their exports are considered "used" by definition
    if (snapshot.entryPoints.includes(file.path)) continue;

    for (const exp of file.exports) {
      // Skip re-exports as they're just forwarding
      if (exp.isReExport) continue;

      const key = `${file.path}:${exp.name}`;
      const usage = usageMap.get(key);

      // An export imported by any test file is live, not dead. Test files are
      // not classified source files, so a test-only importer keeps the export
      // alive without ever appearing in `importers` / reachability. This also
      // preserves the #1409 guarantee for public-surface exports: a test-only
      // importer is never flagged PUBLIC_API_UNUSED.
      if (usage?.importedByTest) continue;

      if (!usage || usage.importers.length === 0) {
        // No real importers. A public-surface export is exported-but-uninvoked
        // public API (advisory, wire-or-deprecate) unless explicitly exempted;
        // everything else is a deletable NO_IMPORTERS dead export.
        if (publicSurface.has(key)) {
          if (isPublicApiExempt(file, exp, allowlist)) continue;
          deadExports.push({
            file: file.path,
            name: exp.name,
            line: exp.location.line,
            type: 'variable',
            isDefault: exp.type === 'default',
            reason: 'PUBLIC_API_UNUSED',
          });
          continue;
        }
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

function maxLineOfNodeKeys(node: object): number {
  let max = 0;
  for (const key of Object.keys(node)) {
    max = Math.max(max, maxLineOfValue((node as Record<string, unknown>)[key]));
  }
  return max;
}

function findMaxLineInNode(node: unknown): number {
  if (!node || typeof node !== 'object') return 0;

  const n = node as { loc?: { end?: { line?: number } } };
  const locLine = n.loc?.end?.line ?? 0;

  return Math.max(locLine, maxLineOfNodeKeys(node as object));
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
        reason: unreachableFileReason(file.path),
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
  // Simple heuristic: convert AST to string and search for identifier usage.
  // BigInt literals (e.g. `1_000_000n`) appear in the AST as bigint values;
  // JSON.stringify rejects bigint without a replacer, so stringify them to
  // their decimal form — the identifier-name matcher below only cares about
  // string content, not the original literal type.
  const astString = JSON.stringify(ast, (_key, value) =>
    typeof value === 'bigint' ? value.toString() : value
  );

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

function classifyUnreachableNode(
  node: GraphDeadCodeData['unreachableNodes'][number],
  deadFiles: DeadFile[],
  deadExports: DeadExport[]
): void {
  if (FILE_TYPES.has(node.type)) {
    const filePath = node.path || node.id;
    deadFiles.push({
      path: filePath,
      reason: unreachableFileReason(filePath),
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

function computeGraphReportStats(
  data: GraphDeadCodeData,
  deadFiles: DeadFile[],
  deadExports: DeadExport[]
): DeadCodeReport['stats'] {
  const reachableCount =
    data.reachableNodeIds instanceof Set
      ? data.reachableNodeIds.size
      : data.reachableNodeIds.length;
  const fileNodes = data.unreachableNodes.filter((n) => FILE_TYPES.has(n.type));
  const exportNodes = data.unreachableNodes.filter((n) => EXPORT_TYPES.has(n.type));
  const totalFiles = reachableCount + fileNodes.length;
  const totalExports = exportNodes.length + (reachableCount > 0 ? reachableCount : 0);

  return {
    filesAnalyzed: totalFiles,
    entryPointsUsed: [],
    totalExports,
    deadExportCount: deadExports.length,
    totalFiles,
    deadFileCount: deadFiles.length,
    estimatedDeadLines: 0,
  };
}

function buildReportFromGraph(data: GraphDeadCodeData): DeadCodeReport {
  const deadFiles: DeadFile[] = [];
  const deadExports: DeadExport[] = [];

  for (const node of data.unreachableNodes) {
    classifyUnreachableNode(node, deadFiles, deadExports);
  }

  return {
    deadExports,
    deadFiles,
    deadInternals: [],
    unusedImports: [],
    stats: computeGraphReportStats(data, deadFiles, deadExports),
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

/**
 * Filter a dead code report to exclude findings that fall within protected regions.
 * - Dead exports/imports/internals: skipped when their line is protected for 'entropy'.
 * - Dead files: skipped when the file has any protected region (conservative).
 */
function filterProtectedFindings(
  report: DeadCodeReport,
  regions: ProtectedRegionMap
): DeadCodeReport {
  const deadExports = report.deadExports.filter(
    (e) => !regions.isProtected(e.file, e.line, 'entropy')
  );
  const deadFiles = report.deadFiles.filter((f) => regions.getRegions(f.path).length === 0);
  const unusedImports = report.unusedImports.filter(
    (i) => !regions.isProtected(i.file, i.line, 'entropy')
  );
  const deadInternals = report.deadInternals.filter(
    (i) => !regions.isProtected(i.file, i.line, 'entropy')
  );
  const estimatedDeadLines = deadFiles.reduce((acc, f) => acc + f.lineCount, 0);

  return {
    deadExports,
    deadFiles,
    unusedImports,
    deadInternals,
    stats: {
      ...report.stats,
      deadExportCount: deadExports.length,
      deadFileCount: deadFiles.length,
      estimatedDeadLines,
    },
  };
}

/**
 * Compute only the advisory `PUBLIC_API_UNUSED` findings from the AST-accurate
 * snapshot (issue #1479). The production graph path is coarse (file-level,
 * regex-ingested) and cannot attribute per-symbol public-API usage, so these
 * findings are merged into the graph-derived report from the snapshot instead.
 */
function findUninvokedPublicExports(snapshot: CodebaseSnapshot): DeadExport[] {
  const usageMap = buildExportUsageMap(snapshot);
  const reachability = buildReachabilityMap(snapshot);
  return findDeadExports(snapshot, usageMap, reachability).filter(
    (e) => e.reason === 'PUBLIC_API_UNUSED'
  );
}

/**
 * Merge snapshot-derived `PUBLIC_API_UNUSED` findings into a graph-derived report
 * (deduped by `<file>:<name>`) so `detect_entropy` surfaces exported-but-uninvoked
 * public API even on the graph path. No-op when the snapshot has no source files.
 */
function mergeUninvokedPublicExports(
  report: DeadCodeReport,
  snapshot: CodebaseSnapshot
): DeadCodeReport {
  if (!snapshot.files || snapshot.files.length === 0) return report;

  const existing = new Set(report.deadExports.map((e) => `${e.file}:${e.name}`));
  const additions = findUninvokedPublicExports(snapshot).filter(
    (e) => !existing.has(`${e.file}:${e.name}`)
  );
  if (additions.length === 0) return report;

  const deadExports = [...report.deadExports, ...additions];
  return {
    ...report,
    deadExports,
    stats: { ...report.stats, deadExportCount: deadExports.length },
  };
}

export async function detectDeadCode(
  snapshot: CodebaseSnapshot,
  graphDeadCodeData?: GraphDeadCodeData,
  protectedRegions?: ProtectedRegionMap
): Promise<Result<DeadCodeReport, EntropyError>> {
  let report = graphDeadCodeData
    ? mergeUninvokedPublicExports(buildReportFromGraph(graphDeadCodeData), snapshot)
    : buildReportFromSnapshot(snapshot);

  if (protectedRegions) {
    report = filterProtectedFindings(report, protectedRegions);
  }

  return Ok(report);
}
