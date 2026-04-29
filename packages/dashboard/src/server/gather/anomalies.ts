import { join } from 'node:path';
import { GraphStore, GraphAnomalyAdapter } from '@harness-engineering/graph';
import type { AnomalyResult } from '../../shared/types';
import { GRAPH_DIR } from '../../shared/constants';

/**
 * Detect graph anomalies (statistical outliers and articulation points).
 * Returns { available: false } when the graph cannot be loaded.
 */
export async function gatherAnomalies(projectPath: string): Promise<AnomalyResult> {
  try {
    const store = new GraphStore();
    const loaded = await store.load(join(projectPath, GRAPH_DIR));

    if (!loaded) {
      return {
        available: false,
        reason: 'Graph data not found. Run "harness scan" to build the knowledge graph.',
      };
    }

    const adapter = new GraphAnomalyAdapter(store);
    const report = adapter.detect();

    return {
      outliers: report.statisticalOutliers.map((o) => ({
        nodeId: o.nodeId,
        name: o.nodeName,
        type: o.nodeType,
        metric: o.metric,
        value: o.value,
        zScore: o.zScore,
      })),
      articulationPoints: report.articulationPoints.map((ap) => ({
        nodeId: ap.nodeId,
        name: ap.nodeName,
        componentsIfRemoved: ap.componentsIfRemoved,
        dependentCount: ap.dependentCount,
      })),
      overlapCount: report.summary.overlapCount,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      available: false,
      reason: `Failed to detect anomalies: ${message}`,
    };
  }
}
