/**
 * Specialization scorer — computes expertise scores for (persona, system, taskType) tuples.
 *
 * Builds on the effectiveness module by adding temporal decay, task-type
 * categorization, consistency scoring, and dynamic persona weighting.
 */

import type { GraphStore } from '@harness-engineering/graph';
import type { TaskType } from '../outcome/types.js';
import type {
  ExpertiseLevel,
  SpecializationEntry,
  SpecializationProfile,
  WeightedRecommendation,
} from './types.js';
import { temporalSuccessRate } from './temporal.js';
import type { TemporalConfig } from './temporal.js';
import { recommendPersona } from '../effectiveness/scorer.js';

/** Expert threshold for volume bonus computation. */
const EXPERT_THRESHOLD = 30;

/** Default half-life in days. */
const DEFAULT_HALF_LIFE = 30;

/** Default minimum samples to include in results. */
const DEFAULT_MIN_SAMPLES = 1;

/** Rolling window size for consistency computation. */
const CONSISTENCY_WINDOW = 5;

/** Score weights for composite calculation. */
const W_TEMPORAL = 0.6;
const W_CONSISTENCY = 0.25;
const W_VOLUME = 0.15;

export interface SpecializationOptions {
  persona?: string;
  systemNodeId?: string;
  taskType?: TaskType;
  temporal?: TemporalConfig;
  minSamples?: number;
}

/**
 * Classify expertise level from sample size and success rate.
 */
export function computeExpertiseLevel(sampleSize: number, successRate: number): ExpertiseLevel {
  if (sampleSize < 5) return 'novice';
  if (sampleSize < 15) return successRate >= 0.6 ? 'competent' : 'novice';
  if (sampleSize < 30) return successRate >= 0.7 ? 'proficient' : 'competent';
  return successRate >= 0.75 ? 'expert' : 'proficient';
}

interface OutcomeRecord {
  result: 'success' | 'failure';
  timestamp: string;
  persona: string;
  systemNodeId: string;
  taskType: string;
}

/**
 * Gather all persona-attributed outcomes from the graph with their task types
 * and linked systems.
 */
function gatherOutcomesWithTaskType(store: GraphStore): OutcomeRecord[] {
  const records: OutcomeRecord[] = [];
  const nodes = store.findNodes({ type: 'execution_outcome' });

  for (const node of nodes) {
    const persona = node.metadata.agentPersona;
    if (typeof persona !== 'string' || persona.length === 0) continue;
    const result = node.metadata.result;
    if (result !== 'success' && result !== 'failure') continue;

    const taskType = typeof node.metadata.taskType === 'string' ? node.metadata.taskType : '*';
    const edges = store.getEdges({ from: node.id, type: 'outcome_of' });
    const timestamp = typeof node.metadata.timestamp === 'string' ? node.metadata.timestamp : '';

    for (const edge of edges) {
      records.push({ result, timestamp, persona, systemNodeId: edge.to, taskType });
    }
  }

  return records;
}

/**
 * Compute consistency score from a series of outcomes (ordered by time).
 * Uses rolling windows of CONSISTENCY_WINDOW and computes 1 - normalized stddev.
 */
function computeConsistency(results: Array<'success' | 'failure'>): number {
  if (results.length < CONSISTENCY_WINDOW) {
    // Not enough data for windowed consistency — return neutral
    const successes = results.filter((r) => r === 'success').length;
    return results.length > 0 ? successes / results.length : 0.5;
  }

  const windowRates: number[] = [];
  for (let i = 0; i <= results.length - CONSISTENCY_WINDOW; i++) {
    const window = results.slice(i, i + CONSISTENCY_WINDOW);
    const rate = window.filter((r) => r === 'success').length / CONSISTENCY_WINDOW;
    windowRates.push(rate);
  }

  if (windowRates.length <= 1) return windowRates[0] ?? 0.5;

  const mean = windowRates.reduce((a, b) => a + b, 0) / windowRates.length;
  const variance = windowRates.reduce((sum, r) => sum + (r - mean) ** 2, 0) / windowRates.length;
  const stddev = Math.sqrt(variance);

  // Normalize: max possible stddev for binary windows is 0.5
  return Math.max(0, Math.min(1, 1 - stddev / 0.5));
}

/**
 * Compute volume bonus using log scale, capped at 1.0.
 */
function computeVolumeBonus(sampleSize: number): number {
  return Math.min(1.0, Math.log2(sampleSize + 1) / Math.log2(EXPERT_THRESHOLD + 1));
}

/** Group key for bucketing. */
type BucketKey = `${string}|${string}|${string}`;

function bucketKey(persona: string, systemNodeId: string, taskType: string): BucketKey {
  return `${persona}|${systemNodeId}|${taskType}`;
}

function matchesFilter(record: OutcomeRecord, opts?: SpecializationOptions): boolean {
  if (!opts) return true;
  const filters: [string | undefined, string | undefined][] = [
    [opts.persona, record.persona],
    [opts.systemNodeId, record.systemNodeId],
    [opts.taskType, record.taskType],
  ];
  return filters.every(([filter, value]) => !filter || filter === value);
}

function groupIntoBuckets(
  records: OutcomeRecord[],
  opts?: SpecializationOptions
): Map<BucketKey, OutcomeRecord[]> {
  const buckets = new Map<BucketKey, OutcomeRecord[]>();
  for (const record of records) {
    if (!matchesFilter(record, opts)) continue;

    const key = bucketKey(record.persona, record.systemNodeId, record.taskType);
    let arr = buckets.get(key);
    if (!arr) {
      arr = [];
      buckets.set(key, arr);
    }
    arr.push(record);
  }
  return buckets;
}

function computeEntryFromBucket(
  records: OutcomeRecord[],
  temporal: TemporalConfig
): SpecializationEntry {
  const first = records[0]!;
  const { persona, systemNodeId, taskType } = first;

  const sorted = [...records].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));

  const tsr = temporalSuccessRate(
    sorted.map((r) => ({ result: r.result, timestamp: r.timestamp })),
    temporal
  );

  const consistency = computeConsistency(sorted.map((r) => r.result));
  const volume = computeVolumeBonus(sorted.length);
  const composite = W_TEMPORAL * tsr + W_CONSISTENCY * consistency + W_VOLUME * volume;

  const lastOutcome = sorted[sorted.length - 1]!.timestamp;
  const rawSuccessRate = sorted.filter((r) => r.result === 'success').length / sorted.length;

  return {
    persona,
    systemNodeId,
    taskType,
    score: {
      temporalSuccessRate: tsr,
      consistencyScore: consistency,
      volumeBonus: volume,
      composite,
    },
    expertiseLevel: computeExpertiseLevel(sorted.length, rawSuccessRate),
    sampleSize: sorted.length,
    lastOutcome,
  };
}

/**
 * Compute specialization entries for (persona, system, taskType) tuples.
 */
export function computeSpecialization(
  store: GraphStore,
  opts?: SpecializationOptions
): SpecializationEntry[] {
  const records = gatherOutcomesWithTaskType(store);
  if (records.length === 0) return [];

  const temporal: TemporalConfig = opts?.temporal ?? { halfLifeDays: DEFAULT_HALF_LIFE };
  const minSamples = opts?.minSamples ?? DEFAULT_MIN_SAMPLES;

  const buckets = groupIntoBuckets(records, opts);
  const entries: SpecializationEntry[] = [];

  for (const [, records] of buckets) {
    if (records.length < minSamples) continue;
    entries.push(computeEntryFromBucket(records, temporal));
  }

  // Sort by composite descending for stable output
  entries.sort((a, b) => b.score.composite - a.score.composite);
  return entries;
}

/**
 * Build a full specialization profile for a persona.
 */
export function buildSpecializationProfile(
  store: GraphStore,
  persona: string,
  opts?: Omit<SpecializationOptions, 'persona'>
): SpecializationProfile {
  const entries = computeSpecialization(store, { ...opts, persona });

  if (entries.length === 0) {
    return {
      persona,
      entries: [],
      strengths: [],
      weaknesses: [],
      overallLevel: 'novice',
      computedAt: new Date().toISOString(),
    };
  }

  // Weaknesses: entries with >50% failure rate (temporal success rate < 0.5)
  const weaknessSet = new Set<string>();
  const weaknesses = entries
    .filter((e) => e.score.temporalSuccessRate < 0.5)
    .sort((a, b) => a.score.temporalSuccessRate - b.score.temporalSuccessRate)
    .slice(0, 3);
  for (const w of weaknesses) {
    weaknessSet.add(`${w.systemNodeId}|${w.taskType}`);
  }

  // Strengths: top 3 by composite score, excluding entries that are also weaknesses
  const strengths = entries
    .filter((e) => !weaknessSet.has(`${e.systemNodeId}|${e.taskType}`))
    .slice(0, 3);

  // Overall level: median of entry levels
  const levelOrder: ExpertiseLevel[] = ['novice', 'competent', 'proficient', 'expert'];
  const sortedLevels = entries
    .map((e) => levelOrder.indexOf(e.expertiseLevel))
    .sort((a, b) => a - b);
  const medianIdx = Math.floor(sortedLevels.length / 2);
  const medianValue = sortedLevels[medianIdx] ?? 0;
  const overallLevel = levelOrder[medianValue] ?? 'novice';

  return {
    persona,
    entries,
    strengths,
    weaknesses,
    overallLevel,
    computedAt: new Date().toISOString(),
  };
}

/**
 * Weighted persona recommendation incorporating specialization scores.
 *
 * Wraps the existing `recommendPersona()` and applies specialization
 * multipliers to produce weighted scores.
 */
export function weightedRecommendPersona(
  store: GraphStore,
  opts: {
    systemNodeIds: string[];
    taskType?: TaskType;
    candidatePersonas?: string[];
    minSamples?: number;
    temporal?: TemporalConfig;
  }
): WeightedRecommendation[] {
  const { systemNodeIds } = opts;
  if (systemNodeIds.length === 0) return [];

  // Get base recommendations — only pass defined optional properties
  const recOpts: Parameters<typeof recommendPersona>[1] = { systemNodeIds };
  if (opts.candidatePersonas !== undefined) recOpts.candidatePersonas = opts.candidatePersonas;
  if (opts.minSamples !== undefined) recOpts.minSamples = opts.minSamples;
  const baseRecs = recommendPersona(store, recOpts);

  if (baseRecs.length === 0) return [];

  const temporal = opts.temporal ?? { halfLifeDays: DEFAULT_HALF_LIFE };
  const results: WeightedRecommendation[] = [];

  for (const rec of baseRecs) {
    // Compute specialization for this persona across the requested systems
    const specOpts: SpecializationOptions = { persona: rec.persona, temporal };
    if (opts.taskType !== undefined) specOpts.taskType = opts.taskType;
    const specEntries = computeSpecialization(store, specOpts);

    // Filter to requested systems
    const relevant = specEntries.filter((e) => systemNodeIds.includes(e.systemNodeId));

    let multiplier: number;
    let expertiseLevel: ExpertiseLevel;
    let specializedSystems: number;

    if (relevant.length === 0) {
      // No specialization data — neutral
      multiplier = 1.0;
      expertiseLevel = 'novice';
      specializedSystems = 0;
    } else {
      const meanComposite =
        relevant.reduce((sum, e) => sum + e.score.composite, 0) / relevant.length;
      multiplier = 0.5 + meanComposite;
      specializedSystems = relevant.length;

      // Use the best expertise level among relevant entries
      const levelOrder: ExpertiseLevel[] = ['novice', 'competent', 'proficient', 'expert'];
      const bestLevel = relevant.reduce((best, e) => {
        const idx = levelOrder.indexOf(e.expertiseLevel);
        return idx > levelOrder.indexOf(best) ? e.expertiseLevel : best;
      }, 'novice' as ExpertiseLevel);
      expertiseLevel = bestLevel;
    }

    results.push({
      persona: rec.persona,
      baseScore: rec.score,
      specializationMultiplier: multiplier,
      weightedScore: rec.score * multiplier,
      expertiseLevel,
      specializedSystems,
    });
  }

  results.sort((a, b) => b.weightedScore - a.weightedScore);
  return results;
}
