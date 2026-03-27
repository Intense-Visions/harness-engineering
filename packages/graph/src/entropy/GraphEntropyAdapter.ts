import type { GraphStore } from '../store/GraphStore.js';

export interface GraphDriftData {
  readonly staleEdges: ReadonlyArray<{
    docNodeId: string;
    codeNodeId: string;
    edgeType: string;
    codeLastModified?: string | undefined;
    docLastModified?: string | undefined;
  }>;
  readonly missingTargets: readonly string[];
  readonly freshEdges: number;
}

export interface GraphDeadCodeData {
  readonly reachableNodeIds: ReadonlySet<string>;
  readonly unreachableNodes: ReadonlyArray<{
    id: string;
    type: string;
    name: string;
    path?: string | undefined;
  }>;
  readonly entryPoints: readonly string[];
}

export interface GraphSnapshotSummary {
  readonly nodeCount: number;
  readonly edgeCount: number;
  readonly nodesByType: Record<string, number>;
  readonly edgesByType: Record<string, number>;
}

const CODE_NODE_TYPES = ['file', 'function', 'class', 'method', 'interface', 'variable'] as const;

export class GraphEntropyAdapter {
  constructor(private readonly store: GraphStore) {}

  /**
   * Find all `documents` edges and classify them as stale or missing-target.
   *
   * 1. Find all `documents` edges in the graph
   * 2. For each edge, check if the target code node still exists in the store
   * 3. If target doesn't exist -> add to missingTargets
   * 4. If target exists -> compare lastModified timestamps to determine staleness
   */
  computeDriftData(): GraphDriftData {
    const documentsEdges = this.store.getEdges({ type: 'documents' });
    const staleEdges: Array<{
      docNodeId: string;
      codeNodeId: string;
      edgeType: string;
      codeLastModified?: string | undefined;
      docLastModified?: string | undefined;
    }> = [];
    const missingTargets: string[] = [];
    let freshEdges = 0;

    for (const edge of documentsEdges) {
      const codeNode = this.store.getNode(edge.to);
      if (!codeNode) {
        missingTargets.push(edge.to);
        continue;
      }

      const docNode = this.store.getNode(edge.from);
      const codeLastModified = codeNode.lastModified;
      const docLastModified = docNode?.lastModified;

      // If both timestamps exist, compare them
      if (codeLastModified && docLastModified) {
        if (codeLastModified > docLastModified) {
          // Code changed after docs were written — stale
          staleEdges.push({
            docNodeId: edge.from,
            codeNodeId: edge.to,
            edgeType: edge.type,
            codeLastModified,
            docLastModified,
          });
        } else {
          // Docs are up to date
          freshEdges++;
        }
      } else {
        // Missing timestamps — conservatively treat as stale
        staleEdges.push({
          docNodeId: edge.from,
          codeNodeId: edge.to,
          edgeType: edge.type,
          codeLastModified,
          docLastModified,
        });
      }
    }

    return { staleEdges, missingTargets, freshEdges };
  }

  /**
   * BFS from entry points to find reachable vs unreachable code nodes.
   *
   * 1. Entry points: file nodes named `index.ts` or with metadata `entryPoint: true`
   * 2. BFS following `imports` and `calls` edges (outbound only)
   * 3. Unreachable = code nodes NOT in visited set
   */
  computeDeadCodeData(): GraphDeadCodeData {
    const entryPoints = this.findEntryPoints();
    const visited = this.bfsFromEntryPoints(entryPoints);
    const unreachableNodes = this.collectUnreachableNodes(visited);

    return { reachableNodeIds: visited, unreachableNodes, entryPoints };
  }

  private findEntryPoints(): string[] {
    const entryPoints: string[] = [];

    for (const nodeType of CODE_NODE_TYPES) {
      const nodes = this.store.findNodes({ type: nodeType });
      for (const node of nodes) {
        const isIndexFile = nodeType === 'file' && node.name === 'index.ts';
        if (isIndexFile || node.metadata?.entryPoint === true) {
          entryPoints.push(node.id);
        }
      }
    }

    return entryPoints;
  }

  private bfsFromEntryPoints(entryPoints: string[]): Set<string> {
    const visited = new Set<string>();
    const queue: string[] = [...entryPoints];
    let head = 0;

    while (head < queue.length) {
      const nodeId = queue[head++]!;
      if (visited.has(nodeId)) continue;
      visited.add(nodeId);

      this.enqueueOutboundEdges(nodeId, visited, queue);
    }

    return visited;
  }

  private enqueueOutboundEdges(nodeId: string, visited: Set<string>, queue: string[]): void {
    const edgeTypes = ['imports', 'calls', 'contains'] as const;
    for (const edgeType of edgeTypes) {
      const edges = this.store.getEdges({ from: nodeId, type: edgeType });
      for (const edge of edges) {
        if (!visited.has(edge.to)) {
          queue.push(edge.to);
        }
      }
    }
  }

  private collectUnreachableNodes(
    visited: ReadonlySet<string>
  ): Array<{ id: string; type: string; name: string; path?: string | undefined }> {
    const unreachableNodes: Array<{
      id: string;
      type: string;
      name: string;
      path?: string | undefined;
    }> = [];
    for (const nodeType of CODE_NODE_TYPES) {
      const nodes = this.store.findNodes({ type: nodeType });
      for (const node of nodes) {
        if (!visited.has(node.id)) {
          unreachableNodes.push({
            id: node.id,
            type: node.type,
            name: node.name,
            path: node.path,
          });
        }
      }
    }
    return unreachableNodes;
  }

  /**
   * Count all nodes and edges by type.
   */
  computeSnapshotSummary(): GraphSnapshotSummary {
    const nodesByType: Record<string, number> = {};
    const edgesByType: Record<string, number> = {};

    // Count nodes by type dynamically
    const allNodes = this.store.findNodes({});
    for (const node of allNodes) {
      nodesByType[node.type] = (nodesByType[node.type] ?? 0) + 1;
    }

    // Count edges by type dynamically
    const allEdges = this.store.getEdges({});
    for (const edge of allEdges) {
      edgesByType[edge.type] = (edgesByType[edge.type] ?? 0) + 1;
    }

    return {
      nodeCount: this.store.nodeCount,
      edgeCount: this.store.edgeCount,
      nodesByType,
      edgesByType,
    };
  }
}
