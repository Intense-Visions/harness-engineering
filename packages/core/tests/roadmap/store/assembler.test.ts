import { describe, it, expect } from 'vitest';
import { assembleRoadmap } from '../../../src/roadmap/store/assembler';
import { serializeRoadmap } from '../../../src/roadmap/serialize';
import { parseRoadmap } from '../../../src/roadmap/parse';
import { ASSEMBLER_SHARDS, ASSEMBLER_META, EXPECTED_ROADMAP } from './fixtures';

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

  it('appends a milestone absent from meta.milestones after the ordered ones', () => {
    const result = assembleRoadmap(ASSEMBLER_SHARDS, ASSEMBLER_META);
    expect(result.milestones.map((m) => m.name)).toEqual([
      'MVP Release',
      'v5.0 Hardening',
      'Backlog',
      'Unlisted Milestone',
    ]);
  });

  it('produces a structurally valid Roadmap (local serialize/parse round-trip)', () => {
    const result = assembleRoadmap(ASSEMBLER_SHARDS, ASSEMBLER_META);
    const md = serializeRoadmap(result);
    const reparsed = parseRoadmap(md);
    expect(reparsed.ok).toBe(true);
    if (reparsed.ok) expect(reparsed.value).toEqual(result);
  });
});
