/**
 * Threshold evaluation for the release-inventory metric.
 *
 * Pure: maps a computed {@link ReleaseInventory} + {@link
 * ReleaseInventoryThresholds} to a {@link ReleaseInventoryResult}. Report-only —
 * the CLI decides whether a breach affects the exit code (`--strict`); the
 * engine only classifies.
 */

import type {
  ReleaseInventory,
  ReleaseInventoryBreach,
  ReleaseInventoryResult,
  ReleaseInventoryStatus,
  ReleaseInventoryThresholds,
} from './types';

/** Does this inventory hold any unshipped work at all? */
function hasInventory(inv: ReleaseInventory): boolean {
  return inv.pendingChangesetCount > 0 || inv.unreleasedCommitCount > 0;
}

/**
 * Evaluate an inventory against thresholds.
 *
 * Breach rules:
 * - A zero-release (`unbounded`) repo that holds any inventory breaches: there
 *   is no release cadence to measure against, so accumulation is unbounded and
 *   the threshold fires (proposal D2 / AC1).
 * - Otherwise each numeric threshold (pending changesets, oldest age, unreleased
 *   merges) fires independently when exceeded.
 *
 * Status: `unbounded` when the repo has no release boundary, else `warn` when
 * any threshold breached, else `ok`.
 */
export function evaluateReleaseInventory(
  inventory: ReleaseInventory,
  thresholds: ReleaseInventoryThresholds
): ReleaseInventoryResult {
  const breaches: ReleaseInventoryBreach[] = [];

  if (inventory.unbounded && hasInventory(inventory)) {
    breaches.push({
      metric: 'unbounded',
      observed: inventory.unreleasedCommitCount,
      threshold: 0,
      detail:
        `No release boundary (${inventory.shippedDefinition}); ` +
        `${inventory.pendingChangesetCount} pending changeset(s) and ` +
        `${inventory.unreleasedCommitCount} unreleased commit(s) accumulate unbounded.`,
    });
  }

  if (inventory.pendingChangesetCount > thresholds.maxPendingChangesets) {
    breaches.push({
      metric: 'pendingChangesets',
      observed: inventory.pendingChangesetCount,
      threshold: thresholds.maxPendingChangesets,
      detail: `${inventory.pendingChangesetCount} pending changesets exceed max ${thresholds.maxPendingChangesets}.`,
    });
  }

  const oldestAge = Math.max(
    inventory.oldestUnreleasedAgeDays ?? 0,
    inventory.oldestChangesetAgeDays ?? 0
  );
  if (oldestAge > thresholds.maxAgeDays) {
    breaches.push({
      metric: 'age',
      observed: oldestAge,
      threshold: thresholds.maxAgeDays,
      detail: `Oldest unreleased change is ${oldestAge}d old, exceeding max ${thresholds.maxAgeDays}d.`,
    });
  }

  if (inventory.unreleasedMergeCount > thresholds.maxUnreleasedMerges) {
    breaches.push({
      metric: 'unreleasedMerges',
      observed: inventory.unreleasedMergeCount,
      threshold: thresholds.maxUnreleasedMerges,
      detail: `${inventory.unreleasedMergeCount} unreleased merges exceed max ${thresholds.maxUnreleasedMerges}.`,
    });
  }

  const breached = breaches.length > 0;
  const status: ReleaseInventoryStatus = inventory.unbounded
    ? 'unbounded'
    : breached
      ? 'warn'
      : 'ok';

  return { status, breached, inventory, thresholds, breaches };
}
