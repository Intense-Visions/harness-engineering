import type { Roadmap, RoadmapMilestone } from '@harness-engineering/types';
import { STATUS_RANK } from '../status-rank';
import type { Shard, RoadmapMeta } from './roadmap-store';

/**
 * Assemble shards + `_meta` into an in-memory `Roadmap`. Pure function shared by
 * `ShardStore.load()` and the regenerator.
 *
 * Ordering:
 *  - Milestones follow `meta.milestones` exactly (each gets `features: []` when it
 *    has no shards, matching `parseRoadmap`, which keeps empty milestones); any
 *    milestone present in a shard but absent from the list is appended after the
 *    ordered ones, in first-seen order (defensive fallback — the Phase 2 migration
 *    guarantees completeness).
 *  - Features within a milestone: `order` ascending, then status-rank descending
 *    (more-advanced status first), then `slug` ascending.
 *
 * Shard metadata (`slug`/`milestone`/`order`) is discarded after grouping/ordering
 * so the resulting `Roadmap` type is unchanged (spec non-goal: do not redesign it).
 */
export function assembleRoadmap(shards: Shard[], meta: RoadmapMeta): Roadmap {
  const byMilestone = groupShardsByMilestone(shards);
  const ordered = orderMilestoneNames(meta, byMilestone);
  const milestones: RoadmapMilestone[] = ordered.map((name) => buildMilestone(name, byMilestone));

  return {
    frontmatter: meta.frontmatter,
    milestones,
    assignmentHistory: meta.assignmentHistory ?? [],
  };
}

/** Group shards by their milestone, preserving first-seen insertion order. */
function groupShardsByMilestone(shards: Shard[]): Map<string, Shard[]> {
  const byMilestone = new Map<string, Shard[]>();
  for (const shard of shards) {
    const bucket = byMilestone.get(shard.milestone);
    if (bucket) bucket.push(shard);
    else byMilestone.set(shard.milestone, [shard]);
  }
  return byMilestone;
}

/**
 * Milestone order: every meta.milestone (even with zero shards, so empty
 * milestones survive — parity with parseRoadmap), then any unlisted milestones
 * present only in shards, in first-seen order (Map preserves insertion order).
 */
function orderMilestoneNames(meta: RoadmapMeta, byMilestone: Map<string, Shard[]>): string[] {
  const ordered: string[] = [];
  const seen = new Set<string>();
  const append = (name: string) => {
    if (!seen.has(name)) {
      ordered.push(name);
      seen.add(name);
    }
  };
  for (const name of meta.milestones) append(name);
  for (const name of byMilestone.keys()) append(name);
  return ordered;
}

/**
 * Feature ordering within a milestone: `order` ascending, then status-rank
 * descending (more-advanced status first), then `slug` ascending.
 */
function compareShards(a: Shard, b: Shard): number {
  return (
    a.order - b.order ||
    STATUS_RANK[b.feature.status] - STATUS_RANK[a.feature.status] ||
    // Deterministic code-unit comparison (NOT localeCompare, whose ICU/locale
    // collation is environment-dependent and threatens byte-stable regen).
    (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0)
  );
}

/** Build a single ordered milestone from its grouped shards. */
function buildMilestone(name: string, byMilestone: Map<string, Shard[]>): RoadmapMilestone {
  const bucket = [...(byMilestone.get(name) ?? [])];
  bucket.sort(compareShards);
  return {
    name,
    isBacklog: name === 'Backlog',
    features: bucket.map((s) => s.feature),
  };
}
