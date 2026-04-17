import type {
  ArchMetricCategory,
  EmergenceConfidence,
  EmergenceResult,
  EmergentConstraintSuggestion,
  ViolationHistory,
} from './types';
import { constraintRuleId } from './collectors/hash';
import { clusterViolations } from './cluster-violations';

const MAX_SAMPLES = 5;
const DEFAULT_WINDOW_WEEKS = 4;
const DEFAULT_MIN_OCCURRENCES = 3;

function assignConfidence(
  occurrences: number,
  uniqueFiles: number,
  minOccurrences: number
): EmergenceConfidence {
  if (occurrences >= 2 * minOccurrences && uniqueFiles >= 3) return 'high';
  if (uniqueFiles >= 2) return 'medium';
  return 'low';
}

/**
 * Detect emergent constraint suggestions from violation history.
 * Clusters violations by (category, normalized pattern, directory scope) and
 * suggests new constraint rules when a cluster exceeds the occurrence threshold.
 */
export function detectEmergentConstraints(
  history: ViolationHistory,
  options: {
    windowWeeks?: number;
    minOccurrences?: number;
    category?: ArchMetricCategory;
  }
): EmergenceResult {
  const windowWeeks = options.windowWeeks ?? DEFAULT_WINDOW_WEEKS;
  const minOccurrences = options.minOccurrences ?? DEFAULT_MIN_OCCURRENCES;

  const clusters = clusterViolations(history.snapshots, windowWeeks);

  let totalViolationsAnalyzed = 0;
  const suggestions: EmergentConstraintSuggestion[] = [];

  for (const cluster of clusters) {
    totalViolationsAnalyzed += cluster.violations.length;

    if (options.category && cluster.category !== options.category) continue;
    if (cluster.violations.length < minOccurrences) continue;

    const occurrences = cluster.violations.length;
    const uniqueFiles = cluster.uniqueFiles.size;
    const confidence = assignConfidence(occurrences, uniqueFiles, minOccurrences);

    const description = `Emergent: ${cluster.pattern} in ${cluster.scope}`;
    const ruleId = constraintRuleId(cluster.category, cluster.scope, description);

    const sampleViolations = cluster.violations.slice(0, MAX_SAMPLES).map((v) => v.violation);

    suggestions.push({
      suggestedRule: {
        id: ruleId,
        category: cluster.category,
        description,
        scope: cluster.scope,
      },
      confidence,
      occurrences,
      uniqueFiles,
      pattern: cluster.pattern,
      sampleViolations,
      rationale: `Pattern "${cluster.pattern}" observed ${occurrences} times across ${uniqueFiles} file(s) in ${cluster.scope} within ${windowWeeks} weeks.`,
    });
  }

  suggestions.sort((a, b) => b.occurrences - a.occurrences);

  return { suggestions, totalViolationsAnalyzed, windowWeeks, minOccurrences };
}
