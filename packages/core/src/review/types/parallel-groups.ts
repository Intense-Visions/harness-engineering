// --- Parallel grouping types ---

/**
 * A node in a dependency graph consumed by findParallelGroups.
 *
 * Generic enough to represent tasks, review agents, migration steps,
 * build targets, etc. The algorithm only cares about id + dependsOn.
 */
export interface GraphNode {
  /** Stable identifier for the node. Must be unique within the input set. */
  id: string;
  /** IDs of nodes that must complete before this one can run. */
  dependsOn: readonly string[];
}

/**
 * Result of topologically grouping nodes into parallel-executable waves.
 *
 * Every id in `waves[i]` depends exclusively on ids in `waves[0..i-1]`,
 * so the entire wave may be dispatched concurrently.
 */
export interface ParallelGroups {
  /** Sorted waves; each wave is a sorted list of ids runnable in parallel. */
  waves: string[][];
  /** IDs that participate in a cycle and were not scheduled. */
  cyclic: string[];
  /** IDs whose dependsOn points to an id not in the input. */
  orphaned: string[];
}
