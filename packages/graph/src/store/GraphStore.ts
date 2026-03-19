import loki, { type Collection } from 'lokijs';
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

type LokiDoc<T> = T & { $loki: number; meta: Record<string, unknown> };

export class GraphStore {
  private readonly db: loki;
  private nodes: Collection<GraphNode>;
  private edges: Collection<GraphEdge>;

  constructor() {
    this.db = new loki('graph.db');

    this.nodes = this.db.addCollection<GraphNode>('nodes', {
      unique: ['id'],
      indices: ['type', 'name'],
    });

    this.edges = this.db.addCollection<GraphEdge>('edges', {
      indices: ['from', 'to', 'type'],
    });
  }

  // --- Node operations ---

  addNode(node: GraphNode): void {
    const existing = this.nodes.by('id', node.id);
    if (existing) {
      // Update: assign all properties from node onto the existing doc
      Object.assign(existing, node);
      this.nodes.update(existing);
    } else {
      this.nodes.insert({ ...node });
    }
  }

  batchAddNodes(nodes: readonly GraphNode[]): void {
    for (const node of nodes) {
      this.addNode(node);
    }
  }

  getNode(id: string): GraphNode | null {
    const doc = this.nodes.by('id', id);
    if (!doc) return null;
    return this.stripLokiMeta(doc);
  }

  findNodes(query: NodeQuery): GraphNode[] {
    const lokiQuery: Record<string, unknown> = {};
    if (query.type !== undefined) lokiQuery['type'] = query.type;
    if (query.name !== undefined) lokiQuery['name'] = query.name;
    if (query.path !== undefined) lokiQuery['path'] = query.path;

    return this.nodes.find(lokiQuery).map((doc) => this.stripLokiMeta(doc));
  }

  removeNode(id: string): void {
    const doc = this.nodes.by('id', id);
    if (doc) {
      this.nodes.remove(doc);
    }
    // Remove all edges referencing this node
    const edgesToRemove = this.edges.find({
      $or: [{ from: id }, { to: id }],
    });
    for (const edge of edgesToRemove) {
      this.edges.remove(edge);
    }
  }

  // --- Edge operations ---

  addEdge(edge: GraphEdge): void {
    // Check for existing edge with same from/to/type to prevent duplicates
    const existing = this.edges.findOne({
      from: edge.from,
      to: edge.to,
      type: edge.type,
    });
    if (existing) {
      // Update metadata if provided
      if (edge.metadata) {
        Object.assign(existing, edge);
        this.edges.update(existing);
      }
      return;
    }
    this.edges.insert({ ...edge });
  }

  batchAddEdges(edges: readonly GraphEdge[]): void {
    for (const edge of edges) {
      this.addEdge(edge);
    }
  }

  getEdges(query: EdgeQuery): GraphEdge[] {
    const lokiQuery: Record<string, unknown> = {};
    if (query.from !== undefined) lokiQuery['from'] = query.from;
    if (query.to !== undefined) lokiQuery['to'] = query.to;
    if (query.type !== undefined) lokiQuery['type'] = query.type;

    return this.edges.find(lokiQuery).map((doc) => this.stripLokiMeta(doc));
  }

  getNeighbors(nodeId: string, direction: 'outbound' | 'inbound' | 'both' = 'both'): GraphNode[] {
    const neighborIds = new Set<string>();

    if (direction === 'outbound' || direction === 'both') {
      const outEdges = this.edges.find({ from: nodeId });
      for (const edge of outEdges) {
        neighborIds.add(edge.to);
      }
    }

    if (direction === 'inbound' || direction === 'both') {
      const inEdges = this.edges.find({ to: nodeId });
      for (const edge of inEdges) {
        neighborIds.add(edge.from);
      }
    }

    const results: GraphNode[] = [];
    for (const nid of neighborIds) {
      const node = this.getNode(nid);
      if (node) results.push(node);
    }
    return results;
  }

  // --- Counts ---

  get nodeCount(): number {
    return this.nodes.count();
  }

  get edgeCount(): number {
    return this.edges.count();
  }

  // --- Clear ---

  clear(): void {
    this.nodes.clear();
    this.edges.clear();
  }

  // --- Persistence ---

  async save(dirPath: string): Promise<void> {
    const allNodes = this.nodes.find().map((doc) => this.stripLokiMeta(doc));
    const allEdges = this.edges.find().map((doc) => this.stripLokiMeta(doc));
    await saveGraph(dirPath, allNodes, allEdges);
  }

  async load(dirPath: string): Promise<boolean> {
    const data = await loadGraph(dirPath);
    if (!data) return false;

    this.clear();
    for (const node of data.nodes) {
      this.nodes.insert({ ...node });
    }
    for (const edge of data.edges) {
      this.edges.insert({ ...edge });
    }
    return true;
  }

  // --- Internal ---

  private stripLokiMeta<T>(doc: T): T {
    const { $loki: _, meta: _meta, ...rest } = doc as LokiDoc<T>;
    return rest as T;
  }
}
