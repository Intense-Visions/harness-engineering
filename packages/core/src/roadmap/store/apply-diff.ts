import { isDeepStrictEqual } from 'node:util';
import type { Roadmap, RoadmapFeature, Result } from '@harness-engineering/types';
import { Ok, Err } from '@harness-engineering/types';
import type { RoadmapStore } from './roadmap-store';
import { slugifyFeatureName } from './monolith-store';

/** A feature located within a roadmap: its body plus its milestone + position. */
interface LocatedFeature {
  feature: RoadmapFeature;
  milestone: string;
  order: number;
}

/**
 * Index a roadmap's features by slug. Slug identity = `slugifyFeatureName` of the
 * feature name (D2). Two features whose names slugify identically would silently
 * collapse (last write wins), corrupting one row, so a collision is rejected
 * loudly with `Err` rather than indexed — the data-loss guard for the diff seam.
 */
function indexBySlug(roadmap: Roadmap): Result<Map<string, LocatedFeature>> {
  const map = new Map<string, LocatedFeature>();
  for (const milestone of roadmap.milestones) {
    let order = 0;
    for (const feature of milestone.features) {
      const slug = slugifyFeatureName(feature.name);
      if (map.has(slug)) {
        return Err(
          new Error(
            `Slug collision: two features resolve to slug "${slug}" (e.g. "${feature.name}"). ` +
              `Roadmap rows must have distinct slugs; rename one before writing.`
          )
        );
      }
      map.set(slug, { feature, milestone: milestone.name, order });
      order += 1;
    }
  }
  return Ok(map);
}

/**
 * Diff two in-memory roadmaps and persist the change as the minimal set of
 * single-feature store operations — the seam that lets whole-`Roadmap` producers
 * (`sync`, `groom`, promote-cascade) write conflict-free, one shard per logical
 * change, in sharded mode while staying a whole-file rewrite in monolith mode.
 *
 * Per slug: present only in `after` -> `addFeature`; only in `before` ->
 * `removeFeature`; in both but the feature body differs -> `patchFeature`;
 * unchanged -> no call. Short-circuits and returns the first `Err`.
 *
 * NOTE (D2): identity is by slug. A feature whose body is unchanged but whose
 * milestone placement moved is treated as unchanged here (no reorder op); callers
 * that move features across milestones must express that as their own add/remove.
 */
export async function applyRoadmapDiff(
  store: RoadmapStore,
  before: Roadmap,
  after: Roadmap
): Promise<Result<void>> {
  const beforeIndexed = indexBySlug(before);
  if (!beforeIndexed.ok) return beforeIndexed;
  const afterIndexed = indexBySlug(after);
  if (!afterIndexed.ok) return afterIndexed;
  const beforeMap = beforeIndexed.value;
  const afterMap = afterIndexed.value;

  // Removed: present in before, absent in after.
  for (const slug of beforeMap.keys()) {
    if (!afterMap.has(slug)) {
      const r = await store.removeFeature(slug);
      if (!r.ok) return r;
    }
  }

  // Added or changed: walk after in document order for deterministic op ordering.
  for (const [slug, loc] of afterMap) {
    const prev = beforeMap.get(slug);
    if (!prev) {
      const r = await store.addFeature({
        slug,
        milestone: loc.milestone,
        order: loc.order,
        feature: loc.feature,
      });
      if (!r.ok) return r;
    } else if (!isDeepStrictEqual(prev.feature, loc.feature)) {
      const r = await store.patchFeature(slug, () => loc.feature);
      if (!r.ok) return r;
    }
  }

  // Roadmap-level frontmatter (e.g. lastManualEdit/lastSynced bumps). Monolith
  // rewrites the whole file; the shard backend no-ops (aggregate frontmatter is
  // regenerated from _meta), so this stays single-shard in sharded mode.
  if (!isDeepStrictEqual(before.frontmatter, after.frontmatter)) {
    const r = await store.patchFrontmatter(() => after.frontmatter);
    if (!r.ok) return r;
  }

  // Roadmap-level assignment audit log (appended by claim/release). NOT derivable
  // from shards, so it genuinely persists in both modes (monolith: whole file;
  // sharded: _meta.md only).
  if (!isDeepStrictEqual(before.assignmentHistory ?? [], after.assignmentHistory ?? [])) {
    const r = await store.patchAssignmentHistory(after.assignmentHistory ?? []);
    if (!r.ok) return r;
  }

  return Ok(undefined);
}
