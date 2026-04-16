import type { GraphStore } from '@harness-engineering/graph';
import type { EnrichedSpec } from '../types.js';

/**
 * Smoothing constant to prevent extreme scores from small sample sizes.
 * With SMOOTHING = 2, a single failure yields ~0.33 instead of 1.0.
 */
const SMOOTHING = 2;

interface SystemOutcomeCounts {
  failures: number;
  successes: number;
}

/**
 * Count failure and success outcomes linked to a specific system node
 * by traversing inbound 'outcome_of' edges.
 */
function countOutcomesForSystem(store: GraphStore, systemNodeId: string): SystemOutcomeCounts {
  const edges = store.getEdges({ to: systemNodeId, type: 'outcome_of' });

  let failures = 0;
  let successes = 0;

  for (const edge of edges) {
    const outcomeNode = store.getNode(edge.from);
    if (!outcomeNode || outcomeNode.type !== 'execution_outcome') continue;

    if (outcomeNode.metadata.result === 'failure') {
      failures++;
    } else if (outcomeNode.metadata.result === 'success') {
      successes++;
    }
  }

  return { failures, successes };
}

/**
 * Compute a failure rate for a system using Laplace-style smoothing.
 *
 * Formula: failures / (failures + successes + SMOOTHING)
 *
 * Returns 0 when no outcomes exist. Returns values in (0, 1) otherwise.
 */
function computeFailureRate(counts: SystemOutcomeCounts): number {
  const total = counts.failures + counts.successes;
  if (total === 0) return 0;
  return counts.failures / (total + SMOOTHING);
}

/**
 * Compute historical complexity from past execution outcomes in the graph.
 *
 * For each affected system with a graph node ID, queries the graph for
 * 'execution_outcome' nodes linked via 'outcome_of' edges. Computes
 * a smoothed failure rate per system, then returns the maximum across
 * all systems.
 *
 * Returns a value in [0, 1]. Returns 0 when no outcomes exist.
 */
export function computeHistoricalComplexity(spec: EnrichedSpec, store: GraphStore): number {
  const systemsWithGraph = spec.affectedSystems.filter((s) => s.graphNodeId !== null);

  if (systemsWithGraph.length === 0) return 0;

  let maxFailureRate = 0;

  for (const system of systemsWithGraph) {
    const counts = countOutcomesForSystem(store, system.graphNodeId!);
    const rate = computeFailureRate(counts);
    if (rate > maxFailureRate) {
      maxFailureRate = rate;
    }
  }

  return Math.max(0, Math.min(1, maxFailureRate));
}
