import { join } from 'node:path';
import { GraphStore, NODE_TYPES } from '@harness-engineering/graph';
import type { GraphResult, NodeTypeCount } from '../../shared/types';
import { GRAPH_DIR } from '../../shared/constants';

/**
 * Load the knowledge graph and return node/edge metrics.
 * Returns { available: false } with a reason when the graph cannot be loaded.
 */
export async function gatherGraph(projectPath: string): Promise<GraphResult> {
  try {
    const store = new GraphStore();
    const loaded = await store.load(join(projectPath, GRAPH_DIR));

    if (!loaded) {
      return {
        available: false,
        reason: 'Graph data not found. Run "harness graph scan" to build the knowledge graph.',
      };
    }

    // Count nodes by type
    const nodesByType: NodeTypeCount[] = [];
    for (const type of NODE_TYPES) {
      const nodes = store.findNodes({ type });
      if (nodes.length > 0) {
        nodesByType.push({ type, count: nodes.length });
      }
    }

    return {
      available: true,
      nodeCount: store.nodeCount,
      edgeCount: store.edgeCount,
      nodesByType,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      available: false,
      reason: `Failed to load graph: ${message}`,
    };
  }
}
