import type { Result } from '../shared/result';
import { Ok, Err } from '../shared/result';
import type { ConstraintError } from '../shared/errors';
import { createError } from '../shared/errors';
import type { LanguageParser, Import } from '../shared/parsers';
import type {
  Layer,
  LayerConfig,
  DependencyEdge,
  DependencyGraph,
  DependencyViolation,
  DependencyValidation,
  GraphDependencyData,
} from './types';
import { resolveFileToLayer } from './layers';
import { findFiles, fileExists, relativePosix } from '../shared/fs-utils';
import { dirname, resolve, extname } from 'path';

export { defineLayer } from './layers';

/**
 * Map of file extensions to language categories for import resolution.
 */
const EXTENSION_BY_LANG: Record<string, string[]> = {
  typescript: ['.ts', '.tsx'],
  javascript: ['.js', '.jsx', '.mjs', '.cjs'],
  python: ['.py'],
  go: ['.go'],
  rust: ['.rs'],
  java: ['.java'],
};

/**
 * Module-resolution conventions where the import specifier writes a runtime
 * extension that does not match the on-disk source extension (issue #279).
 * Two real-world cases:
 *
 * - TS NodeNext / "Bundler": `./foo.js` from a TS file → `foo.ts`/`foo.tsx`.
 * - Babel/webpack JSX: `./Foo.js` from a JS file → `Foo.jsx` via webpack's
 *   `resolve.extensions`.
 *
 * Each JS-style import extension maps to the source extensions to try, in
 * priority order. Existence is checked before the candidate is returned.
 */
const JS_EXT_FALLBACKS: Record<string, string[]> = {
  '.js': ['.ts', '.tsx', '.jsx'],
  '.jsx': ['.tsx'],
  '.mjs': ['.mts'],
  '.cjs': ['.cts'],
};

/**
 * Determine the language category from a file extension.
 */
function detectLangFromExt(ext: string): string | null {
  for (const [lang, exts] of Object.entries(EXTENSION_BY_LANG)) {
    if (exts.includes(ext)) return lang;
  }
  return null;
}

/**
 * Get the appropriate file extensions to try when resolving imports for a given language.
 */
function getExtensionsForLang(lang: string | null): string[] {
  switch (lang) {
    case 'typescript':
      return ['.ts', '.tsx'];
    case 'javascript':
      return ['.js', '.jsx', '.mjs', '.cjs'];
    case 'python':
      return ['.py'];
    case 'go':
      return ['.go'];
    case 'rust':
      return ['.rs'];
    case 'java':
      return ['.java'];
    default:
      return ['.ts', '.tsx', '.js', '.jsx'];
  }
}

/**
 * Resolve an import source to an absolute file path.
 * Language-aware: uses the importing file's language to determine extensions.
 *
 * Async because JS-style imports (`./foo.js`) may resolve to a different
 * on-disk extension under TS NodeNext (`foo.ts`) or Babel/webpack JSX
 * (`Foo.jsx`); each candidate is verified against the filesystem before being
 * returned. Without this, the resolver would either append `.ts` to `.js`
 * (`foo.js.ts`) or hand back a literal `foo.js` that does not exist, silently
 * dropping edges from the dependency graph (issue #279).
 */
async function resolveImportPath(
  importSource: string,
  fromFile: string,
  _rootDir: string
): Promise<string | null> {
  // Skip external packages
  if (!importSource.startsWith('.') && !importSource.startsWith('/')) {
    return null;
  }

  const fromDir = dirname(fromFile);
  const resolved = resolve(fromDir, importSource);
  const sourceExt = extname(resolved);
  const fromLang = detectLangFromExt(extname(fromFile));

  // JS-style import extension that may need to be swapped for the on-disk
  // source extension. Applies whenever the import looks like `./foo.js` etc.,
  // regardless of importing language — both TS NodeNext and Babel JSX projects
  // use this convention. Non-relative paths are rejected above, so this only
  // runs for in-repo imports.
  const fallbacks = JS_EXT_FALLBACKS[sourceExt];
  if (fallbacks) {
    const base = resolved.slice(0, -sourceExt.length);
    for (const ext of fallbacks) {
      const candidate = base + ext;
      if (await fileExists(candidate)) return candidate.replace(/\\/g, '/');
    }
    for (const indexExt of ['.ts', '.tsx', '.jsx']) {
      const indexPath = resolve(base, 'index' + indexExt);
      if (await fileExists(indexPath)) return indexPath.replace(/\\/g, '/');
    }
  }

  // Path already has a supported extension — return as-is.
  const hasKnownExt = Object.values(EXTENSION_BY_LANG)
    .flat()
    .some((e) => resolved.endsWith(e));
  if (hasKnownExt) {
    return resolved.replace(/\\/g, '/');
  }

  // Extensionless: append the importing language's primary extension.
  const extensions = getExtensionsForLang(fromLang);
  return (resolved + extensions[0]!).replace(/\\/g, '/');
}

/**
 * Determine import type from Import data
 */
function getImportType(imp: Import): 'static' | 'dynamic' | 'type-only' {
  if (imp.kind === 'type') return 'type-only';
  return 'static';
}

/**
 * Interface for looking up parsers by file path.
 */
export interface ParserLookup {
  getForFile(filePath: string): LanguageParser | null;
}

/**
 * The error a dependency-graph build fails with when the parser itself is gone,
 * as opposed to one file being unparseable. Extracted so the per-file loop in
 * `buildDependencyGraph` stays within the module's function-length budget.
 */
function graphParserUnavailable(
  parserName: string,
  file: string,
  cause: { message: string; suggestions?: string[] }
): ConstraintError {
  return createError<ConstraintError>(
    'PARSER_UNAVAILABLE',
    `Cannot build a dependency graph: ${cause.message}`,
    { parser: parserName, file },
    cause.suggestions
  );
}

/**
 * A file whose imports have already been extracted.
 *
 * Structurally a subset of the entropy snapshot's `SourceFile`, declared here so
 * `constraints` does not depend on `entropy`.
 */
export interface ParsedFileImports {
  path: string;
  imports: Import[];
}

/**
 * Build a dependency graph from files whose imports are ALREADY extracted.
 *
 * {@link buildDependencyGraph} re-parses every file it is given. A caller that
 * has just parsed the tree for another reason would otherwise parse the whole
 * repository twice. Measured in-process for the coupling collector on this
 * monorepo (1999 files, `process.cpuUsage()`): the parse costs 13.46s of CPU,
 * and the graph step costs 6.09s when it re-parses versus 0.09s from
 * already-parsed files — so skipping the second parse takes the collector from
 * 19.55s to 13.55s, about 31% off its total, on a gate that runs in
 * `.husky/pre-commit` (#2284). Edge construction is identical; only the parse is
 * skipped. Related: #2270, which tracks sharing ONE graph across the dependency
 * collectors.
 */
export async function buildDependencyGraphFromParsed(
  nodes: string[],
  parsed: ParsedFileImports[]
): Promise<DependencyGraph> {
  const edges: DependencyEdge[] = [];
  for (const file of parsed) {
    const normalizedFile = file.path.replace(/\\/g, '/');
    for (const imp of file.imports) {
      const resolvedPath = await resolveImportPath(imp.source, file.path, '');
      if (resolvedPath) {
        edges.push({
          from: normalizedFile,
          to: resolvedPath,
          importType: getImportType(imp),
          line: imp.location.line,
        });
      }
    }
  }
  return { nodes: nodes.map((f) => f.replace(/\\/g, '/')), edges };
}

/**
 * Build a dependency graph from a list of files.
 * Accepts either a single parser or a ParserLookup for multi-language support.
 * Note: buildDependencyGraph is exported as an addition beyond spec for advanced use cases
 */
export async function buildDependencyGraph(
  files: string[],
  parser: LanguageParser | ParserLookup,
  graphDependencyData?: GraphDependencyData
): Promise<Result<DependencyGraph, ConstraintError>> {
  // When graph data is provided, use it directly
  if (graphDependencyData) {
    return Ok({
      nodes: graphDependencyData.nodes,
      edges: graphDependencyData.edges,
    });
  }

  const isLookup = 'getForFile' in parser;
  const parsed: ParsedFileImports[] = [];

  for (const file of files) {
    // Select the appropriate parser for this file
    const fileParser = isLookup
      ? (parser as ParserLookup).getForFile(file)
      : (parser as LanguageParser);

    if (!fileParser) continue;

    const parseResult = await fileParser.parseFile(file);
    if (!parseResult.ok) {
      // Skipping an unparseable file is right for a syntax error in ONE file.
      // It is wrong when the parser itself is gone: then every file is skipped
      // and the caller receives a zero-edge graph, which `detectCircularDeps`
      // reads as "no cycles" and `check-deps` reports as clean. Fail closed on
      // that one code so an absent parser surfaces as an error instead of a
      // pass over nothing (#2267). `TypeScriptParser` is the only parser that
      // emits it, and only when its estree module cannot be resolved — a
      // global condition, never a per-file one.
      if (parseResult.error.code === 'PARSER_UNAVAILABLE') {
        return Err(graphParserUnavailable(fileParser.name, file, parseResult.error));
      }
      // Skip files that can't be parsed
      continue;
    }

    const importsResult = fileParser.extractImports(parseResult.value);
    if (!importsResult.ok) {
      continue;
    }

    parsed.push({ path: file, imports: importsResult.value });
  }

  // Nodes are every file handed in, parsed or not — unchanged from when this
  // loop built them inline.
  return Ok(await buildDependencyGraphFromParsed(files, parsed));
}

/**
 * Check for layer violations in a dependency graph
 */
function checkLayerViolations(
  graph: DependencyGraph,
  layers: Layer[],
  rootDir: string
): DependencyViolation[] {
  const violations: DependencyViolation[] = [];

  for (const edge of graph.edges) {
    const fromRelative = relativePosix(rootDir, edge.from);
    const toRelative = relativePosix(rootDir, edge.to);

    const fromLayer = resolveFileToLayer(fromRelative, layers);
    const toLayer = resolveFileToLayer(toRelative, layers);

    // Skip if either file is not in a defined layer
    if (!fromLayer || !toLayer) continue;

    // Skip if importing from same layer
    if (fromLayer.name === toLayer.name) continue;

    // Check if the import is allowed
    if (!fromLayer.allowedDependencies.includes(toLayer.name)) {
      violations.push({
        file: edge.from,
        imports: edge.to,
        fromLayer: fromLayer.name,
        toLayer: toLayer.name,
        reason: 'WRONG_LAYER',
        line: edge.line,
        suggestion: `Move the dependency to an allowed layer (${fromLayer.allowedDependencies.join(', ') || 'none'}) or update layer rules`,
      });
    }
  }

  return violations;
}

/**
 * Render the abstention reason for an unavailable parser.
 *
 * Keeps the greppable `Parser unavailable` prefix and appends whatever the
 * parser said about itself — its `health()` message when it answered the
 * question, or its error message when the health check itself failed.
 */
function parserUnavailableReason(
  parserName: string,
  healthResult: Awaited<ReturnType<LanguageParser['health']>>
): string {
  const detail = healthResult.ok
    ? healthResult.value.message
    : `health check failed: ${healthResult.error.message}`;
  return detail && detail.length > 0
    ? `Parser unavailable: ${detail}`
    : `Parser unavailable: ${parserName} reported itself unavailable without a reason`;
}

/**
 * Validate dependencies against layer rules
 */
export async function validateDependencies(
  config: LayerConfig
): Promise<Result<DependencyValidation, ConstraintError>> {
  const {
    layers,
    rootDir,
    parser,
    fallbackBehavior = 'error',
    graphDependencyData,
    extraIgnore,
  } = config;

  // When graph data is provided, skip parser health check and file collection
  if (graphDependencyData) {
    const graphResult = await buildDependencyGraph([], parser, graphDependencyData);
    if (!graphResult.ok) {
      return Err(graphResult.error);
    }

    const violations = checkLayerViolations(graphResult.value, layers, rootDir);

    return Ok({
      valid: violations.length === 0,
      violations,
      graph: graphResult.value,
    });
  }

  // Check parser health
  const healthResult = await parser.health();
  if (!healthResult.ok || !healthResult.value.available) {
    // Carry the parser's OWN diagnosis into the abstention. `check-deps` and the
    // `check_dependencies` MCP tool both surface `reason` verbatim, so a bare
    // 'Parser unavailable' told an operator that something was wrong but never
    // what — and the original design intended the health message here (see
    // docs/changes/core-library-implementation/proposal.md). The
    // 'Parser unavailable' prefix is kept because consumers and their tests
    // match on it.
    const reason = parserUnavailableReason(parser.name, healthResult);
    if (fallbackBehavior === 'skip') {
      return Ok({
        valid: true,
        violations: [],
        graph: { nodes: [], edges: [] },
        skipped: true,
        reason,
      });
    }
    if (fallbackBehavior === 'warn') {
      console.warn(`Parser ${parser.name} unavailable, skipping validation: ${reason}`);
      return Ok({
        valid: true,
        violations: [],
        graph: { nodes: [], edges: [] },
        skipped: true,
        reason,
      });
    }
    return Err(
      createError<ConstraintError>(
        'PARSER_UNAVAILABLE',
        `Parser ${parser.name} is not available: ${reason}`,
        { parser: parser.name },
        ['Install required runtime', 'Use different parser', 'Set fallbackBehavior: "skip"']
      )
    );
  }

  // Collect all files from layer patterns
  const allFiles: string[] = [];
  for (const layer of layers) {
    for (const pattern of layer.patterns) {
      const files = await findFiles(pattern, rootDir, extraIgnore ?? []);
      allFiles.push(...files);
    }
  }

  // Deduplicate
  const uniqueFiles = [...new Set(allFiles)];

  // Build dependency graph
  const graphResult = await buildDependencyGraph(uniqueFiles, parser);
  if (!graphResult.ok) {
    return Err(graphResult.error);
  }

  // Check for violations
  const violations = checkLayerViolations(graphResult.value, layers, rootDir);

  return Ok({
    valid: violations.length === 0,
    violations,
    graph: graphResult.value,
  });
}
