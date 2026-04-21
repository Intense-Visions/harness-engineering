import type { GraphNode, GraphEdge, NodeType, EdgeType } from '../types.js';
import { saveGraph, loadGraph } from './Serializer.js';

export interface NodeQuery {
  readonly type?: NodeType;
  readonly name?: string;
  readonly path?: string;
}

export interface EdgeQuery {
  readonly from?: string;
  readonly to?: string;
  readonly type?: EdgeType;
}

const POISONED_KEYS = new Set(['__proto__', 'constructor', 'prototype']); // harness-ignore SEC-NODE-001: this set IS the defense — used by safeMerge to reject poisoned keys

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function safeMerge(target: any, source: any): void {
  for (const key of Object.keys(source)) {
    if (!POISONED_KEYS.has(key)) {
      target[key] = source[key];
    }
  }
}

function edgeKey(from: string, to: string, type: string): string {
  return `${from}\0${to}\0${type}`;
}

function addToIndex(index: Map<string, GraphEdge[]>, key: string, edge: GraphEdge): void {
  const list = index.get(key);
  if (list) {
    list.push(edge);
  } else {
    index.set(key, [edge]);
  }
}

function removeFromIndex(index: Map<string, GraphEdge[]>, key: string, edge: GraphEdge): void {
  const list = index.get(key);
  if (!list) return;
  const idx = list.indexOf(edge);
  if (idx !== -1) list.splice(idx, 1);
  if (list.length === 0) index.delete(key);
}

/** Filter candidate edges against the remaining query fields and return shallow copies. */
function filterEdges(candidates: Iterable<GraphEdge>, query: EdgeQuery): GraphEdge[] {
  const results: GraphEdge[] = [];
  for (const edge of candidates) {
    if (query.from !== undefined && edge.from !== query.from) continue;
    if (query.to !== undefined && edge.to !== query.to) continue;
    if (query.type !== undefined && edge.type !== query.type) continue;
    results.push({ ...edge });
  }
  return results;
}

export class GraphStore {
  private nodeMap: Map<string, GraphNode> = new Map();
  private edgeMap: Map<string, GraphEdge> = new Map(); // keyed by from\0to\0type
  private edgesByFrom: Map<string, GraphEdge[]> = new Map();
  private edgesByTo: Map<string, GraphEdge[]> = new Map();
  private edgesByType: Map<string, GraphEdge[]> = new Map();

  // --- Node operations ---

  addNode(node: GraphNode): void {
    const existing = this.nodeMap.get(node.id);
    if (existing) {
      safeMerge(existing, node);
    } else {
      this.nodeMap.set(node.id, { ...node });
    }
  }

  batchAddNodes(nodes: readonly GraphNode[]): void {
    for (const node of nodes) {
      this.addNode(node);
    }
  }

  getNode(id: string): GraphNode | null {
    const node = this.nodeMap.get(id);
    if (!node) return null;
    return { ...node };
  }

  findNodes(query: NodeQuery): GraphNode[] {
    const results: GraphNode[] = [];
    for (const node of this.nodeMap.values()) {
      if (query.type !== undefined && node.type !== query.type) continue;
      if (query.name !== undefined && node.name !== query.name) continue;
      if (query.path !== undefined && node.path !== query.path) continue;
      results.push({ ...node });
    }
    return results;
  }

  removeNode(id: string): void {
    this.nodeMap.delete(id);
    // Remove all edges referencing this node
    const fromEdges = this.edgesByFrom.get(id) ?? [];
    const toEdges = this.edgesByTo.get(id) ?? [];
    // Collect unique edges to remove (avoid double-removal for self-edges)
    const edgesToRemove = new Set([...fromEdges, ...toEdges]);
    for (const edge of edgesToRemove) {
      this.removeEdgeInternal(edge);
    }
  }

  // --- Edge operations ---

  addEdge(edge: GraphEdge): void {
    const key = edgeKey(edge.from, edge.to, edge.type);
    const existing = this.edgeMap.get(key);
    if (existing) {
      if (edge.metadata) {
        safeMerge(existing, edge);
      }
      return;
    }
    const copy = { ...edge };
    this.edgeMap.set(key, copy);
    addToIndex(this.edgesByFrom, edge.from, copy);
    addToIndex(this.edgesByTo, edge.to, copy);
    addToIndex(this.edgesByType, edge.type, copy);
  }

  batchAddEdges(edges: readonly GraphEdge[]): void {
    for (const edge of edges) {
      this.addEdge(edge);
    }
  }

  getEdges(query: EdgeQuery): GraphEdge[] {
    // Exact-match shortcut when all three keys are provided
    if (query.from !== undefined && query.to !== undefined && query.type !== undefined) {
      const edge = this.edgeMap.get(edgeKey(query.from, query.to, query.type));
      return edge ? [{ ...edge }] : [];
    }

    const candidates = this.selectCandidates(query);
    return filterEdges(candidates, query);
  }

  /** Pick the most selective index to start from. */
  private selectCandidates(query: EdgeQuery): Iterable<GraphEdge> {
    if (query.from !== undefined) {
      return this.edgesByFrom.get(query.from) ?? [];
    }
    if (query.to !== undefined) {
      return this.edgesByTo.get(query.to) ?? [];
    }
    if (query.type !== undefined) {
      return this.edgesByType.get(query.type) ?? [];
    }
    return this.edgeMap.values();
  }

  getNeighbors(nodeId: string, direction: 'outbound' | 'inbound' | 'both' = 'both'): GraphNode[] {
    const neighborIds = this.collectNeighborIds(nodeId, direction);
    return this.resolveNodes(neighborIds);
  }

  private collectNeighborIds(
    nodeId: string,
    direction: 'outbound' | 'inbound' | 'both'
  ): Set<string> {
    const ids = new Set<string>();
    if (direction === 'outbound' || direction === 'both') {
      for (const edge of this.edgesByFrom.get(nodeId) ?? []) {
        ids.add(edge.to);
      }
    }
    if (direction === 'inbound' || direction === 'both') {
      for (const edge of this.edgesByTo.get(nodeId) ?? []) {
        ids.add(edge.from);
      }
    }
    return ids;
  }

  private resolveNodes(ids: Set<string>): GraphNode[] {
    const results: GraphNode[] = [];
    for (const nid of ids) {
      const node = this.getNode(nid);
      if (node) results.push(node);
    }
    return results;
  }

  // --- Counts ---

  get nodeCount(): number {
    return this.nodeMap.size;
  }

  get edgeCount(): number {
    return this.edgeMap.size;
  }

  // --- Clear ---

  clear(): void {
    this.nodeMap.clear();
    this.edgeMap.clear();
    this.edgesByFrom.clear();
    this.edgesByTo.clear();
    this.edgesByType.clear();
  }

  // --- Persistence ---

  async save(dirPath: string): Promise<void> {
    const allNodes = Array.from(this.nodeMap.values());
    const allEdges = Array.from(this.edgeMap.values());
    await saveGraph(dirPath, allNodes, allEdges);
  }

  async load(dirPath: string): Promise<boolean> {
    const data = await loadGraph(dirPath);
    if (!data) return false;

    this.clear();
    for (const node of data.nodes) {
      this.nodeMap.set(node.id, { ...node });
    }
    for (const edge of data.edges) {
      const copy = { ...edge };
      const key = edgeKey(edge.from, edge.to, edge.type);
      this.edgeMap.set(key, copy);
      addToIndex(this.edgesByFrom, edge.from, copy);
      addToIndex(this.edgesByTo, edge.to, copy);
      addToIndex(this.edgesByType, edge.type, copy);
    }
    return true;
  }

  // --- Internal ---

  private removeEdgeInternal(edge: GraphEdge): void {
    const key = edgeKey(edge.from, edge.to, edge.type);
    this.edgeMap.delete(key);
    removeFromIndex(this.edgesByFrom, edge.from, edge);
    removeFromIndex(this.edgesByTo, edge.to, edge);
    removeFromIndex(this.edgesByType, edge.type, edge);
  }
}
