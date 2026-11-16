import type { MetricResult, Violation } from './types';

/** Locale-independent code-unit comparison, so the order is identical on every machine. */
function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Total order over violations: file, then detail, then the stable id. The id is a
 * content hash, so two violations that tie on all three are indistinguishable.
 */
export function compareViolations(a: Violation, b: Violation): number {
  return cmp(a.file, b.file) || cmp(a.detail, b.detail) || cmp(a.id, b.id);
}

/**
 * Return `results` in a canonical order that does not depend on file-discovery or
 * analysis completion order (#2564).
 *
 * Collectors glob and analyze files concurrently, so the order of each result's
 * `violations` — and of several results sharing a category — follows whichever
 * async task finished first. Everything downstream (the `check-arch --json` report,
 * `diff()`, the baseline and timeline writers) preserves that order, so an unchanged
 * tree produced byte-different output run to run. Sorting once at the boundary
 * makes those outputs a pure function of the result *set*.
 *
 * Order: category, then scope, then each result's sorted violations; any remaining
 * tie falls back to the canonical serialization. Pure — inputs are not mutated.
 */
export function sortMetricResults(results: readonly MetricResult[]): MetricResult[] {
  const keyed = results.map((r) => {
    const sorted: MetricResult = { ...r, violations: [...r.violations].sort(compareViolations) };
    return { result: sorted, key: JSON.stringify(sorted) };
  });
  keyed.sort(
    (a, b) =>
      cmp(a.result.category, b.result.category) ||
      cmp(a.result.scope, b.result.scope) ||
      cmp(a.key, b.key)
  );
  return keyed.map((k) => k.result);
}
