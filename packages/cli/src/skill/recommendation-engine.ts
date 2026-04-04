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
