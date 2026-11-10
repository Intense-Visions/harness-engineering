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
function tarjanSCC(graph: DependencyGraph, adjacency: Map<string, string[]>): string[][] {
  const nodeMap = new Map<string, TarjanNode>();
  const stack: string[] = [];
  const sccs: string[][] = [];
  const indexRef = { value: 0 };

  for (const node of graph.nodes) {
    if (!nodeMap.has(node)) {
      strongConnectImpl(node, nodeMap, stack, adjacency, sccs, indexRef);
    }
  }

  return sccs;
}

/**
 * Render an SCC as a real closed import walk (#2390).
 *
 * Tarjan's pop order is only a walk when the SCC is a single elementary cycle;
 * with branching edges consecutive nodes may have no import between them. So
 * instead emit the shortest cycle through the SCC's lowest-sorted node, found
 * by BFS restricted to the SCC with neighbours visited in sorted order. The
 * result is canonical: it starts at the lowest-sorted node and does not depend
 * on node or edge order, which keeps the arch violation id that hashes it stable.
 */
function canonicalCycle(scc: string[], adjacency: Map<string, string[]>): string[] {
  const members = new Set(scc);
  const start = [...scc].sort()[0]!;
  const parent = new Map<string, string>();
  const queue: string[] = [start];
  const sortedNeighbors = (n: string): string[] =>
    [...new Set(adjacency.get(n) ?? [])].filter((m) => members.has(m)).sort();

  for (let head = 0; head < queue.length; head++) {
    const node = queue[head]!;
    for (const next of sortedNeighbors(node)) {
      if (next === start) {
        const path: string[] = [node];
        for (let p = parent.get(node); p !== undefined; p = parent.get(p)) path.push(p);
        path.reverse();
        return [...path, start];
      }
      if (!parent.has(next)) {
        parent.set(next, node);
        queue.push(next);
      }
    }
  }
  // Unreachable for a cyclic SCC: every member reaches every other.
  return [start, start];
}

/**
 * Detect circular dependencies in a dependency graph
 */
export function detectCircularDeps(
  graph: DependencyGraph
): Result<CircularDepsResult, ConstraintError> {
  const adjacency = buildAdjacencyList(graph);
  const sccs = tarjanSCC(graph, adjacency);

  const cycles: CircularDependency[] = sccs.map((scc) => ({
    // A real closed walk that closes on its first node (#2329, #2390). For a
    // branching SCC it is one elementary cycle; `size` still counts every
    // file the SCC entangles.
    cycle: canonicalCycle(scc, adjacency),
    severity: 'error' as const,
    size: scc.length,
  }));

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
