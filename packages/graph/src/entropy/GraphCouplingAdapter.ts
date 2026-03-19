import type { GraphStore } from '../store/GraphStore.js';

export interface GraphCouplingFileData {
  readonly file: string;
  readonly fanIn: number;
  readonly fanOut: number;
  readonly couplingRatio: number;
  readonly transitiveDepth: number;
}

export interface GraphCouplingResult {
  readonly files: readonly GraphCouplingFileData[];
}

export class GraphCouplingAdapter {
  constructor(private readonly store: GraphStore) {}

  /**
   * Compute coupling data for all file nodes in the graph.
   *
   * For each file:
   * - fanOut: number of outbound 'imports' edges
   * - fanIn: number of inbound 'imports' edges from other files
   * - couplingRatio: fanOut / (fanIn + fanOut), rounded to 2 decimals (0 if both are 0)
   * - transitiveDepth: longest chain of outbound 'imports' edges via BFS
   */
  computeCouplingData(): GraphCouplingResult {
    const fileNodes = this.store.findNodes({ type: 'file' });

    if (fileNodes.length === 0) {
      return { files: [] };
    }

    const files: GraphCouplingFileData[] = [];

    for (const node of fileNodes) {
      const fileId = node.id;
      const filePath = node.path ?? node.name;

      // Count outbound 'imports' edges (fan-out)
      const outEdges = this.store.getEdges({ from: fileId, type: 'imports' });
      const fanOut = outEdges.length;

      // Count inbound 'imports' edges (fan-in)
      const inEdges = this.store.getEdges({ to: fileId, type: 'imports' });
      const fanIn = inEdges.length;

      // Compute coupling ratio
      const total = fanIn + fanOut;
      const couplingRatio = total === 0 ? 0 : Math.round((fanOut / total) * 100) / 100;

      // Compute transitive dependency depth via BFS
      const transitiveDepth = this.computeTransitiveDepth(fileId);

      files.push({ file: filePath, fanIn, fanOut, couplingRatio, transitiveDepth });
    }

    return { files };
  }

  /**
   * BFS from a node following outbound 'imports' edges to find the maximum depth.
   */
  private computeTransitiveDepth(startId: string): number {
    const visited = new Set<string>();
    // Queue entries: [nodeId, depth]
    const queue: Array<[string, number]> = [[startId, 0]];
    visited.add(startId);
    let maxDepth = 0;

    let head = 0;
    while (head < queue.length) {
      const [nodeId, depth] = queue[head++]!;
      if (depth > maxDepth) {
        maxDepth = depth;
      }

      const outEdges = this.store.getEdges({ from: nodeId, type: 'imports' });
      for (const edge of outEdges) {
        if (!visited.has(edge.to)) {
          visited.add(edge.to);
          queue.push([edge.to, depth + 1]);
        }
      }
    }

    return maxDepth;
  }
}
