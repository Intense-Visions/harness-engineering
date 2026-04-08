import type {
  MetricResult,
  ArchBaseline,
  ArchDiffResult,
  CategoryRegression,
  Violation,
  CategoryBaseline,
  ArchMetricCategory,
} from './types';

interface AggregatedCategory {
  value: number;
  violations: Violation[];
}

/**
 * Aggregate MetricResult[] by category, summing values and concatenating violations.
 */
function aggregateByCategory(results: MetricResult[]): Map<ArchMetricCategory, AggregatedCategory> {
  const map = new Map<ArchMetricCategory, AggregatedCategory>();
  for (const result of results) {
    const existing = map.get(result.category);
    if (existing) {
      existing.value += result.value;
      existing.violations.push(...result.violations);
    } else {
      map.set(result.category, {
        value: result.value,
        violations: [...result.violations],
      });
    }
  }
  return map;
}

/**
 * Diff current metric results against a stored baseline.
 *
 * Pure function implementing the ratchet logic:
 * - New violations (in current but not baseline) cause failure
 * - Aggregate value exceeding baseline causes failure (regression)
 * - Pre-existing violations (in both) are allowed
 * - Resolved violations (in baseline but not current) are celebrated
 *
 * Categories present in current but absent from the baseline are treated
 * as having an empty baseline (value: 0, no known violations), so any
 * violations in those categories are considered new.
 */
/**
 * Classify violations in a category as new or pre-existing.
 */
function classifyViolations(
  violations: Violation[],
  baselineViolationIds: Set<string>
): { newViolations: Violation[]; preExisting: string[] } {
  const newViolations: Violation[] = [];
  const preExisting: string[] = [];
  for (const violation of violations) {
    if (baselineViolationIds.has(violation.id)) {
      preExisting.push(violation.id);
    } else {
      newViolations.push(violation);
    }
  }
  return { newViolations, preExisting };
}

/**
 * Find violations in baseline that are no longer in current.
 */
function findResolvedViolations(
  baselineCategory: CategoryBaseline | undefined,
  currentViolationIds: Set<string>
): string[] {
  if (!baselineCategory) return [];
  return baselineCategory.violationIds.filter((id) => !currentViolationIds.has(id));
}

/**
 * Collect resolved violations from baseline categories not present in current results.
 */
function collectOrphanedBaselineViolations(
  baseline: ArchBaseline,
  visitedCategories: Set<string>
): string[] {
  const resolved: string[] = [];
  for (const [category, baselineCategory] of Object.entries(baseline.metrics)) {
    if (!visitedCategories.has(category) && baselineCategory) {
      resolved.push(...baselineCategory.violationIds);
    }
  }
  return resolved;
}

interface CategoryDiffAccumulator {
  newViolations: Violation[];
  resolvedViolations: string[];
  preExisting: string[];
  regressions: CategoryRegression[];
}

/**
 * Process a single aggregated category against its baseline entry and accumulate diff results.
 */
function diffCategory(
  category: ArchMetricCategory,
  agg: AggregatedCategory,
  baselineCategory: CategoryBaseline | undefined,
  acc: CategoryDiffAccumulator
): void {
  const baselineViolationIds = new Set(baselineCategory?.violationIds ?? []);
  const baselineValue = baselineCategory?.value ?? 0;

  const classified = classifyViolations(agg.violations, baselineViolationIds);
  acc.newViolations.push(...classified.newViolations);
  acc.preExisting.push(...classified.preExisting);

  const currentViolationIds = new Set(agg.violations.map((v) => v.id));
  acc.resolvedViolations.push(...findResolvedViolations(baselineCategory, currentViolationIds));

  if (baselineCategory && agg.value > baselineValue) {
    acc.regressions.push({
      category,
      baselineValue,
      currentValue: agg.value,
      delta: agg.value - baselineValue,
    });
  }
}

export function diff(current: MetricResult[], baseline: ArchBaseline): ArchDiffResult {
  const aggregated = aggregateByCategory(current);
  const acc: CategoryDiffAccumulator = {
    newViolations: [],
    resolvedViolations: [],
    preExisting: [],
    regressions: [],
  };
  const visitedCategories = new Set<string>();

  for (const [category, agg] of aggregated) {
    visitedCategories.add(category);
    diffCategory(category, agg, baseline.metrics[category], acc);
  }

  acc.resolvedViolations.push(...collectOrphanedBaselineViolations(baseline, visitedCategories));

  return {
    passed: acc.newViolations.length === 0 && acc.regressions.length === 0,
    newViolations: acc.newViolations,
    resolvedViolations: acc.resolvedViolations,
    preExisting: acc.preExisting,
    regressions: acc.regressions,
  };
}
