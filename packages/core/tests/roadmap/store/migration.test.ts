import { describe, it, expect } from 'vitest';
import { roadmapToShards } from '../../../src/roadmap/store/migration';
import { MIGRATION_ROADMAP } from './fixtures';

describe('roadmapToShards()', () => {
  it('decomposes a Roadmap into per-row shards + roadmap-level meta', () => {
    const { shards, meta } = roadmapToShards(MIGRATION_ROADMAP);
    // One shard per feature across all milestones.
    expect(shards).toHaveLength(5);
    expect(meta.milestones).toEqual(['MVP Release', 'v5.0 Hardening', 'Backlog']);
  });

  it('disambiguates colliding slugs deterministically in document order', () => {
    const { shards } = roadmapToShards(MIGRATION_ROADMAP);
    const slugs = shards.map((s) => s.slug);
    // `Fix login` and `Fix: login!` both slugify to `fix-login`.
    expect(slugs[0]).toBe('fix-login');
    expect(slugs[1]).toBe('fix-login-2');
    // `Token bypass guard` is unique.
    expect(slugs[2]).toBe('token-bypass-guard');
    // `!!!` has no alphanumerics -> `row-<n>` fallback (4th feature in iteration order).
    expect(slugs[3]).toBe('row-4');
    expect(slugs[4]).toBe('future-idea');
  });

  it('all slugs are distinct (so readShardDir guards never trip)', () => {
    const { shards } = roadmapToShards(MIGRATION_ROADMAP);
    const slugs = shards.map((s) => s.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('assigns order = feature index within its source milestone; milestone matches source', () => {
    const { shards } = roadmapToShards(MIGRATION_ROADMAP);
    const bySlug = Object.fromEntries(shards.map((s) => [s.slug, s]));
    expect(bySlug['fix-login']).toMatchObject({ milestone: 'MVP Release', order: 0 });
    expect(bySlug['fix-login-2']).toMatchObject({ milestone: 'MVP Release', order: 1 });
    expect(bySlug['token-bypass-guard']).toMatchObject({ milestone: 'v5.0 Hardening', order: 0 });
    expect(bySlug['row-4']).toMatchObject({ milestone: 'v5.0 Hardening', order: 1 });
    expect(bySlug['future-idea']).toMatchObject({ milestone: 'Backlog', order: 0 });
  });

  it('carries the feature body verbatim into each shard', () => {
    const { shards } = roadmapToShards(MIGRATION_ROADMAP);
    expect(shards[0]!.feature).toBe(MIGRATION_ROADMAP.milestones[0]!.features[0]);
  });

  it('copies frontmatter, milestone order, and assignment history into meta', () => {
    const { meta } = roadmapToShards(MIGRATION_ROADMAP);
    // Same reference values — migration must not bump timestamps.
    expect(meta.frontmatter).toBe(MIGRATION_ROADMAP.frontmatter);
    expect(meta.milestones).toEqual(MIGRATION_ROADMAP.milestones.map((m) => m.name));
    expect(meta.assignmentHistory).toEqual(MIGRATION_ROADMAP.assignmentHistory);
  });
});
