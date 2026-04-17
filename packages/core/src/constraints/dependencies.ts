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
import { findFiles, relativePosix } from '../shared/fs-utils';
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
 */
function resolveImportPath(
  importSource: string,
  fromFile: string,
  _rootDir: string
): string | null {
  // Skip external packages
  if (!importSource.startsWith('.') && !importSource.startsWith('/')) {
    return null;
  }

  const fromDir = dirname(fromFile);
  let resolved = resolve(fromDir, importSource);

  // Detect language from the importing file's extension
  const ext = extname(fromFile);
  const lang = detectLangFromExt(ext);
  const extensions = getExtensionsForLang(lang);

  // Check if the resolved path already has a supported extension
  const hasKnownExt = Object.values(EXTENSION_BY_LANG)
    .flat()
    .some((e) => resolved.endsWith(e));

  if (!hasKnownExt) {
    resolved = resolved + extensions[0]!;
  }

  // Normalize to forward slashes for cross-platform consistency
  return resolved.replace(/\\/g, '/');
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

  // Normalize all paths to forward slashes for cross-platform consistency
  const nodes = files.map((f) => f.replace(/\\/g, '/'));
  const edges: DependencyEdge[] = [];

  for (const file of files) {
    const normalizedFile = file.replace(/\\/g, '/');

    // Select the appropriate parser for this file
    const fileParser = isLookup
      ? (parser as ParserLookup).getForFile(file)
      : (parser as LanguageParser);

    if (!fileParser) continue;

    const parseResult = await fileParser.parseFile(file);
    if (!parseResult.ok) {
      // Skip files that can't be parsed
      continue;
    }

    const importsResult = fileParser.extractImports(parseResult.value);
    if (!importsResult.ok) {
      continue;
    }

    for (const imp of importsResult.value) {
      const resolvedPath = resolveImportPath(imp.source, file, '');
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

  return Ok({ nodes, edges });
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
 * Validate dependencies against layer rules
 */
export async function validateDependencies(
  config: LayerConfig
): Promise<Result<DependencyValidation, ConstraintError>> {
  const { layers, rootDir, parser, fallbackBehavior = 'error', graphDependencyData } = config;

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
    if (fallbackBehavior === 'skip') {
      return Ok({
        valid: true,
        violations: [],
        graph: { nodes: [], edges: [] },
        skipped: true,
        reason: 'Parser unavailable',
      });
    }
    if (fallbackBehavior === 'warn') {
      console.warn(`Parser ${parser.name} unavailable, skipping validation`);
      return Ok({
        valid: true,
        violations: [],
        graph: { nodes: [], edges: [] },
        skipped: true,
        reason: 'Parser unavailable',
      });
    }
    return Err(
      createError<ConstraintError>(
        'PARSER_UNAVAILABLE',
        `Parser ${parser.name} is not available`,
        { parser: parser.name },
        ['Install required runtime', 'Use different parser', 'Set fallbackBehavior: "skip"']
      )
    );
  }

  // Collect all files from layer patterns
  const allFiles: string[] = [];
  for (const layer of layers) {
    for (const pattern of layer.patterns) {
      const files = await findFiles(pattern, rootDir);
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
