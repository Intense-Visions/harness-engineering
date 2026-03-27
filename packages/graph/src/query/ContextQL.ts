import type { GraphStore } from '../store/GraphStore.js';
import type { GraphNode, GraphEdge, ContextQLParams, ContextQLResult } from '../types.js';
import { OBSERVABILITY_TYPES } from '../types.js';

type QueueEntry = { id: string; depth: number };

interface BFSState {
  visited: Set<string>;
  resultNodeMap: Map<string, GraphNode>;
  resultEdges: GraphEdge[];
  edgeSet: Set<string>;
  pruned: number;
  depthReached: number;
}

function edgeKey(e: GraphEdge): string {
  return `${e.from}|${e.to}|${e.type}`;
}

function addEdge(state: BFSState, edge: GraphEdge): void {
  const key = edgeKey(edge);
  if (!state.edgeSet.has(key)) {
    state.edgeSet.add(key);
    state.resultEdges.push(edge);
  }
}

function shouldPruneNode(
  neighbor: GraphNode,
  pruneObservability: boolean,
  params: ContextQLParams
): boolean {
  if (pruneObservability && OBSERVABILITY_TYPES.has(neighbor.type)) return true;
  if (params.includeTypes && !params.includeTypes.includes(neighbor.type)) return true;
  if (params.excludeTypes && params.excludeTypes.includes(neighbor.type)) return true;
  return false;
}

function isEdgeExcluded(edge: GraphEdge, params: ContextQLParams): boolean {
  return !!(params.includeEdges && !params.includeEdges.includes(edge.type));
}

function processNeighbor(
  store: GraphStore,
  edge: GraphEdge,
  neighborId: string,
  nextDepth: number,
  queue: QueueEntry[],
  state: BFSState,
  pruneObservability: boolean,
  params: ContextQLParams
): void {
  if (isEdgeExcluded(edge, params)) return;

  if (state.visited.has(neighborId)) {
    addEdge(state, edge);
    return;
  }

  const neighbor = store.getNode(neighborId);
  if (!neighbor) return;

  state.visited.add(neighborId);

  if (shouldPruneNode(neighbor, pruneObservability, params)) {
    state.pruned++;
    return;
  }

  state.resultNodeMap.set(neighborId, neighbor);
  addEdge(state, edge);
  queue.push({ id: neighborId, depth: nextDepth });
}

function addCrossEdges(store: GraphStore, state: BFSState): void {
  const resultNodeIds = new Set(state.resultNodeMap.keys());
  for (const nodeId of resultNodeIds) {
    const outEdges = store.getEdges({ from: nodeId });
    for (const edge of outEdges) {
      if (resultNodeIds.has(edge.to)) {
        addEdge(state, edge);
      }
    }
  }
}

export class ContextQL {
  private readonly store: GraphStore;

  constructor(store: GraphStore) {
    this.store = store;
  }

  execute(params: ContextQLParams): ContextQLResult {
    const maxDepth = params.maxDepth ?? 3;
    const bidirectional = params.bidirectional ?? false;
    const pruneObservability = params.pruneObservability ?? true;

    const state: BFSState = {
      visited: new Set<string>(),
      resultNodeMap: new Map<string, GraphNode>(),
      resultEdges: [],
      edgeSet: new Set<string>(),
      pruned: 0,
      depthReached: 0,
    };

    const queue: QueueEntry[] = [];
    this.seedRootNodes(params.rootNodeIds, state, queue);
    this.runBFS(queue, maxDepth, bidirectional, pruneObservability, params, state);
    addCrossEdges(this.store, state);

    return {
      nodes: Array.from(state.resultNodeMap.values()),
      edges: state.resultEdges,
      stats: {
        totalTraversed: state.visited.size,
        totalReturned: state.resultNodeMap.size,
        pruned: state.pruned,
        depthReached: state.depthReached,
      },
    };
  }

  private seedRootNodes(
    rootNodeIds: readonly string[],
    state: BFSState,
    queue: QueueEntry[]
  ): void {
    for (const rootId of rootNodeIds) {
      const node = this.store.getNode(rootId);
      if (node) {
        state.visited.add(rootId);
        state.resultNodeMap.set(rootId, node);
        queue.push({ id: rootId, depth: 0 });
      }
    }
  }

  private runBFS(
    queue: QueueEntry[],
    maxDepth: number,
    bidirectional: boolean,
    pruneObservability: boolean,
    params: ContextQLParams,
    state: BFSState
  ): void {
    let head = 0;
    while (head < queue.length) {
      const entry = queue[head++]!;
      const { id: currentId, depth } = entry;

      if (depth >= maxDepth) continue;

      const nextDepth = depth + 1;
      if (nextDepth > state.depthReached) state.depthReached = nextDepth;

      const allEdges = this.gatherEdges(currentId, bidirectional);

      for (const { edge, neighborId } of allEdges) {
        processNeighbor(
          this.store,
          edge,
          neighborId,
          nextDepth,
          queue,
          state,
          pruneObservability,
          params
        );
      }
    }
  }

  private gatherEdges(
    nodeId: string,
    bidirectional: boolean
  ): Array<{ edge: GraphEdge; neighborId: string }> {
    const outEdges = this.store.getEdges({ from: nodeId });
    const inEdges = bidirectional ? this.store.getEdges({ to: nodeId }) : [];
    return [
      ...outEdges.map((e) => ({ edge: e, neighborId: e.to })),
      ...inEdges.map((e) => ({ edge: e, neighborId: e.from })),
    ];
  }
}
