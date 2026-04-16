import type { GraphStore } from '@harness-engineering/graph';
import type { AnalysisProvider } from '../analysis-provider/interface.js';
import type { EnrichedSpec, ComplexityScore, SimulationResult } from '../types.js';
import { runGraphOnlyChecks } from './graph-checks.js';
import { PESL_SYSTEM_PROMPT, buildPeslPrompt, peslResponseSchema } from './prompts.js';
import type { PESLResponse } from './prompts.js';

/**
 * Base confidence for full simulation before penalties.
 * Lower than graph-only because full simulation implies higher complexity.
 */
const BASE_CONFIDENCE = 0.75;

/** Per-predicted-failure confidence penalty. */
const FAILURE_PENALTY = 0.06;

/** Per-test-gap confidence penalty. */
const TEST_GAP_PENALTY = 0.05;

/** Per-missing-step confidence penalty. */
const MISSING_STEP_PENALTY = 0.04;

/** Penalty factor for CML overall score. */
const COMPLEXITY_PENALTY_FACTOR = 0.15;

/**
 * Run full LLM pre-execution simulation.
 *
 * Combines graph-only checks with LLM-driven plan expansion, failure
 * injection, and test projection. Intended for guided-change and
 * simulation-required tier issues.
 */
export async function runLlmSimulation(
  spec: EnrichedSpec,
  score: ComplexityScore,
  store: GraphStore,
  provider: AnalysisProvider,
  model?: string
): Promise<SimulationResult> {
  // Run graph checks first for baseline signals
  const graphResult = runGraphOnlyChecks(spec, score, store);

  // Run LLM simulation
  const response = await provider.analyze<PESLResponse>({
    prompt: buildPeslPrompt(spec, score),
    systemPrompt: PESL_SYSTEM_PROMPT,
    responseSchema: peslResponseSchema,
    ...(model !== undefined && { model }),
  });

  const llm = response.result;

  // Merge graph and LLM results, deduplicating
  const riskHotspots = dedup([...graphResult.riskHotspots, ...llm.riskHotspots]);
  const predictedFailures = dedup([...graphResult.predictedFailures, ...llm.predictedFailures]);
  const testGaps = dedup([...graphResult.testGaps, ...llm.testGaps]);
  const recommendedChanges = dedup([...graphResult.recommendedChanges, ...llm.recommendedChanges]);

  // Compute execution confidence from combined signals
  let confidence = BASE_CONFIDENCE;
  confidence -= predictedFailures.length * FAILURE_PENALTY;
  confidence -= testGaps.length * TEST_GAP_PENALTY;
  confidence -= llm.missingSteps.length * MISSING_STEP_PENALTY;
  confidence -= score.overall * COMPLEXITY_PENALTY_FACTOR;

  // Clamp to [0, 1]
  confidence = Math.max(0, Math.min(1, confidence));

  return {
    simulatedPlan: llm.simulatedPlan,
    predictedFailures,
    riskHotspots,
    missingSteps: llm.missingSteps,
    testGaps,
    executionConfidence: confidence,
    recommendedChanges,
    abort: confidence < 0.3,
    tier: 'full-simulation',
  };
}

/** Deduplicate string arrays (case-insensitive). */
function dedup(items: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items) {
    const key = item.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      result.push(item);
    }
  }
  return result;
}
