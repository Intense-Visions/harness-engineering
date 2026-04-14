import type { GraphStore } from '@harness-engineering/graph';
import { CascadeSimulator } from '@harness-engineering/graph';
import type { EnrichedSpec, BlastRadius } from '../types.js';

/** Maximum affected-node count used to normalize the structural score to [0, 1]. */
const NORMALIZATION_CEILING = 100;

export interface StructuralResult {
  score: number;
  blastRadius: BlastRadius;
}

/**
 * Compute structural complexity by running CascadeSimulator for every
 * affected system that has a resolved graph node ID.
 *
 * The score is the probability-weighted sum of affected nodes across all
 * systems, normalized against a ceiling of {@link NORMALIZATION_CEILING}.
 */
export function computeStructuralComplexity(
  spec: EnrichedSpec,
  store: GraphStore
): StructuralResult {
  const emptyResult: StructuralResult = {
    score: 0,
    blastRadius: { services: 0, modules: 0, filesEstimated: 0, testFilesAffected: 0 },
  };

  const systemsWithGraph = spec.affectedSystems.filter((s) => s.graphNodeId !== null);

  if (systemsWithGraph.length === 0) {
    return emptyResult;
  }

  const simulator = new CascadeSimulator(store);

  let weightedTotal = 0;
  const seenServices = new Set<string>();
  const seenModules = new Set<string>();
  let totalFiles = 0;
  let totalTestFiles = 0;

  for (const system of systemsWithGraph) {
    let cascadeResult;
    try {
      cascadeResult = simulator.simulate(system.graphNodeId!);
    } catch {
      // Node not found in the graph — skip this system
      continue;
    }

    // Sum affected nodes weighted by their cumulative probability
    for (const node of cascadeResult.flatSummary) {
      weightedTotal += node.cumulativeProbability;
    }

    // Collect blast radius metadata from the cascade result
    const { categoryBreakdown } = cascadeResult.summary;
    totalFiles += categoryBreakdown.code;
    totalTestFiles += categoryBreakdown.tests;

    // Track unique services and modules from affected nodes
    for (const node of cascadeResult.flatSummary) {
      if (node.type === 'repository') {
        seenServices.add(node.nodeId);
      }
      if (node.type === 'module') {
        seenModules.add(node.nodeId);
      }
    }
  }

  const score = Math.min(weightedTotal / NORMALIZATION_CEILING, 1);

  return {
    score,
    blastRadius: {
      services: seenServices.size,
      modules: seenModules.size,
      filesEstimated: totalFiles,
      testFilesAffected: totalTestFiles,
    },
  };
}
