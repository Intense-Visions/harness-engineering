import type { Result } from '../shared/result';
import { Ok } from '../shared/result';
import type { ConstraintError } from '../shared/errors';
import type { LanguageParser } from '../shared/parsers';
import type {
  DependencyGraph,
  CircularDependency,
  CircularDepsResult,
  GraphDependencyData,
} from './types';
import { buildDependencyGraph } from './dependencies';

interface TarjanNode {
  index: number;
  lowlink: number;
  onStack: boolean;
}

/**
 * Build adjacency list from a dependency graph.
 */
function buildAdjacencyList(graph: DependencyGraph): Map<string, string[]> {
  const adjacency = new Map<string, string[]>();
  const nodeSet = new Set(graph.nodes);
  for (const node of graph.nodes) {
    adjacency.set(node, []);
  }
  for (const edge of graph.edges) {
    const neighbors = adjacency.get(edge.from);
    if (neighbors && nodeSet.has(edge.to)) {
      neighbors.push(edge.to);
    }
  }
  return adjacency;
}

/**
 * Check if an SCC represents an actual cycle (multi-node or self-referential).
 */
function isCyclicSCC(scc: string[], adjacency: Map<string, string[]>): boolean {
  if (scc.length > 1) return true;
  if (scc.length === 1) {
    const selfNode = scc[0]!;
    const selfNeighbors = adjacency.get(selfNode) ?? [];
    return selfNeighbors.includes(selfNode);
  }
  return false;
}

/**
 * Process neighbors of a node during Tarjan's algorithm.
 */
function processNeighbors(
  node: string,
  neighbors: string[],
  nodeMap: Map<string, TarjanNode>,
  stack: string[],
  adjacency: Map<string, string[]>,
  sccs: string[][],
  indexRef: { value: number }
): void {
  for (const neighbor of neighbors) {
    const neighborData = nodeMap.get(neighbor);
    if (!neighborData) {
      strongConnectImpl(neighbor, nodeMap, stack, adjacency, sccs, indexRef);
      const nodeData = nodeMap.get(node)!;
      const updatedNeighborData = nodeMap.get(neighbor)!;
      nodeData.lowlink = Math.min(nodeData.lowlink, updatedNeighborData.lowlink);
    } else if (neighborData.onStack) {
      const nodeData = nodeMap.get(node)!;
      nodeData.lowlink = Math.min(nodeData.lowlink, neighborData.index);
    }
  }
}

/**
 * Core strongConnect implementation for Tarjan's algorithm.
 */
function strongConnectImpl(
  node: string,
  nodeMap: Map<string, TarjanNode>,
  stack: string[],
  adjacency: Map<string, string[]>,
  sccs: string[][],
  indexRef: { value: number }
): void {
  nodeMap.set(node, { index: indexRef.value, lowlink: indexRef.value, onStack: true });
  indexRef.value++;
  stack.push(node);

  processNeighbors(node, adjacency.get(node) ?? [], nodeMap, stack, adjacency, sccs, indexRef);

  const nodeData = nodeMap.get(node)!;
  if (nodeData.lowlink === nodeData.index) {
    const scc: string[] = [];
    let w: string;
    do {
      w = stack.pop()!;
      nodeMap.get(w)!.onStack = false;
      scc.push(w);
    } while (w !== node);

    if (isCyclicSCC(scc, adjacency)) {
      sccs.push(scc);
    }
  }
}

/**
 * Tarjan's Strongly Connected Components algorithm
 * Returns all SCCs with more than one node (cycles)
 */
function tarjanSCC(graph: DependencyGraph): string[][] {
  const nodeMap = new Map<string, TarjanNode>();
  const stack: string[] = [];
  const sccs: string[][] = [];
  const indexRef = { value: 0 };
  const adjacency = buildAdjacencyList(graph);

  for (const node of graph.nodes) {
    if (!nodeMap.has(node)) {
      strongConnectImpl(node, nodeMap, stack, adjacency, sccs, indexRef);
    }
  }

  return sccs;
}

/**
 * Detect circular dependencies in a dependency graph
 */
export function detectCircularDeps(
  graph: DependencyGraph
): Result<CircularDepsResult, ConstraintError> {
  const sccs = tarjanSCC(graph);

  const cycles: CircularDependency[] = sccs.map((scc) => {
    // Add first node at end to show cycle completion
    const reversed = scc.reverse();
    const firstNode = reversed[reversed.length - 1]!;
    const cycle: string[] = [...reversed, firstNode];
    return {
      cycle,
      severity: 'error' as const,
      size: scc.length,
    };
  });

  const largestCycle = cycles.reduce((max, c) => Math.max(max, c.size), 0);

  return Ok({
    hasCycles: cycles.length > 0,
    cycles,
    largestCycle,
  });
}

/**
 * Detect circular dependencies from a list of files
 */
export async function detectCircularDepsInFiles(
  files: string[],
  parser: LanguageParser,
  graphDependencyData?: GraphDependencyData
): Promise<Result<CircularDepsResult, ConstraintError>> {
  // Delegate to buildDependencyGraph — it handles graph data short-circuit internally
  const graphResult = await buildDependencyGraph(files, parser, graphDependencyData);
  if (!graphResult.ok) {
    return graphResult as Result<CircularDepsResult, ConstraintError>;
  }

  return detectCircularDeps(graphResult.value);
}
