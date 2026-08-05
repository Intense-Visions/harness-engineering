import { minimatch } from 'minimatch';
import type { PlanTask } from '@harness-engineering/types';

/**
 * Owned-files declaration overlap forecasting (roadmap #601).
 *
 * A task's `owns:[paths]` field declares the source paths/globs a task claims.
 * Two tasks whose owned paths overlap may conflict if dispatched in parallel.
 * This module provides the cheap, deterministic, graph-free forecast — a
 * near-free parallel-safety guardrail that runs alongside the heavier
 * graph-based independence analysis (check_task_independence).
 */

// Enable dot so an owned glob like `src/**` also covers dotfiles under it.
const MATCH_OPTS = { dot: true } as const;

/**
 * True when two path patterns could match a common path — i.e. their owned
 * footprints overlap. Symmetric and deterministic.
 *
 * A bare path is a trivial glob, so this reduces to string equality for two
 * concrete paths, matches a concrete path against a covering glob (e.g.
 * `src/api/**` vs `src/api/users.ts`), and — via globstar — treats a narrower
 * glob nested under a broader one as overlapping (e.g. `src/**` vs
 * `src/api/**`). Two disjoint globs (`src/api/**` vs `src/web/**`) do not
 * overlap.
 */
export function pathsOverlap(a: string, b: string): boolean {
  if (a === b) return true;
  // Test each pattern as a literal string against the other treated as a glob.
  return minimatch(a, b, MATCH_OPTS) || minimatch(b, a, MATCH_OPTS);
}

/** A single overlapping pair of owned patterns between two tasks. */
export interface OwnershipOverlap {
  /** The owned pattern contributed by taskA. */
  readonly ownedByA: string;
  /** The owned pattern contributed by taskB. */
  readonly ownedByB: string;
}

/** A forecast that two tasks' owned paths overlap (potential parallel conflict). */
export interface OwnershipConflict {
  readonly taskA: string;
  readonly taskB: string;
  /** Every overlapping (ownedByA, ownedByB) pattern pair. Never empty. */
  readonly overlaps: readonly OwnershipOverlap[];
}

/**
 * Every overlapping (ownedByA, ownedByB) pattern pair between two owned-path
 * lists, in stable (ownsA × ownsB) declaration order.
 */
function overlappingPatternPairs(
  ownsA: readonly string[],
  ownsB: readonly string[]
): OwnershipOverlap[] {
  const overlaps: OwnershipOverlap[] = [];
  for (const ownedByA of ownsA) {
    for (const ownedByB of ownsB) {
      if (pathsOverlap(ownedByA, ownedByB)) overlaps.push({ ownedByA, ownedByB });
    }
  }
  return overlaps;
}

/**
 * Deterministic pre-execution forecast of parallel conflicts implied by
 * `owns:[paths]` declarations.
 *
 * For every unordered task pair where BOTH tasks declare `owns`, flag the pair
 * when any owned pattern of one overlaps any owned pattern of the other.
 * Tasks without `owns` (or with an empty `owns`) contribute nothing — absent
 * declarations preserve current behavior exactly (no-op).
 *
 * Output order is stable: pairs follow input order, and each pair's `overlaps`
 * follow (ownsA × ownsB) declaration order.
 */
export function forecastOwnershipConflicts(tasks: readonly PlanTask[]): OwnershipConflict[] {
  const conflicts: OwnershipConflict[] = [];
  const declaring = tasks.filter((t) => (t.owns ?? []).length > 0);

  for (let i = 0; i < declaring.length; i++) {
    const a = declaring[i]!;
    for (let j = i + 1; j < declaring.length; j++) {
      const b = declaring[j]!;
      const overlaps = overlappingPatternPairs(a.owns!, b.owns!);
      if (overlaps.length > 0) conflicts.push({ taskA: a.id, taskB: b.id, overlaps });
    }
  }

  return conflicts;
}
