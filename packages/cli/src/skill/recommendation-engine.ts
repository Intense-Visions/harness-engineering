/**
 * Recommendation engine core -- three-layer skill recommendation system.
 *
 * Layer 1: matchHardRules -- hard address matching for critical signals
 * Layer 2: scoreByHealth -- weighted scoring for soft addresses
 * Layer 3: sequenceRecommendations -- topological sort + heuristic ordering
 *
 * Public API: recommend() combines all three layers.
 */

import type { SkillAddress } from './schema.js';
import type { HealthSnapshot, HealthMetrics } from './health-snapshot.js';
import type { Recommendation, RecommendationResult } from './recommendation-types.js';
import { FALLBACK_RULES } from './recommendation-rules.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Compact representation of a skill's address config and dependencies. */
export interface SkillAddressEntry {
  addresses: SkillAddress[];
  dependsOn: string[];
}

/** Index mapping skill name to its addresses and dependency info. */
export type SkillAddressIndex = Map<string, SkillAddressEntry>;

// ---------------------------------------------------------------------------
// Metric resolver
// ---------------------------------------------------------------------------

/**
 * Resolve a SkillAddress.metric name to the corresponding value from HealthMetrics.
 *
 * Metric name mapping:
 * - "fanOut" -> maxFanOut (worst-case fan-out)
 * - "couplingRatio" -> avgCouplingRatio
 * - "cyclomaticComplexity" -> maxCyclomaticComplexity
 * - "coverage" -> inverted testCoverage (100 - coverage), so higher = worse
 *
 * Returns null if the metric is unknown or unavailable.
 */
export function resolveMetricValue(metrics: HealthMetrics, metricName: string): number | null {
  switch (metricName) {
    case 'fanOut':
      return metrics.maxFanOut;
    case 'couplingRatio':
      return metrics.avgCouplingRatio;
    case 'cyclomaticComplexity':
      return metrics.maxCyclomaticComplexity;
    case 'coverage':
      return metrics.testCoverage !== null ? 100 - metrics.testCoverage : null;
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Index builder helper
// ---------------------------------------------------------------------------

/**
 * Build a SkillAddressIndex by merging skill index entries with fallback rules.
 * - Skills with non-empty addresses: use skill-declared addresses (precedence).
 * - Skills with empty addresses: use fallback rules if available.
 * - Fallback-only skills (not in index): injected from FALLBACK_RULES.
 */
export function buildSkillAddressIndex(
  skills: Record<string, { addresses: SkillAddress[]; dependsOn: string[] }>
): SkillAddressIndex {
  const index: SkillAddressIndex = new Map();

  // First, add all skills from the skills index
  for (const [name, entry] of Object.entries(skills)) {
    const addresses = entry.addresses.length > 0 ? entry.addresses : (FALLBACK_RULES[name] ?? []);
    index.set(name, { addresses, dependsOn: entry.dependsOn });
  }

  // Then, add fallback-only skills not already in the index
  for (const [name, addresses] of Object.entries(FALLBACK_RULES)) {
    if (!index.has(name)) {
      index.set(name, { addresses, dependsOn: [] });
    }
  }

  return index;
}

// ---------------------------------------------------------------------------
// Layer 1: Hard rule matching
// ---------------------------------------------------------------------------

/**
 * Match skills with hard addresses against active snapshot signals.
 * Returns one Recommendation per skill with urgency 'critical' and score 1.0.
 */
export function matchHardRules(
  snapshot: HealthSnapshot,
  skillIndex: SkillAddressIndex
): Recommendation[] {
  const activeSignals = new Set(snapshot.signals);
  const results: Recommendation[] = [];

  for (const [skillName, entry] of skillIndex) {
    const hardAddresses = entry.addresses.filter((a) => a.hard === true);
    const matchedSignals: string[] = [];
    const reasons: string[] = [];

    for (const addr of hardAddresses) {
      if (activeSignals.has(addr.signal)) {
        matchedSignals.push(addr.signal);
        reasons.push(`[CRITICAL] Signal '${addr.signal}' is active`);
      }
    }

    if (matchedSignals.length > 0) {
      results.push({
        skillName,
        score: 1.0,
        urgency: 'critical',
        reasons,
        sequence: 0, // assigned later by sequencer
        triggeredBy: matchedSignals,
      });
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Layer 2: Health scoring
// ---------------------------------------------------------------------------

/** Clamp a value to the range [min, max]. */
function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

const DEFAULT_WEIGHT = 0.5;

/**
 * Score skills by soft address matching against active signals and metrics.
 * Skips hard addresses (those are handled by Layer 1).
 *
 * For each skill:
 *   - For each non-hard address matching an active signal:
 *     - If metric + threshold: distance = (actual - threshold) / threshold, clamped [0,1]
 *       contribution = weight * distance
 *     - If signal-only (no metric): contribution = weight (signal active = full weight)
 *   - Score = average of contributions across matching addresses
 *   - Urgency: score >= 0.7 -> 'recommended', else 'nice-to-have'
 */
export function scoreByHealth(
  snapshot: HealthSnapshot,
  skillIndex: SkillAddressIndex
): Recommendation[] {
  const activeSignals = new Set(snapshot.signals);
  const results: Recommendation[] = [];

  for (const [skillName, entry] of skillIndex) {
    const softAddresses = entry.addresses.filter((a) => !a.hard);
    const contributions: number[] = [];
    const triggeredBy: string[] = [];
    const reasons: string[] = [];

    for (const addr of softAddresses) {
      if (!activeSignals.has(addr.signal)) continue;

      const weight = addr.weight ?? DEFAULT_WEIGHT;

      if (addr.metric && addr.threshold !== undefined) {
        const actual = resolveMetricValue(snapshot.metrics, addr.metric);
        if (actual === null) continue; // metric unavailable, skip

        const distance = clamp((actual - addr.threshold) / addr.threshold, 0, 1);
        const contribution = weight * distance;
        contributions.push(contribution);
        triggeredBy.push(addr.signal);
        reasons.push(
          `${addr.metric} = ${actual} (threshold ${addr.threshold}, distance ${distance.toFixed(2)})`
        );
      } else {
        // Signal-only: full weight contribution when signal is active
        contributions.push(weight);
        triggeredBy.push(addr.signal);
        reasons.push(`Signal '${addr.signal}' is active (weight ${weight})`);
      }
    }

    if (contributions.length === 0) continue;

    const score = clamp(contributions.reduce((sum, c) => sum + c, 0) / contributions.length, 0, 1);
    const urgency = score >= 0.7 ? 'recommended' : 'nice-to-have';

    results.push({
      skillName,
      score: Math.round(score * 1000) / 1000, // round to 3 decimal places
      urgency,
      reasons,
      sequence: 0,
      triggeredBy: [...new Set(triggeredBy)],
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Layer 3: Sequencing
// ---------------------------------------------------------------------------

/** Keyword sets for heuristic ordering within the same dependency level. */
const DIAGNOSTIC_KEYWORDS = ['health', 'detect', 'analyze', 'audit', 'hotspot', 'debugging'];
const FIX_KEYWORDS = ['enforce', 'cleanup', 'fix', 'refactor', 'codebase'];
const VALIDATION_KEYWORDS = ['verify', 'test', 'tdd', 'review', 'soundness', 'integrity'];

/**
 * Classify a skill name into a phase for heuristic ordering.
 * 0 = diagnostic, 1 = fix, 2 = validation, 3 = unclassified
 */
function classifyPhase(skillName: string): number {
  const lower = skillName.toLowerCase();
  if (DIAGNOSTIC_KEYWORDS.some((kw) => lower.includes(kw))) return 0;
  if (FIX_KEYWORDS.some((kw) => lower.includes(kw))) return 1;
  if (VALIDATION_KEYWORDS.some((kw) => lower.includes(kw))) return 2;
  return 3;
}

/** Create a comparator for heuristic ordering: phase first, then score descending. */
function heuristicComparator(recMap: Map<string, Recommendation>) {
  return (a: string, b: string): number => {
    const phaseA = classifyPhase(a);
    const phaseB = classifyPhase(b);
    if (phaseA !== phaseB) return phaseA - phaseB;
    return (recMap.get(b)?.score ?? 0) - (recMap.get(a)?.score ?? 0);
  };
}

/** Build adjacency list and in-degree map for Kahn's algorithm. */
function buildDepGraph(
  nameSet: Set<string>,
  skillDeps: Map<string, string[]>
): { inDegree: Map<string, number>; adjacency: Map<string, string[]> } {
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  for (const name of nameSet) {
    inDegree.set(name, 0);
    adjacency.set(name, []);
  }

  for (const name of nameSet) {
    for (const dep of skillDeps.get(name) ?? []) {
      if (!nameSet.has(dep)) continue;
      adjacency.get(dep)!.push(name);
      inDegree.set(name, (inDegree.get(name) ?? 0) + 1);
    }
  }

  return { inDegree, adjacency };
}

/**
 * Topologically sort recommendations by dependency, then apply
 * diagnostic -> fix -> validate heuristic within the same level.
 *
 * Uses Kahn's algorithm for topological sort.
 * Dependencies on skills not in the recommendations list are ignored.
 */
export function sequenceRecommendations(
  recommendations: Recommendation[],
  skillDeps: Map<string, string[]>
): Recommendation[] {
  if (recommendations.length === 0) return [];

  const nameSet = new Set(recommendations.map((r) => r.skillName));
  const recMap = new Map(recommendations.map((r) => [r.skillName, r]));
  const compare = heuristicComparator(recMap);
  const { inDegree, adjacency } = buildDepGraph(nameSet, skillDeps);

  const sorted: Recommendation[] = [];
  let sequence = 1;

  let queue = [...nameSet].filter((n) => (inDegree.get(n) ?? 0) === 0).sort(compare);

  while (queue.length > 0) {
    const nextQueue: string[] = [];

    for (const name of queue) {
      const rec = recMap.get(name)!;
      rec.sequence = sequence++;
      sorted.push(rec);

      for (const dependent of adjacency.get(name) ?? []) {
        const newDeg = (inDegree.get(dependent) ?? 1) - 1;
        inDegree.set(dependent, newDeg);
        if (newDeg === 0) nextQueue.push(dependent);
      }
    }

    queue = nextQueue.sort(compare);
  }

  return sorted;
}
