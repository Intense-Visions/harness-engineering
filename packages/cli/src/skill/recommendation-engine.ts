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
    // Normalize name: strip harness- prefix to match canonical FALLBACK_RULES keys
    const canonicalName = name.replace(/^harness-/, '');
    const addresses =
      entry.addresses.length > 0
        ? entry.addresses
        : (FALLBACK_RULES[name] ?? FALLBACK_RULES[canonicalName] ?? []);
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

function scoreAddress(
  addr: SkillAddress,
  metrics: HealthMetrics
): { contribution: number; reason: string } | null {
  const weight = addr.weight ?? DEFAULT_WEIGHT;
  if (addr.metric && addr.threshold !== undefined) {
    const actual = resolveMetricValue(metrics, addr.metric);
    if (actual === null) return null;
    const distance = clamp((actual - addr.threshold) / addr.threshold, 0, 1);
    return {
      contribution: weight * distance,
      reason: `${addr.metric} = ${actual} (threshold ${addr.threshold}, distance ${distance.toFixed(2)})`,
    };
  }
  return { contribution: weight, reason: `Signal '${addr.signal}' is active (weight ${weight})` };
}

/**
 * Score skills by soft address matching against active signals and metrics.
 * Skips hard addresses (those are handled by Layer 1).
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
      const scored = scoreAddress(addr, snapshot.metrics);
      if (!scored) continue;
      contributions.push(scored.contribution);
      triggeredBy.push(addr.signal);
      reasons.push(scored.reason);
    }

    if (contributions.length === 0) continue;

    const score = clamp(contributions.reduce((sum, c) => sum + c, 0) / contributions.length, 0, 1);
    const urgency = score >= 0.7 ? 'recommended' : 'nice-to-have';

    results.push({
      skillName,
      score: Math.round(score * 1000) / 1000,
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

/** Process one item from the Kahn's algorithm queue: assign sequence, update in-degrees. Returns next sequence value. */
function processQueueItem(
  name: string,
  recMap: Map<string, Recommendation>,
  adjacency: Map<string, string[]>,
  inDegree: Map<string, number>,
  sorted: Recommendation[],
  nextQueue: string[],
  sequence: number
): number {
  const rec = recMap.get(name)!;
  rec.sequence = sequence;
  sorted.push(rec);
  for (const dependent of adjacency.get(name) ?? []) {
    const newDeg = (inDegree.get(dependent) ?? 1) - 1;
    inDegree.set(dependent, newDeg);
    if (newDeg === 0) nextQueue.push(dependent);
  }
  return sequence + 1;
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
      sequence = processQueueItem(name, recMap, adjacency, inDegree, sorted, nextQueue, sequence);
    }
    queue = nextQueue.sort(compare);
  }

  return sorted;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface RecommendOptions {
  /** Maximum number of recommendations to return (default 5). */
  top?: number;
  /** Filter to skills declaring this trigger (e.g. 'on_pr', 'on_milestone'). When set, only skills whose triggers array includes this value are returned. */
  trigger?: string;
  /** Map of skill name → triggers array for trigger-based filtering. Populated from skill.yaml metadata. */
  skillTriggers?: Map<string, string[]>;
}

/**
 * Produce scored, sequenced skill recommendations from a health snapshot
 * and skills index.
 *
 * Combines all three layers:
 * 1. matchHardRules -- critical signals
 * 2. scoreByHealth -- weighted soft scoring
 * 3. sequenceRecommendations -- topological + heuristic ordering
 *
 * Hard rule matches take precedence over soft scores for the same skill.
 */
export function recommend(
  snapshot: HealthSnapshot,
  skills: Record<string, { addresses: SkillAddress[]; dependsOn: string[] }>,
  options: RecommendOptions = {}
): RecommendationResult {
  const top = options.top ?? 5;

  // Empty signals -> no recommendations
  if (snapshot.signals.length === 0) {
    return {
      recommendations: [],
      snapshotAge: 'none',
      sequenceReasoning: 'No active signals detected in health snapshot.',
    };
  }

  // Build merged address index (skill-declared + fallback)
  const addressIndex = buildSkillAddressIndex(skills);

  // Layer 1: hard rules
  const hardRecs = matchHardRules(snapshot, addressIndex);

  // Layer 2: soft scoring
  const softRecs = scoreByHealth(snapshot, addressIndex);

  // Merge: hard rules take precedence
  const hardSkills = new Set(hardRecs.map((r) => r.skillName));
  let merged = [...hardRecs, ...softRecs.filter((r) => !hardSkills.has(r.skillName))];

  // Filter by trigger if specified — only keep skills that declare the requested trigger
  const { trigger, skillTriggers } = options;
  if (trigger && skillTriggers) {
    merged = merged.filter((r) => {
      const triggers = skillTriggers.get(r.skillName);
      return triggers ? triggers.includes(trigger) : true; // keep skills with unknown triggers (fallback rules)
    });
  }

  // Sort by score descending before limiting to top N
  merged.sort((a, b) => b.score - a.score);
  const limited = merged.slice(0, top);

  // Build dependency map from the address index
  const depMap = new Map<string, string[]>();
  for (const [name, entry] of addressIndex) {
    depMap.set(name, entry.dependsOn);
  }

  // Layer 3: sequence
  const sequenced = sequenceRecommendations(limited, depMap);

  // Build reasoning
  const criticalCount = sequenced.filter((r) => r.urgency === 'critical').length;
  const phases = sequenced.map((r) => `${r.sequence}. ${r.skillName}`).join(' -> ');
  const reasoning =
    criticalCount > 0
      ? `${criticalCount} critical issue(s) detected. Sequence: ${phases}. Critical items first, then diagnostic -> fix -> validate heuristic.`
      : `Sequence: ${phases}. Ordered by dependencies and diagnostic -> fix -> validate heuristic.`;

  return {
    recommendations: sequenced,
    snapshotAge: 'fresh',
    sequenceReasoning: reasoning,
  };
}
