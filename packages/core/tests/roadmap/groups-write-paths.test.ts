import { describe, it, expect } from 'vitest';
import { serializeRoadmap } from '../../src/roadmap/serialize';
import { findUnpreservedLines } from '../../src/roadmap/preservation';
import { roadmapToShards, assertSemanticRoundTrip } from '../../src/roadmap/store/migration';
import { GROUPED_ROADMAP } from './fixtures';

describe('narrative groups vs the monolith write-preservation guard', () => {
  it('reports group-body lines, so a whole-file rewrite is refused rather than destructive', () => {
    const lost = findUnpreservedLines(serializeRoadmap(GROUPED_ROADMAP));
    expect(lost.length).toBeGreaterThan(0);
    expect(lost.map((l) => l.text)).toContain('- Status: shipped in spirit, not in bytes.');
  });

  it('does not report the group marker heading itself', () => {
    const lost = findUnpreservedLines(serializeRoadmap(GROUPED_ROADMAP));
    expect(lost.map((l) => l.text)).not.toContain('### Group: Narrative arc');
  });
});

describe('narrative groups vs monolith → shard migration (sharded mode stays strict)', () => {
  it('aborts the shard round-trip instead of silently dropping groups', () => {
    const { shards, meta } = roadmapToShards(GROUPED_ROADMAP);
    const result = assertSemanticRoundTrip(GROUPED_ROADMAP, shards, meta);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain('round-trip');
  });

  it('emits no shard for a group section', () => {
    const { shards } = roadmapToShards(GROUPED_ROADMAP);
    expect(shards.map((s) => s.feature.name)).toEqual(['Ship the parser']);
  });
});
