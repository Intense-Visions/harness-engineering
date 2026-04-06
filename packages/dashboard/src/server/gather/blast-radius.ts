import { join } from 'node:path';
import { GraphStore, CascadeSimulator } from '@harness-engineering/graph';
import type { BlastRadiusResult } from '../../shared/types';

const GRAPH_DIR = '.harness/graph';
const DEFAULT_MAX_DEPTH = 3;

/**
 * Run a blast radius simulation for a specific node.
 * This is query-scoped: only runs when called with a specific nodeId.
 * Returns an error object instead of throwing on failure.
 */
export async function gatherBlastRadius(
  projectPath: string,
  nodeId: string,
  maxDepth: number = DEFAULT_MAX_DEPTH
): Promise<BlastRadiusResult> {
  try {
    const store = new GraphStore();
    const loaded = await store.load(join(projectPath, GRAPH_DIR));

    if (!loaded) {
      return {
        error: 'Graph data not found. Run "harness graph scan" to build the knowledge graph.',
      };
    }

    const simulator = new CascadeSimulator(store);
    const result = simulator.simulate(nodeId, { maxDepth });

    return {
      sourceNodeId: result.sourceNodeId,
      sourceName: result.sourceName,
      layers: result.layers.map((layer) => ({
        depth: layer.depth,
        nodes: layer.nodes.map((n) => ({
          nodeId: n.nodeId,
          name: n.name,
          type: n.type,
          probability: n.cumulativeProbability,
          parentId: n.parentId,
        })),
      })),
      summary: {
        totalAffected: result.summary.totalAffected,
        maxDepth: result.summary.maxDepthReached,
        highRisk: result.summary.highRisk,
        mediumRisk: result.summary.mediumRisk,
        lowRisk: result.summary.lowRisk,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { error: message };
  }
}
