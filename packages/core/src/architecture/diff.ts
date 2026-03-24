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
export function diff(current: MetricResult[], baseline: ArchBaseline): ArchDiffResult {
  const aggregated = aggregateByCategory(current);
  const newViolations: Violation[] = [];
  const resolvedViolations: string[] = [];
  const preExisting: string[] = [];
  const regressions: CategoryRegression[] = [];

  // Track which baseline categories we have visited
  const visitedCategories = new Set<string>();

  // Process each category in the current results
  for (const [category, agg] of aggregated) {
    visitedCategories.add(category);

    const baselineCategory: CategoryBaseline | undefined = baseline.metrics[category];
    const baselineViolationIds = new Set(baselineCategory?.violationIds ?? []);
    const baselineValue = baselineCategory?.value ?? 0;

    // Classify violations
    for (const violation of agg.violations) {
      if (baselineViolationIds.has(violation.id)) {
        preExisting.push(violation.id);
      } else {
        newViolations.push(violation);
      }
    }

    // Find resolved violations (in baseline but not in current)
    const currentViolationIds = new Set(agg.violations.map((v) => v.id));
    if (baselineCategory) {
      for (const id of baselineCategory.violationIds) {
        if (!currentViolationIds.has(id)) {
          resolvedViolations.push(id);
        }
      }
    }

    // Check for aggregate regression.
    // Only report regression for categories that existed in the baseline.
    // New categories are caught via newViolations instead.
    if (baselineCategory && agg.value > baselineValue) {
      regressions.push({
        category,
        baselineValue,
        currentValue: agg.value,
        delta: agg.value - baselineValue,
      });
    }
  }

  // Process baseline categories not present in current results (all resolved)
  for (const [category, baselineCategory] of Object.entries(baseline.metrics)) {
    if (!visitedCategories.has(category) && baselineCategory) {
      for (const id of baselineCategory.violationIds) {
        resolvedViolations.push(id);
      }
    }
  }

  const passed = newViolations.length === 0 && regressions.length === 0;

  return {
    passed,
    newViolations,
    resolvedViolations,
    preExisting,
    regressions,
  };
}
