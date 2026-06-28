import { isDeepStrictEqual } from 'node:util';
import type { Roadmap, RoadmapFeature, Result } from '@harness-engineering/types';
import { Ok } from '@harness-engineering/types';
import type { RoadmapStore } from './roadmap-store';
import { slugifyFeatureName } from './monolith-store';

/** A feature located within a roadmap: its body plus its milestone + position. */
interface LocatedFeature {
  feature: RoadmapFeature;
  milestone: string;
  order: number;
}

/**
 * Index a roadmap's features by slug. Assumes slug identity = `slugifyFeatureName`
 * of the feature name (D2) and that each slug is unique within the roadmap (the
 * store's integrity guards enforce this on write).
 */
function indexBySlug(roadmap: Roadmap): Map<string, LocatedFeature> {
  const map = new Map<string, LocatedFeature>();
  for (const milestone of roadmap.milestones) {
    milestone.features.forEach((feature, order) => {
      map.set(slugifyFeatureName(feature.name), { feature, milestone: milestone.name, order });
    });
  }
  return map;
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
  const beforeMap = indexBySlug(before);
  const afterMap = indexBySlug(after);

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
