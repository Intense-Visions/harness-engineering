import type { GraphStore } from '../store/GraphStore.js';
import { GraphCouplingAdapter } from './GraphCouplingAdapter.js';
import { GraphComplexityAdapter } from './GraphComplexityAdapter.js';

export interface AnomalyDetectionOptions {
  threshold?: number;
  metrics?: string[];
}

export interface StatisticalOutlier {
  nodeId: string;
  nodeName: string;
  nodePath?: string;
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
  nodePath?: string;
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

    for (const metric of metricsToAnalyze) {
      const entries = this.collectMetricValues(metric);
      for (const e of entries) {
        analyzedNodeIds.add(e.nodeId);
      }
      const outliers = this.computeZScoreOutliers(entries, metric, threshold);
      allOutliers.push(...outliers);
    }

    // Sort by zScore descending
    allOutliers.sort((a, b) => b.zScore - a.zScore);

    return {
      statisticalOutliers: allOutliers,
      articulationPoints: [],
      overlapping: [],
      summary: {
        totalNodesAnalyzed: analyzedNodeIds.size,
        outlierCount: allOutliers.length,
        articulationPointCount: 0,
        overlapCount: 0,
        metricsAnalyzed: metricsToAnalyze,
        warnings,
        threshold,
      },
    };
  }

  private collectMetricValues(
    metric: string
  ): Array<{
    nodeId: string;
    nodeName: string;
    nodePath?: string;
    nodeType: string;
    value: number;
  }> {
    const entries: Array<{
      nodeId: string;
      nodeName: string;
      nodePath?: string;
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
      const couplingAdapter = new GraphCouplingAdapter(this.store);
      const couplingData = couplingAdapter.computeCouplingData();
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
      const complexityAdapter = new GraphComplexityAdapter(this.store);
      const hotspots = complexityAdapter.computeComplexityHotspots();
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
      nodePath?: string;
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
}
