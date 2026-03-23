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

    return {
      statisticalOutliers: [],
      articulationPoints: [],
      overlapping: [],
      summary: {
        totalNodesAnalyzed: 0,
        outlierCount: 0,
        articulationPointCount: 0,
        overlapCount: 0,
        metricsAnalyzed: metricsToAnalyze,
        warnings,
        threshold,
      },
    };
  }
}
