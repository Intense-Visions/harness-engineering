import { describe, it, expect } from 'vitest';
import { scoreRoadmapCandidatesForMode } from '../../src/roadmap/pilot-scoring';
import type { Roadmap } from '@harness-engineering/types';

const emptyRoadmap: Roadmap = {
  frontmatter: { lastManualEdit: null },
  milestones: [],
  assignmentHistory: [],
} as never;

describe('scoreRoadmapCandidatesForMode — Phase 3 stub', () => {
  it('throws when config.roadmap.mode === "file-less"', () => {
    expect(() =>
      scoreRoadmapCandidatesForMode(emptyRoadmap, {}, { roadmap: { mode: 'file-less' } })
    ).toThrowError(
      /file-less roadmap mode is not yet wired in roadmap-pilot scoring; see Phase 4\./
    );
  });

  it('delegates to scoreRoadmapCandidates when mode is absent', () => {
    const result = scoreRoadmapCandidatesForMode(emptyRoadmap, {}, undefined);
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });

  it('delegates when mode === "file-backed"', () => {
    const result = scoreRoadmapCandidatesForMode(
      emptyRoadmap,
      {},
      { roadmap: { mode: 'file-backed' } }
    );
    expect(Array.isArray(result)).toBe(true);
  });
});
