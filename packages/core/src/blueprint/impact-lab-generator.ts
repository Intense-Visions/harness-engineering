/**
 * Impact Lab data generator for the blueprint.
 *
 * The Impact Lab is the interactive "if I change this file, what breaks?"
 * exercise embedded in a generated blueprint. At view time the browser
 * component re-queries the `get_impact` MCP tool as the reader toggles files;
 * this module produces the seed {@link ImpactData} the blueprint ships with and
 * defines the shape both sides agree on.
 *
 * The impact source is injected (see {@link ImpactAnalyzer}) so the generator
 * stays pure and testable. The runtime blueprint wires a graph-backed analyzer
 * that mirrors the `get_impact` grouping (tests / docs / code / other); when no
 * graph is available the generator degrades gracefully to an empty impact set
 * rather than throwing.
 */

/** Category a downstream-impacted node falls into, matching `get_impact`. */
export type ImpactCategory = 'tests' | 'docs' | 'code' | 'other';

/**
 * A node an {@link ImpactAnalyzer} reports as downstream of the target file.
 * Aligns with the graph node shape returned by the `get_impact` MCP tool.
 */
export interface ImpactSourceNode {
  id: string;
  type: string;
  path?: string;
}

/** A downstream-impacted node, classified into an {@link ImpactCategory}. */
export interface ImpactNode extends ImpactSourceNode {
  category: ImpactCategory;
}

/** Seed data for the blueprint's Impact Lab, keyed to a single source file. */
export interface ImpactData {
  file: string;
  generatedAt: string;
  impacts: ImpactNode[];
  counts: Record<ImpactCategory, number>;
}

/**
 * Pluggable impact source. Given a file (relative to the project root),
 * resolves the set of graph nodes affected by changing it. Mirrors the
 * `get_impact` MCP tool. Injected so the generator has no hard dependency on a
 * loaded graph and remains deterministic under test.
 */
export type ImpactAnalyzer = (file: string) => Promise<ImpactSourceNode[]> | ImpactSourceNode[];

/** Options for {@link generateImpactData}. */
export interface GenerateImpactOptions {
  /**
   * Impact source. Defaults to an analyzer that reports no impacts, so a
   * blueprint generated without a graph still produces valid, empty Impact Lab
   * data instead of failing.
   */
  analyzer?: ImpactAnalyzer;
}

const TEST_TYPES = new Set(['test_result', 'test']);
const DOC_TYPES = new Set(['adr', 'decision', 'document', 'learning']);
const CODE_TYPES = new Set([
  'file',
  'module',
  'class',
  'interface',
  'function',
  'method',
  'variable',
]);

/** Classify a graph node type into an {@link ImpactCategory}. */
export function categorizeImpact(type: string): ImpactCategory {
  if (TEST_TYPES.has(type)) return 'tests';
  if (DOC_TYPES.has(type)) return 'docs';
  if (CODE_TYPES.has(type)) return 'code';
  return 'other';
}

/** An analyzer that reports no downstream impact (graceful no-graph default). */
const emptyAnalyzer: ImpactAnalyzer = () => [];

/**
 * Build the Impact Lab seed data for a single file.
 *
 * Resolves downstream-impacted nodes via the injected analyzer, drops the file
 * itself if the analyzer echoes it, classifies each node into a category, and
 * tallies per-category counts. Deterministic given a deterministic analyzer.
 *
 * @param file    Source file (relative to project root) to analyze.
 * @param options Impact source and related options.
 */
export async function generateImpactData(
  file: string,
  options: GenerateImpactOptions = {}
): Promise<ImpactData> {
  const analyzer = options.analyzer ?? emptyAnalyzer;
  const nodes = await analyzer(file);

  const counts: Record<ImpactCategory, number> = {
    tests: 0,
    docs: 0,
    code: 0,
    other: 0,
  };

  const impacts: ImpactNode[] = [];
  for (const node of nodes) {
    // Skip the target file itself so it never counts as its own impact.
    if (node.path === file || node.id === `file:${file}`) continue;
    const category = categorizeImpact(node.type);
    counts[category] += 1;
    impacts.push({ ...node, category });
  }

  return {
    file,
    generatedAt: new Date().toISOString(),
    impacts,
    counts,
  };
}
