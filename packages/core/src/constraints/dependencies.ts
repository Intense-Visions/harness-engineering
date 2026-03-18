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
import { findFiles } from '../shared/fs-utils';
import { dirname, resolve, relative } from 'path';

export { defineLayer } from './layers';

/**
 * Resolve an import source to an absolute file path
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

  // Add .ts extension if not present
  if (!resolved.endsWith('.ts') && !resolved.endsWith('.tsx')) {
    resolved = resolved + '.ts';
  }

  return resolved;
}

/**
 * Determine import type from Import data
 */
function getImportType(imp: Import): 'static' | 'dynamic' | 'type-only' {
  if (imp.kind === 'type') return 'type-only';
  return 'static';
}

/**
 * Build a dependency graph from a list of files
 * Note: buildDependencyGraph is exported as an addition beyond spec for advanced use cases
 */
export async function buildDependencyGraph(
  files: string[],
  parser: LanguageParser,
  graphDependencyData?: GraphDependencyData
): Promise<Result<DependencyGraph, ConstraintError>> {
  // When graph data is provided, use it directly
  if (graphDependencyData) {
    return Ok({
      nodes: graphDependencyData.nodes,
      edges: graphDependencyData.edges,
    });
  }

  const nodes = [...files];
  const edges: DependencyEdge[] = [];

  for (const file of files) {
    const parseResult = await parser.parseFile(file);
    if (!parseResult.ok) {
      // Skip files that can't be parsed
      continue;
    }

    const importsResult = parser.extractImports(parseResult.value);
    if (!importsResult.ok) {
      continue;
    }

    for (const imp of importsResult.value) {
      const resolvedPath = resolveImportPath(imp.source, file, '');
      if (resolvedPath) {
        edges.push({
          from: file,
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
    const fromRelative = relative(rootDir, edge.from);
    const toRelative = relative(rootDir, edge.to);

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
