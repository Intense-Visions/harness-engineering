import type { GraphStore } from '../store/GraphStore.js';

export interface GraphComplexityHotspot {
  readonly file: string;
  readonly function: string;
  readonly changeFrequency: number;
  readonly complexity: number;
  readonly hotspotScore: number;
}

export interface GraphComplexityResult {
  readonly hotspots: readonly GraphComplexityHotspot[];
  readonly percentile95Score: number;
}

export class GraphComplexityAdapter {
  constructor(private readonly store: GraphStore) {}

  /**
   * Compute complexity hotspots by combining cyclomatic complexity with change frequency.
   *
   * 1. Find all function and method nodes
   * 2. For each, find the containing file and count commit nodes referencing that file
   * 3. Compute hotspotScore = changeFrequency * cyclomaticComplexity
   * 4. Sort descending by score
   * 5. Compute 95th percentile
   */
  computeComplexityHotspots(): GraphComplexityResult {
    const functionNodes = [
      ...this.store.findNodes({ type: 'function' }),
      ...this.store.findNodes({ type: 'method' }),
    ];

    if (functionNodes.length === 0) {
      return { hotspots: [], percentile95Score: 0 };
    }

    // Build a cache of file -> commit count (change frequency)
    const fileChangeFrequency = new Map<string, number>();

    const hotspots: GraphComplexityHotspot[] = [];

    for (const fnNode of functionNodes) {
      const complexity = (fnNode.metadata?.cyclomaticComplexity as number) ?? 1;
      const fileId = this.findContainingFileId(fnNode.id);

      if (!fileId) continue;

      const changeFrequency = this.getChangeFrequency(fileId, fileChangeFrequency);
      const hotspotScore = changeFrequency * complexity;
      const filePath = fnNode.path ?? fileId.replace(/^file:/, '');

      hotspots.push({
        file: filePath,
        function: fnNode.name,
        changeFrequency,
        complexity,
        hotspotScore,
      });
    }

    // Sort descending by hotspot score
    hotspots.sort((a, b) => b.hotspotScore - a.hotspotScore);

    // Compute 95th percentile from sorted scores (ascending order)
    const percentile95Score = this.computePercentile(
      hotspots.map((h) => h.hotspotScore),
      95
    );

    return { hotspots, percentile95Score };
  }

  /**
   * Walk the 'contains' edges to find the file node that contains a given function/method.
   * For methods, walks through the intermediate class node.
   */
  private findContainingFileId(nodeId: string): string | undefined {
    const containsEdges = this.store.getEdges({ to: nodeId, type: 'contains' });
    for (const edge of containsEdges) {
      const sourceNode = this.store.getNode(edge.from);
      if (sourceNode?.type === 'file') return sourceNode.id;
      if (sourceNode?.type === 'class') {
        const fileId = this.findParentFileOfClass(sourceNode.id);
        if (fileId) return fileId;
      }
    }
    return undefined;
  }

  private findParentFileOfClass(classNodeId: string): string | undefined {
    const classContainsEdges = this.store.getEdges({ to: classNodeId, type: 'contains' });
    for (const classEdge of classContainsEdges) {
      const parentNode = this.store.getNode(classEdge.from);
      if (parentNode?.type === 'file') return parentNode.id;
    }
    return undefined;
  }

  private getChangeFrequency(fileId: string, cache: Map<string, number>): number {
    let freq = cache.get(fileId);
    if (freq === undefined) {
      const referencesEdges = this.store.getEdges({ to: fileId, type: 'references' });
      freq = referencesEdges.length;
      cache.set(fileId, freq);
    }
    return freq;
  }

  private computePercentile(descendingScores: number[], percentile: number): number {
    if (descendingScores.length === 0) return 0;

    // Sort ascending for percentile calculation
    const ascending = [...descendingScores].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * ascending.length) - 1;
    return ascending[Math.min(index, ascending.length - 1)]!;
  }
}
