import type { GraphStore } from '@harness-engineering/graph';
import type { PersonaEffectivenessScore, BlindSpot, PersonaRecommendation } from './types.js';

/** Laplace smoothing constant (α = 1). Matches the prior used by `computeHistoricalComplexity`. */
const LAPLACE_ALPHA = 1;

/**
 * Neutral prior used when a persona has no observations for a requested system.
 * Prevents over-confidence from partial data in `recommendPersona`.
 */
const NEUTRAL_PRIOR = 0.5;

/** Defaults for `detectBlindSpots`. */
const DEFAULT_MIN_FAILURES = 2;
const DEFAULT_MIN_FAILURE_RATE = 0.5;

interface Counts {
  successes: number;
  failures: number;
}

/**
 * `persona -> systemNodeId -> counts` built from every persona-attributed
 * `execution_outcome` node in the graph.
 */
type PersonaSystemCounts = Map<string, Map<string, Counts>>;

function bucket(
  map: PersonaSystemCounts,
  persona: string,
  systemNodeId: string,
  result: 'success' | 'failure'
): void {
  let perPersona = map.get(persona);
  if (!perPersona) {
    perPersona = new Map();
    map.set(persona, perPersona);
  }
  let counts = perPersona.get(systemNodeId);
  if (!counts) {
    counts = { successes: 0, failures: 0 };
    perPersona.set(systemNodeId, counts);
  }
  if (result === 'success') counts.successes += 1;
  else if (result === 'failure') counts.failures += 1;
}

/**
 * Traverse the graph once and collect persona-attributed outcomes grouped by
 * `(persona, systemNodeId)`. Outcomes missing `agentPersona` or without any
 * `outcome_of` edges are ignored.
 */
function gatherOutcomes(store: GraphStore): PersonaSystemCounts {
  const map: PersonaSystemCounts = new Map();
  const nodes = store.findNodes({ type: 'execution_outcome' });
  for (const node of nodes) {
    const persona = node.metadata.agentPersona;
    if (typeof persona !== 'string' || persona.length === 0) continue;
    const result = node.metadata.result;
    if (result !== 'success' && result !== 'failure') continue;
    const edges = store.getEdges({ from: node.id, type: 'outcome_of' });
    for (const edge of edges) {
      bucket(map, persona, edge.to, result);
    }
  }
  return map;
}

/**
 * Laplace-smoothed success rate: `(successes + 1) / (successes + failures + 2)`.
 */
function smoothedSuccessRate(counts: Counts): number {
  const total = counts.successes + counts.failures;
  return (counts.successes + LAPLACE_ALPHA) / (total + 2 * LAPLACE_ALPHA);
}

/**
 * Per-`(persona, systemNodeId)` effectiveness scores.
 *
 * Results are sorted by `successRate` descending, then by `sampleSize`
 * descending, for stable deterministic iteration.
 */
export function computePersonaEffectiveness(
  store: GraphStore,
  opts?: { persona?: string; systemNodeId?: string }
): PersonaEffectivenessScore[] {
  const map = gatherOutcomes(store);
  const rows: PersonaEffectivenessScore[] = [];

  for (const [persona, perSystem] of map) {
    if (opts?.persona !== undefined && persona !== opts.persona) continue;
    for (const [systemNodeId, counts] of perSystem) {
      if (opts?.systemNodeId !== undefined && systemNodeId !== opts.systemNodeId) continue;
      const sampleSize = counts.successes + counts.failures;
      if (sampleSize === 0) continue;
      rows.push({
        persona,
        systemNodeId,
        successes: counts.successes,
        failures: counts.failures,
        sampleSize,
        successRate: smoothedSuccessRate(counts),
      });
    }
  }

  rows.sort((a, b) => {
    if (b.successRate !== a.successRate) return b.successRate - a.successRate;
    return b.sampleSize - a.sampleSize;
  });
  return rows;
}

/**
 * Blind spots: `(persona, system)` pairs where failures accumulate.
 *
 * Uses the *raw* failure rate (not smoothed) so thresholds stay intuitive.
 * A pair must satisfy BOTH `failures >= minFailures` AND
 * `rawFailureRate >= minFailureRate`.
 *
 * Results are sorted by `failureRate` descending, then by `failures` descending.
 */
export function detectBlindSpots(
  store: GraphStore,
  opts?: { persona?: string; minFailures?: number; minFailureRate?: number }
): BlindSpot[] {
  const minFailures = opts?.minFailures ?? DEFAULT_MIN_FAILURES;
  const minFailureRate = opts?.minFailureRate ?? DEFAULT_MIN_FAILURE_RATE;
  const map = gatherOutcomes(store);
  const spots: BlindSpot[] = [];

  for (const [persona, perSystem] of map) {
    if (opts?.persona !== undefined && persona !== opts.persona) continue;
    for (const [systemNodeId, counts] of perSystem) {
      const total = counts.successes + counts.failures;
      if (total === 0) continue;
      const failureRate = counts.failures / total;
      if (counts.failures < minFailures) continue;
      if (failureRate < minFailureRate) continue;
      spots.push({
        persona,
        systemNodeId,
        successes: counts.successes,
        failures: counts.failures,
        failureRate,
      });
    }
  }

  spots.sort((a, b) => {
    if (b.failureRate !== a.failureRate) return b.failureRate - a.failureRate;
    return b.failures - a.failures;
  });
  return spots;
}

/**
 * Recommend personas to route a new issue to, given its affected systems.
 *
 * For each candidate persona, compute the mean Laplace-smoothed success rate
 * across `systemNodeIds`. Systems with no observations for the candidate
 * contribute the neutral prior 0.5.
 *
 * When `candidatePersonas` is omitted, the candidate set is the set of
 * personas with at least one persona-attributed outcome in the graph.
 * When none exist and no candidates are passed in, returns `[]`.
 *
 * Results are sorted by `score` descending, ties broken by `totalSamples`
 * descending.
 */
export function recommendPersona(
  store: GraphStore,
  opts: {
    systemNodeIds: string[];
    candidatePersonas?: string[];
    minSamples?: number;
  }
): PersonaRecommendation[] {
  const { systemNodeIds } = opts;
  if (systemNodeIds.length === 0) return [];

  const map = gatherOutcomes(store);
  const candidates = opts.candidatePersonas ?? Array.from(map.keys());
  if (candidates.length === 0) return [];

  const minSamples = opts.minSamples ?? 0;
  const recommendations: PersonaRecommendation[] = [];

  for (const persona of candidates) {
    const perSystem = map.get(persona);
    let totalScore = 0;
    let covered = 0;
    let unknown = 0;
    let samples = 0;

    for (const systemNodeId of systemNodeIds) {
      const counts = perSystem?.get(systemNodeId);
      if (counts && counts.successes + counts.failures > 0) {
        totalScore += smoothedSuccessRate(counts);
        covered += 1;
        samples += counts.successes + counts.failures;
      } else {
        totalScore += NEUTRAL_PRIOR;
        unknown += 1;
      }
    }

    if (samples < minSamples) continue;

    recommendations.push({
      persona,
      score: totalScore / systemNodeIds.length,
      coveredSystems: covered,
      unknownSystems: unknown,
      totalSamples: samples,
    });
  }

  recommendations.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.totalSamples - a.totalSamples;
  });
  return recommendations;
}
