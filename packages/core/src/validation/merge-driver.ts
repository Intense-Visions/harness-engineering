/**
 * Merge-driver doctor helper (Phase 3, roadmap shard store).
 *
 * `.gitattributes` declares generated aggregates (e.g. `docs/roadmap.md`) as
 * `merge=ours` so merges never re-introduce stale conflicts. That attribute is
 * inert unless the clone configures the driver once:
 *
 *   git config merge.ours.driver true
 *
 * This pure helper lets `harness validate` warn an existing clone that declares
 * `merge=ours` but has not configured the driver. It does no I/O — callers pass
 * the `.gitattributes` content and whether the driver is configured.
 */

/**
 * Returns `true` when at least one uncommented `.gitattributes` line declares a
 * `merge=ours` strategy AND the `merge.ours.driver` git config is not set.
 *
 * Commented lines (leading `#`, ignoring surrounding whitespace) are skipped so
 * documentation examples never trigger a false warning.
 */
export function needsMergeOursDriverWarning(
  gitattributesContent: string,
  driverConfigured: boolean
): boolean {
  if (driverConfigured) return false;

  return gitattributesContent.split(/\r?\n/).some((rawLine) => {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith('#')) return false;
    return /\bmerge=ours\b/.test(line);
  });
}
