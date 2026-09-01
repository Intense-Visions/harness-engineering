/**
 * Pure computation of the merged-but-unreleased inventory.
 *
 * Given injected git + fs ports and a reference `now`, resolves the release
 * boundary (latest tag matching the channel pattern), gathers the commits and
 * changesets sitting between that boundary and HEAD, and ages them. No wall
 * clock, no direct IO — every side-effecting read is injected (proposal D4/D5).
 */

import { readPendingChangesets } from './changesets';
import { diffInWholeDays } from './dates';
import type {
  ReleaseChannel,
  ReleaseInventory,
  ReleaseInventoryFsPort,
  ReleaseInventoryGitPort,
  UnreleasedCommit,
} from './types';

/** Human-readable denominator string for a channel (the "shipped" definition). */
export function describeChannel(channel: ReleaseChannel): string {
  return `git tags matching "${channel.pattern}"`;
}

/** Age in whole days of the oldest commit in a list, or null when none/undated. */
function oldestCommitAgeDays(commits: UnreleasedCommit[], now: Date): number | null {
  let oldest: number | null = null;
  for (const c of commits) {
    if (!c.date) continue;
    const t = new Date(c.date).getTime();
    if (Number.isNaN(t)) continue;
    if (oldest === null || t < oldest) oldest = t;
  }
  if (oldest === null) return null;
  return diffInWholeDays(now, new Date(oldest));
}

/** Age in whole days of the oldest pending changeset, or null when none/undated. */
function oldestChangesetAgeDays(ages: Array<number | null>): number | null {
  let max: number | null = null;
  for (const a of ages) {
    if (a === null) continue;
    if (max === null || a > max) max = a;
  }
  return max;
}

/**
 * Compute the merged-but-unreleased inventory for a repository.
 *
 * The denominator (`channel` / `shippedDefinition`) is always carried (AC2).
 * When no tag matches the pattern, the repo is a zero-release repo: `unbounded`
 * is true, `lastRelease` is null, and the entire mainline history is inventory
 * (AC3) — the metric is present, never omitted.
 */
export function computeReleaseInventory(
  gitPort: ReleaseInventoryGitPort,
  fsPort: ReleaseInventoryFsPort,
  channel: ReleaseChannel,
  now: Date
): ReleaseInventory {
  const tags = gitPort.listReleaseTags(channel.pattern);
  const lastRelease = tags.length > 0 ? (tags[0] ?? null) : null;
  const unbounded = lastRelease === null;

  const unreleasedCommits = gitPort.commitsSince(lastRelease ? lastRelease.name : null);
  const unreleasedMergeCount = unreleasedCommits.filter((c) => c.isMerge).length;

  const pendingChangesets = readPendingChangesets(fsPort, gitPort, now);

  return {
    channel,
    shippedDefinition: describeChannel(channel),
    lastRelease,
    unbounded,
    pendingChangesets,
    pendingChangesetCount: pendingChangesets.length,
    oldestChangesetAgeDays: oldestChangesetAgeDays(pendingChangesets.map((c) => c.ageDays)),
    unreleasedCommits,
    unreleasedCommitCount: unreleasedCommits.length,
    unreleasedMergeCount,
    oldestUnreleasedAgeDays: oldestCommitAgeDays(unreleasedCommits, now),
  };
}
