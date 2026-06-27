import type { Roadmap } from '@harness-engineering/types';
import { slugifyFeatureName } from './monolith-store';
import type { Shard, RoadmapMeta } from './roadmap-store';

/**
 * Decompose a `Roadmap` into per-row shards + roadmap-level `_meta`.
 *
 * Slugs come from `slugifyFeatureName` and are disambiguated deterministically
 * in parsed document order: a colliding base gets `-2`, `-3`, … suffixes, and a
 * name with no alphanumerics (empty slug) falls back to `row-<n>` where `n` is
 * the feature's 1-based position in iteration order. This guarantees every shard
 * filename (`<slug>.md`) is unique and equals its frontmatter `slug`, so
 * `readShardDir`'s duplicate-slug and filename-mismatch guards never trip.
 *
 * `order` is the feature's index WITHIN its milestone (0,1,2,…). Because the
 * assembler sorts by `order` ascending first and these orders are unique per
 * milestone, the round-trip reproduces document order exactly (status/slug
 * tiebreakers never engage). Frontmatter, milestone order, and assignment
 * history are copied verbatim — no timestamps are bumped — so a strict semantic
 * round-trip holds.
 */
export function roadmapToShards(roadmap: Roadmap): { shards: Shard[]; meta: RoadmapMeta } {
  const shards: Shard[] = [];
  const used = new Set<string>();
  let rowCounter = 0;
  for (const milestone of roadmap.milestones) {
    milestone.features.forEach((feature, index) => {
      rowCounter += 1;
      const base = slugifyFeatureName(feature.name) || `row-${rowCounter}`;
      let slug = base;
      let n = 2;
      while (used.has(slug)) slug = `${base}-${n++}`;
      used.add(slug);
      shards.push({ slug, milestone: milestone.name, order: index, feature });
    });
  }
  const meta: RoadmapMeta = {
    frontmatter: roadmap.frontmatter,
    milestones: roadmap.milestones.map((m) => m.name),
    assignmentHistory: roadmap.assignmentHistory ?? [],
  };
  return { shards, meta };
}
