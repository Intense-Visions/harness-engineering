/**
 * Merged-but-unreleased inventory metric — public surface.
 *
 * A pure engine (mirrors `./deployment`) that computes the count and age of
 * changes merged into the mainline but not yet in a published release, against
 * an explicit release-channel denominator, and evaluates cadence thresholds.
 */

export { computeReleaseInventory, describeChannel } from './compute';
export { diffInWholeDays } from './dates';
export { evaluateReleaseInventory } from './evaluate';
export { readPendingChangesets, parseChangesetBumps } from './changesets';
export { DEFAULT_RELEASE_INVENTORY_THRESHOLDS } from './types';
export type {
  ReleaseInventoryGitPort,
  ReleaseInventoryFsPort,
  ReleaseTag,
  ReleaseChannel,
  PendingChangeset,
  UnreleasedCommit,
  ReleaseInventory,
  ReleaseInventoryThresholds,
  ReleaseInventoryStatus,
  ReleaseInventoryBreach,
  ReleaseInventoryResult,
} from './types';
