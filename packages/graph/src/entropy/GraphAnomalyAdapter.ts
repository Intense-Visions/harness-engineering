import type { GraphStore } from '../store/GraphStore.js';
import { GraphCouplingAdapter } from './GraphCouplingAdapter.js';
import type { GraphCouplingResult } from './GraphCouplingAdapter.js';
import { GraphComplexityAdapter } from './GraphComplexityAdapter.js';
import type { GraphComplexityResult } from './GraphComplexityAdapter.js';

export interface AnomalyDetectionOptions {
  threshold?: number;
  metrics?: string[];
}

export interface StatisticalOutlier {
  nodeId: string;
  nodeName: string;
  nodePath?: string | undefined;
  nodeType: string;
  metric: string;
  value: number;
  zScore: number;
  mean: number;
  stdDev: number;
}

export interface ArticulationPoint {
  nodeId: string;
  nodeName: string;
  nodePath?: string | undefined;
  componentsIfRemoved: number;
  dependentCount: number;
}

export interface AnomalyReport {
  statisticalOutliers: StatisticalOutlier[];
  articulationPoints: ArticulationPoint[];
  overlapping: string[];
  summary: {
    totalNodesAnalyzed: number;
    outlierCount: number;
    articulationPointCount: number;
    overlapCount: number;
    metricsAnalyzed: string[];
    warnings: string[];
    threshold: number;
  };
}

const DEFAULT_THRESHOLD = 2.0;
const DEFAULT_METRICS = [
  'cyclomaticComplexity',
  'fanIn',
  'fanOut',
  'hotspotScore',
  'transitiveDepth',
] as const;

const RECOGNIZED_METRICS = new Set<string>(DEFAULT_METRICS);

export class GraphAnomalyAdapter {
  constructor(private readonly store: GraphStore) {}

  detect(options?: AnomalyDetectionOptions): AnomalyReport {
    const threshold =
      options?.threshold != null && options.threshold > 0 ? options.threshold : DEFAULT_THRESHOLD;

    const requestedMetrics = options?.metrics ?? [...DEFAULT_METRICS];
    const warnings: string[] = [];
    const metricsToAnalyze: string[] = [];

    for (const m of requestedMetrics) {
      if (RECOGNIZED_METRICS.has(m)) {
        metricsToAnalyze.push(m);
      } else {
        warnings.push(m);
      }
    }

    const allOutliers: StatisticalOutlier[] = [];
    const analyzedNodeIds = new Set<string>();

    // Pre-compute adapter results once to avoid redundant computation
    const couplingMetrics = ['fanIn', 'fanOut', 'transitiveDepth'];
    const needsCoupling = metricsToAnalyze.some((m) => couplingMetrics.includes(m));
    const needsComplexity = metricsToAnalyze.includes('hotspotScore');

    const cachedCouplingData = needsCoupling
      ? new GraphCouplingAdapter(this.store).computeCouplingData()
      : undefined;
    const cachedHotspotData = needsComplexity
      ? new GraphComplexityAdapter(this.store).computeComplexityHotspots()
      : undefined;

    for (const metric of metricsToAnalyze) {
      const entries = this.collectMetricValues(metric, cachedCouplingData, cachedHotspotData);
      for (const e of entries) {
        analyzedNodeIds.add(e.nodeId);
      }
      const outliers = this.computeZScoreOutliers(entries, metric, threshold);
      allOutliers.push(...outliers);
    }

    // Sort by zScore descending
    allOutliers.sort((a, b) => b.zScore - a.zScore);

    const articulationPoints = this.findArticulationPoints();

    // Compute overlap: nodes that are both statistical outliers and articulation points
    const outlierNodeIds = new Set(allOutliers.map((o) => o.nodeId));
    const apNodeIds = new Set(articulationPoints.map((ap) => ap.nodeId));
    const overlapping = [...outlierNodeIds].filter((id) => apNodeIds.has(id));

    return {
      statisticalOutliers: allOutliers,
      articulationPoints,
      overlapping,
      summary: {
        totalNodesAnalyzed: analyzedNodeIds.size,
        outlierCount: allOutliers.length,
        articulationPointCount: articulationPoints.length,
        overlapCount: overlapping.length,
        metricsAnalyzed: metricsToAnalyze,
        warnings,
        threshold,
      },
    };
  }

  private collectMetricValues(
    metric: string,
    cachedCouplingData?: GraphCouplingResult,
    cachedHotspotData?: GraphComplexityResult
  ): Array<{
    nodeId: string;
    nodeName: string;
    nodePath?: string | undefined;
    nodeType: string;
    value: number;
  }> {
    const entries: Array<{
      nodeId: string;
      nodeName: string;
      nodePath?: string | undefined;
      nodeType: string;
      value: number;
    }> = [];

    if (metric === 'cyclomaticComplexity') {
      const functionNodes = [
        ...this.store.findNodes({ type: 'function' }),
        ...this.store.findNodes({ type: 'method' }),
      ];
      for (const node of functionNodes) {
        const cc = node.metadata?.cyclomaticComplexity;
        if (typeof cc === 'number') {
          entries.push({
            nodeId: node.id,
            nodeName: node.name,
            nodePath: node.path,
            nodeType: node.type,
            value: cc,
          });
        }
      }
    } else if (metric === 'fanIn' || metric === 'fanOut' || metric === 'transitiveDepth') {
      const couplingData =
        cachedCouplingData ?? new GraphCouplingAdapter(this.store).computeCouplingData();
      const fileNodes = this.store.findNodes({ type: 'file' });
      for (const fileData of couplingData.files) {
        const fileNode = fileNodes.find((n) => (n.path ?? n.name) === fileData.file);
        if (!fileNode) continue;
        entries.push({
          nodeId: fileNode.id,
          nodeName: fileNode.name,
          nodePath: fileNode.path,
          nodeType: 'file',
          value: fileData[metric],
        });
      }
    } else if (metric === 'hotspotScore') {
      const hotspots =
        cachedHotspotData ?? new GraphComplexityAdapter(this.store).computeComplexityHotspots();
      const functionNodes = [
        ...this.store.findNodes({ type: 'function' }),
        ...this.store.findNodes({ type: 'method' }),
      ];
      for (const h of hotspots.hotspots) {
        const fnNode = functionNodes.find(
          (n) => n.name === h.function && (n.path ?? '') === (h.file ?? '')
        );
        if (!fnNode) continue;
        entries.push({
          nodeId: fnNode.id,
          nodeName: fnNode.name,
          nodePath: fnNode.path,
          nodeType: fnNode.type,
          value: h.hotspotScore,
        });
      }
    }

    return entries;
  }

  private computeZScoreOutliers(
    entries: Array<{
      nodeId: string;
      nodeName: string;
      nodePath?: string | undefined;
      nodeType: string;
      value: number;
    }>,
    metric: string,
    threshold: number
  ): StatisticalOutlier[] {
    if (entries.length === 0) return [];

    const values = entries.map((e) => e.value);
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
    const stdDev = Math.sqrt(variance);

    if (stdDev === 0) return [];

    const outliers: StatisticalOutlier[] = [];
    for (const entry of entries) {
      const zScore = Math.abs(entry.value - mean) / stdDev;
      if (zScore > threshold) {
        outliers.push({
          nodeId: entry.nodeId,
          nodeName: entry.nodeName,
          nodePath: entry.nodePath,
          nodeType: entry.nodeType,
          metric,
          value: entry.value,
          zScore,
          mean,
          stdDev,
        });
      }
    }

    return outliers;
  }

  private findArticulationPoints(): ArticulationPoint[] {
    // Build undirected adjacency list from imports edges (file nodes only)
    const fileNodes = this.store.findNodes({ type: 'file' });
    if (fileNodes.length === 0) return [];

    const nodeMap = new Map<string, { name: string; path?: string | undefined }>();
    const adj = new Map<string, Set<string>>();

    for (const node of fileNodes) {
      nodeMap.set(node.id, { name: node.name, path: node.path });
      adj.set(node.id, new Set());
    }

    // Build undirected adjacency from imports edges
    const importEdges = this.store.getEdges({ type: 'imports' });
    for (const edge of importEdges) {
      if (adj.has(edge.from) && adj.has(edge.to)) {
        adj.get(edge.from)!.add(edge.to);
        adj.get(edge.to)!.add(edge.from);
      }
    }

    // Tarjan's algorithm for articulation points
    const disc = new Map<string, number>();
    const low = new Map<string, number>();
    const parent = new Map<string, string | null>();
    const apSet = new Set<string>();
    let timer = 0;

    const dfs = (u: string): void => {
      disc.set(u, timer);
      low.set(u, timer);
      timer++;
      let children = 0;

      for (const v of adj.get(u)!) {
        if (!disc.has(v)) {
          children++;
          parent.set(v, u);
          dfs(v);

          low.set(u, Math.min(low.get(u)!, low.get(v)!));

          // u is AP if:
          // 1) u is root and has 2+ children
          if (parent.get(u) === null && children > 1) {
            apSet.add(u);
          }
          // 2) u is not root and low[v] >= disc[u]
          if (parent.get(u) !== null && low.get(v)! >= disc.get(u)!) {
            apSet.add(u);
          }
        } else if (v !== parent.get(u)) {
          low.set(u, Math.min(low.get(u)!, disc.get(v)!));
        }
      }
    };

    // Handle disconnected components
    for (const nodeId of adj.keys()) {
      if (!disc.has(nodeId)) {
        parent.set(nodeId, null);
        dfs(nodeId);
      }
    }

    // For each AP, compute componentsIfRemoved and dependentCount
    const results: ArticulationPoint[] = [];

    for (const apId of apSet) {
      const { components, dependentCount } = this.computeRemovalImpact(apId, adj);
      const info = nodeMap.get(apId)!;
      results.push({
        nodeId: apId,
        nodeName: info.name,
        nodePath: info.path,
        componentsIfRemoved: components,
        dependentCount,
      });
    }

    // Sort by dependentCount descending
    results.sort((a, b) => b.dependentCount - a.dependentCount);

    return results;
  }

  private computeRemovalImpact(
    removedId: string,
    adj: Map<string, Set<string>>
  ): { components: number; dependentCount: number } {
    // BFS on graph with removedId deleted, count connected components
    const visited = new Set<string>();
    visited.add(removedId); // treat as removed

    const componentSizes: number[] = [];

    for (const nodeId of adj.keys()) {
      if (visited.has(nodeId)) continue;

      // BFS from this node
      const queue: string[] = [nodeId];
      visited.add(nodeId);
      let size = 0;
      let head = 0;

      while (head < queue.length) {
        const current = queue[head++]!;
        size++;
        for (const neighbor of adj.get(current)!) {
          if (!visited.has(neighbor)) {
            visited.add(neighbor);
            queue.push(neighbor);
          }
        }
      }

      componentSizes.push(size);
    }

    const components = componentSizes.length;
    // dependentCount = total nodes in all components except the largest
    if (componentSizes.length <= 1) {
      return { components, dependentCount: 0 };
    }

    const maxSize = Math.max(...componentSizes);
    const dependentCount = componentSizes.reduce((sum, s) => sum + s, 0) - maxSize;

    return { components, dependentCount };
  }
}
