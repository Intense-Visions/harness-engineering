import type { GraphNode, ParallelGroups } from './types';

interface GraphIndex {
  dependents: Map<string, Set<string>>;
  indegree: Map<string, number>;
  orphaned: Set<string>;
}

/**
 * Build the indexed form of the graph: dependent sets, indegrees, and
 * a list of dependency ids that did not appear in the input.
 */
function indexGraph(nodes: readonly GraphNode[]): GraphIndex {
  const knownIds = new Set(nodes.map((n) => n.id));
  const orphaned = new Set<string>();
  const dependents = new Map<string, Set<string>>();
  const indegree = new Map<string, number>();

  for (const node of nodes) {
    if (!indegree.has(node.id)) indegree.set(node.id, 0);
    if (!dependents.has(node.id)) dependents.set(node.id, new Set());
  }

  for (const node of nodes) {
    for (const dep of node.dependsOn) {
      if (!knownIds.has(dep)) {
        orphaned.add(dep);
        continue;
      }
      addEdge(dependents, indegree, dep, node.id);
    }
  }

  return { dependents, indegree, orphaned };
}

/**
 * Record a (dep -> dependent) edge, deduplicating so repeated entries
 * in `dependsOn` do not inflate the indegree.
 */
function addEdge(
  dependents: Map<string, Set<string>>,
  indegree: Map<string, number>,
  dep: string,
  dependent: string
): void {
  const depSet = dependents.get(dep);
  if (!depSet) return;
  if (depSet.has(dependent)) return;
  depSet.add(dependent);
  indegree.set(dependent, (indegree.get(dependent) ?? 0) + 1);
}

/**
 * Kahn-style BFS: repeatedly collect zero-indegree nodes, decrement
 * indegrees of their dependents, and emit a new wave.
 */
function sweepWaves(index: GraphIndex): { waves: string[][]; scheduled: Set<string> } {
  const { dependents, indegree } = index;
  const waves: string[][] = [];
  const scheduled = new Set<string>();

  let current = [...indegree.entries()]
    .filter(([, deg]) => deg === 0)
    .map(([id]) => id)
    .sort();

  while (current.length > 0) {
    waves.push(current);
    for (const id of current) scheduled.add(id);
    current = advanceWave(current, dependents, indegree);
  }

  return { waves, scheduled };
}

function advanceWave(
  current: readonly string[],
  dependents: Map<string, Set<string>>,
  indegree: Map<string, number>
): string[] {
  const next: string[] = [];
  for (const id of current) {
    for (const dependent of dependents.get(id) ?? []) {
      const remaining = (indegree.get(dependent) ?? 0) - 1;
      indegree.set(dependent, remaining);
      if (remaining === 0) next.push(dependent);
    }
  }
  return next.sort();
}

/**
 * Group dependency-graph nodes into sequential waves that can each be
 * dispatched in parallel.
 *
 * Algorithm: Kahn-style BFS over indegrees.
 *
 * Guarantees:
 *   - Every id in `waves[i]` depends solely on ids in `waves[0..i-1]`.
 *   - Output is deterministic: each wave's ids are sorted lexicographically.
 *   - Cycles are reported via `cyclic` rather than throwing.
 *   - Dependencies pointing at unknown ids are reported via `orphaned`
 *     but do not prevent the referencing node from running.
 *
 * @param nodes - Dependency graph. Order of input does not affect output.
 * @returns waves, plus cyclic and orphaned id lists.
 */
export function findParallelGroups(nodes: readonly GraphNode[]): ParallelGroups {
  const index = indexGraph(nodes);
  const { waves, scheduled } = sweepWaves(index);

  const cyclic = [...index.indegree.keys()].filter((id) => !scheduled.has(id)).sort();

  return {
    waves,
    cyclic,
    orphaned: [...index.orphaned].sort(),
  };
}
