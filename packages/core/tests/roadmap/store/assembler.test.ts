import { describe, it, expect } from 'vitest';
import type { RoadmapMeta, Shard } from '../../../src/roadmap/store/roadmap-store';
import { assembleRoadmap } from '../../../src/roadmap/store/assembler';
import { serializeRoadmap } from '../../../src/roadmap/serialize';
import { parseRoadmap } from '../../../src/roadmap/parse';
import {
  ASSEMBLER_SHARDS,
  ASSEMBLER_META,
  EXPECTED_ROADMAP,
  META,
  META_WITH_HISTORY,
  feat,
} from './fixtures';

describe('assembleRoadmap()', () => {
  it('orders milestones per meta and features by order/status/slug', () => {
    const result = assembleRoadmap(ASSEMBLER_SHARDS, ASSEMBLER_META);
    expect(result).toEqual(EXPECTED_ROADMAP);
  });

  it('marks the Backlog milestone with isBacklog', () => {
    const result = assembleRoadmap(ASSEMBLER_SHARDS, ASSEMBLER_META);
    const backlog = result.milestones.find((m) => m.name === 'Backlog');
    expect(backlog?.isBacklog).toBe(true);
    expect(result.milestones.filter((m) => m.isBacklog)).toHaveLength(1);
  });

  it('carries meta.frontmatter and an empty assignmentHistory', () => {
    const result = assembleRoadmap(ASSEMBLER_SHARDS, ASSEMBLER_META);
    expect(result.frontmatter).toEqual(ASSEMBLER_META.frontmatter);
    expect(result.assignmentHistory).toEqual([]);
  });

  it('threads meta.assignmentHistory into the assembled Roadmap (in order)', () => {
    const result = assembleRoadmap(ASSEMBLER_SHARDS, META_WITH_HISTORY);
    expect(result.assignmentHistory).toEqual(META_WITH_HISTORY.assignmentHistory);
  });

  it('appends a milestone absent from meta.milestones after the ordered ones', () => {
    const result = assembleRoadmap(ASSEMBLER_SHARDS, ASSEMBLER_META);
    expect(result.milestones.map((m) => m.name)).toEqual([
      'MVP Release',
      'v5.0 Hardening',
      'Backlog',
      'Unlisted Milestone',
    ]);
  });

  // B2 regression: a milestone listed in _meta with zero shards must survive as
  // an empty-features milestone (parity with parseRoadmap, which keeps it), in
  // meta order — not be silently dropped.
  it('B2: keeps a meta milestone that has zero shards (empty features)', () => {
    const meta: RoadmapMeta = {
      frontmatter: META.frontmatter,
      milestones: ['MVP Release', 'Empty Milestone', 'Backlog'],
    };
    const shards: Shard[] = [
      { slug: 'a', milestone: 'MVP Release', order: 1, feature: feat('A', 'planned') },
      { slug: 'b', milestone: 'Backlog', order: 1, feature: feat('B', 'backlog') },
    ];
    const result = assembleRoadmap(shards, meta);
    expect(result.milestones.map((m) => m.name)).toEqual([
      'MVP Release',
      'Empty Milestone',
      'Backlog',
    ]);
    const empty = result.milestones.find((m) => m.name === 'Empty Milestone');
    expect(empty).toBeDefined();
    expect(empty?.features).toEqual([]);
  });

  it('B3: breaks slug ties by code-unit order, not locale collation', () => {
    const meta: RoadmapMeta = { frontmatter: META.frontmatter, milestones: ['M'] };
    // Same order + same status -> tiebreak is slug. Code-unit: 'Z'(0x5A) < 'a'(0x61),
    // so 'Z-item' sorts first; locale collation (a < Z) would invert this.
    const shards: Shard[] = [
      { slug: 'a-item', milestone: 'M', order: 1, feature: feat('lower a', 'planned') },
      { slug: 'Z-item', milestone: 'M', order: 1, feature: feat('upper Z', 'planned') },
    ];
    const result = assembleRoadmap(shards, meta);
    expect(result.milestones[0]!.features.map((f) => f.name)).toEqual(['upper Z', 'lower a']);
  });

  it('produces a structurally valid Roadmap (local serialize/parse round-trip)', () => {
    const result = assembleRoadmap(ASSEMBLER_SHARDS, ASSEMBLER_META);
    const md = serializeRoadmap(result);
    const reparsed = parseRoadmap(md);
    expect(reparsed.ok).toBe(true);
    if (reparsed.ok) expect(reparsed.value).toEqual(result);
  });
});
