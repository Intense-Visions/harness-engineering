import type { GraphStore } from '@harness-engineering/graph';
import { CascadeSimulator, groupNodesByImpact } from '@harness-engineering/graph';
import type { EnrichedSpec, ComplexityScore, SimulationResult } from '../types.js';

/**
 * Confidence floor for graph-only checks.
 * When blast radius is zero and no test gaps exist, confidence starts here.
 */
const BASE_CONFIDENCE = 0.85;

/** Per-risk-hotspot confidence penalty. */
const HOTSPOT_PENALTY = 0.05;

/** Per-test-gap confidence penalty. */
const TEST_GAP_PENALTY = 0.08;

/** Per-predicted-failure confidence penalty. */
const FAILURE_PENALTY = 0.1;

/**
 * Run graph-only pre-execution simulation checks.
 *
 * Uses CascadeSimulator blast radius and impact grouping to produce a
 * SimulationResult without any LLM calls. Intended for quick-fix and
 * diagnostic tier issues where speed matters.
 *
 * Deterministic and fast (<2s for typical graphs).
 */
export function runGraphOnlyChecks(
  spec: EnrichedSpec,
  score: ComplexityScore,
  store: GraphStore
): SimulationResult {
  const riskHotspots: string[] = [];
  const predictedFailures: string[] = [];
  const testGaps: string[] = [];
  const recommendedChanges: string[] = [];

  const systemsWithGraph = spec.affectedSystems.filter((s) => s.graphNodeId !== null);

  // Run cascade simulation for each resolved system
  const simulator = new CascadeSimulator(store);

  for (const system of systemsWithGraph) {
    let cascadeResult;
    try {
      cascadeResult = simulator.simulate(system.graphNodeId!);
    } catch {
      // Node not found in graph -- skip
      continue;
    }

    // Collect amplification points as risk hotspots
    for (const nodeId of cascadeResult.summary.amplificationPoints) {
      const node = store.getNode(nodeId);
      riskHotspots.push(node ? `${node.name} (high fan-out)` : `${nodeId} (high fan-out)`);
    }

    // High-risk cascade nodes indicate potential fragility
    const highRiskNodes = cascadeResult.flatSummary.filter((n) => n.cumulativeProbability >= 0.5);
    if (highRiskNodes.length > 5) {
      predictedFailures.push(
        `${system.name}: cascade affects ${highRiskNodes.length} high-probability nodes`
      );
    }

    // Group impact to find test coverage gaps in cascade path
    const affectedNodes = cascadeResult.flatSummary
      .map((n) => store.getNode(n.nodeId))
      .filter((n): n is NonNullable<typeof n> => n !== undefined);

    const groups = groupNodesByImpact(affectedNodes);
    if (groups.code.length > 0 && groups.tests.length === 0) {
      recommendedChanges.push(`${system.name}: affected code has no test coverage in cascade path`);
    }
  }

  // Detect test gaps from affected systems metadata
  for (const system of spec.affectedSystems) {
    if (system.testCoverage === 0) {
      testGaps.push(`${system.name}: no test coverage detected`);
    }
  }

  // If blast radius is large but no tests are affected, flag it
  if (score.blastRadius.filesEstimated > 10 && score.blastRadius.testFilesAffected === 0) {
    testGaps.push(
      `Blast radius covers ${score.blastRadius.filesEstimated} files but no test files are affected`
    );
  }

  // Compute execution confidence
  let confidence = BASE_CONFIDENCE;
  confidence -= riskHotspots.length * HOTSPOT_PENALTY;
  confidence -= testGaps.length * TEST_GAP_PENALTY;
  confidence -= predictedFailures.length * FAILURE_PENALTY;

  // Factor in the CML overall score -- higher complexity = lower confidence
  confidence -= score.overall * 0.2;

  // Clamp to [0, 1]
  confidence = Math.max(0, Math.min(1, confidence));

  return {
    simulatedPlan: [], // Graph-only checks do not produce a plan
    predictedFailures,
    riskHotspots,
    missingSteps: [], // Graph-only checks do not produce missing steps
    testGaps,
    executionConfidence: confidence,
    recommendedChanges,
    abort: confidence < 0.3,
    tier: 'graph-only',
  };
}
