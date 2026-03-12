import type { Result } from '../shared/result';
import { Ok } from '../shared/result';
import type { ConstraintError } from '../shared/errors';
import type { LanguageParser } from '../shared/parsers';
import type {
  DependencyGraph,
  CircularDependency,
  CircularDepsResult,
} from './types';
import { buildDependencyGraph } from './dependencies';

interface TarjanNode {
  index: number;
  lowlink: number;
  onStack: boolean;
}

/**
 * Tarjan's Strongly Connected Components algorithm
 * Returns all SCCs with more than one node (cycles)
 */
function tarjanSCC(graph: DependencyGraph): string[][] {
  const nodeMap = new Map<string, TarjanNode>();
  const stack: string[] = [];
  const sccs: string[][] = [];
  let index = 0;

  // Build adjacency list
  const adjacency = new Map<string, string[]>();
  for (const node of graph.nodes) {
    adjacency.set(node, []);
  }
  for (const edge of graph.edges) {
    const neighbors = adjacency.get(edge.from);
    if (neighbors && graph.nodes.includes(edge.to)) {
      neighbors.push(edge.to);
    }
  }

  function strongConnect(node: string): void {
    nodeMap.set(node, {
      index: index,
      lowlink: index,
      onStack: true,
    });
    index++;
    stack.push(node);

    const neighbors = adjacency.get(node) ?? [];
    for (const neighbor of neighbors) {
      const neighborData = nodeMap.get(neighbor);
      if (!neighborData) {
        // Neighbor not yet visited
        strongConnect(neighbor);
        const nodeData = nodeMap.get(node)!;
        const updatedNeighborData = nodeMap.get(neighbor)!;
        nodeData.lowlink = Math.min(nodeData.lowlink, updatedNeighborData.lowlink);
      } else if (neighborData.onStack) {
        // Neighbor is on stack, so it's in current SCC
        const nodeData = nodeMap.get(node)!;
        nodeData.lowlink = Math.min(nodeData.lowlink, neighborData.index);
      }
    }

    // If node is root of SCC
    const nodeData = nodeMap.get(node)!;
    if (nodeData.lowlink === nodeData.index) {
      const scc: string[] = [];
      let w: string;
      do {
        w = stack.pop()!;
        nodeMap.get(w)!.onStack = false;
        scc.push(w);
      } while (w !== node);

      // Only include SCCs with more than one node (actual cycles)
      // or self-referential cycles
      if (scc.length > 1) {
        sccs.push(scc);
      } else if (scc.length === 1) {
        // Check for self-reference
        const selfNode = scc[0]!;
        const selfNeighbors = adjacency.get(selfNode) ?? [];
        if (selfNeighbors.includes(selfNode)) {
          sccs.push(scc);
        }
      }
    }
  }

  // Run algorithm for all nodes
  for (const node of graph.nodes) {
    if (!nodeMap.has(node)) {
      strongConnect(node);
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

  const cycles: CircularDependency[] = sccs.map(scc => {
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
  parser: LanguageParser
): Promise<Result<CircularDepsResult, ConstraintError>> {
  const graphResult = await buildDependencyGraph(files, parser);
  if (!graphResult.ok) {
    return graphResult as Result<CircularDepsResult, ConstraintError>;
  }

  return detectCircularDeps(graphResult.value);
}
