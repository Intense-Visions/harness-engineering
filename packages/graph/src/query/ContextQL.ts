import type { GraphStore } from '../store/GraphStore.js';
import type { GraphNode, GraphEdge, ContextQLParams, ContextQLResult } from '../types.js';
import { OBSERVABILITY_TYPES } from '../types.js';

export class ContextQL {
  private readonly store: GraphStore;

  constructor(store: GraphStore) {
    this.store = store;
  }

  execute(params: ContextQLParams): ContextQLResult {
    const maxDepth = params.maxDepth ?? 3;
    const bidirectional = params.bidirectional ?? false;
    const pruneObservability = params.pruneObservability ?? true;

    const visited = new Set<string>();
    const resultNodeMap = new Map<string, GraphNode>();
    const resultEdges: GraphEdge[] = [];
    const edgeSet = new Set<string>();
    let pruned = 0;
    let depthReached = 0;

    // Helper to make a unique edge key
    const edgeKey = (e: GraphEdge): string => `${e.from}|${e.to}|${e.type}`;

    // Helper to add an edge to results (deduped)
    const addEdge = (edge: GraphEdge): void => {
      const key = edgeKey(edge);
      if (!edgeSet.has(key)) {
        edgeSet.add(key);
        resultEdges.push(edge);
      }
    };

    // Seed with root nodes
    type QueueEntry = { id: string; depth: number };
    const queue: QueueEntry[] = [];

    for (const rootId of params.rootNodeIds) {
      const node = this.store.getNode(rootId);
      if (node) {
        visited.add(rootId);
        resultNodeMap.set(rootId, node);
        queue.push({ id: rootId, depth: 0 });
      }
    }

    // BFS
    let head = 0;
    while (head < queue.length) {
      const entry = queue[head++]!;
      const { id: currentId, depth } = entry;

      if (depth >= maxDepth) continue;

      const nextDepth = depth + 1;
      if (nextDepth > depthReached) depthReached = nextDepth;

      // Get outbound edges (always)
      const outEdges = this.store.getEdges({ from: currentId });
      // Get inbound edges (only if bidirectional)
      const inEdges = bidirectional ? this.store.getEdges({ to: currentId }) : [];

      const allEdges = [
        ...outEdges.map((e) => ({ edge: e, neighborId: e.to })),
        ...inEdges.map((e) => ({ edge: e, neighborId: e.from })),
      ];

      for (const { edge, neighborId } of allEdges) {
        // Edge type filter
        if (params.includeEdges && !params.includeEdges.includes(edge.type)) {
          continue;
        }

        // If already visited, still add the edge for completeness
        if (visited.has(neighborId)) {
          addEdge(edge);
          continue;
        }

        // Look up the neighbor node
        const neighbor = this.store.getNode(neighborId);
        if (!neighbor) continue;

        visited.add(neighborId);

        // Observability pruning
        if (pruneObservability && OBSERVABILITY_TYPES.has(neighbor.type)) {
          pruned++;
          continue;
        }

        // Type filters (not applied to root nodes — roots are already added)
        if (params.includeTypes && !params.includeTypes.includes(neighbor.type)) {
          pruned++;
          continue;
        }

        if (params.excludeTypes && params.excludeTypes.includes(neighbor.type)) {
          pruned++;
          continue;
        }

        // Node passes all filters
        resultNodeMap.set(neighborId, neighbor);
        addEdge(edge);
        queue.push({ id: neighborId, depth: nextDepth });
      }
    }

    // Find edges between result nodes that we might not have traversed
    // (edges between nodes discovered from different branches at the same depth).
    const resultNodeIds = new Set(resultNodeMap.keys());
    for (const nodeId of resultNodeIds) {
      const outEdges = this.store.getEdges({ from: nodeId });
      for (const edge of outEdges) {
        if (resultNodeIds.has(edge.to)) {
          addEdge(edge);
        }
      }
    }

    // If no nodes were traversed beyond roots, depthReached stays 0
    // which is correct — we only reached depth 0 (roots themselves)

    return {
      nodes: Array.from(resultNodeMap.values()),
      edges: resultEdges,
      stats: {
        totalTraversed: visited.size,
        totalReturned: resultNodeMap.size,
        pruned,
        depthReached,
      },
    };
  }
}
