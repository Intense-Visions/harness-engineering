import { describe, it, expect } from 'vitest';
import {
  scoreRoadmapCandidatesForMode,
  scoreRoadmapCandidates,
} from '../../src/roadmap/pilot-scoring';
import type { Roadmap, RoadmapFeature } from '@harness-engineering/types';

const emptyRoadmap: Roadmap = {
  frontmatter: { lastManualEdit: null },
  milestones: [],
  assignmentHistory: [],
} as never;

const mkFeat = (over: Partial<RoadmapFeature>): RoadmapFeature => ({
  name: over.name ?? 'F',
  status: over.status ?? 'planned',
  spec: null,
  plans: [],
  blockedBy: over.blockedBy ?? [],
  summary: '',
  assignee: null,
  priority: over.priority ?? null,
  externalId: over.externalId ?? null,
  updatedAt: over.updatedAt ?? null,
});

// Build a roadmap with one milestone carrying the given features. The features
// also carry tracker-style fields via the adapter (createdAt defaulted).
const mkRoadmap = (features: RoadmapFeature[]): Roadmap =>
  ({
    frontmatter: { lastManualEdit: null },
    milestones: [
      {
        name: 'M1',
        isBacklog: false,
        features,
      },
    ],
    assignmentHistory: [],
  }) as never;

describe('scoreRoadmapCandidatesForMode — file-less dispatch (Task 5)', () => {
  it('delegates to file-less scorer producing priority+createdAt sort', () => {
    // Two P0 features with externalId encoding createdAt order via name.
    // The file-less scorer reads createdAt from RoadmapFeature; since RoadmapFeature
    // has no createdAt, the adapter defaults to '1970-01-01T00:00:00Z' — making
    // ordering deterministic by priority alone here.
    const features = [
      mkFeat({ name: 'low', priority: 'P1' }),
      mkFeat({ name: 'high', priority: 'P0' }),
      mkFeat({ name: 'none', priority: null }),
    ];
    const result = scoreRoadmapCandidatesForMode(
      mkRoadmap(features),
      {},
      {
        roadmap: { mode: 'file-less' },
      }
    );
    const names = result.map((c) => c.feature.name);
    expect(names).toEqual(['high', 'low', 'none']);
  });

  it('file-backed regression: delegates to scoreRoadmapCandidates when mode is absent', () => {
    const result = scoreRoadmapCandidatesForMode(emptyRoadmap, {}, undefined);
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });

  it('file-backed regression: delegates when mode === "file-backed"', () => {
    const result = scoreRoadmapCandidatesForMode(
      emptyRoadmap,
      {},
      { roadmap: { mode: 'file-backed' } }
    );
    expect(Array.isArray(result)).toBe(true);
  });

  it('file-backed and file-less produce equivalent output on empty input', () => {
    const fb = scoreRoadmapCandidatesForMode(
      emptyRoadmap,
      {},
      { roadmap: { mode: 'file-backed' } }
    );
    const fl = scoreRoadmapCandidatesForMode(emptyRoadmap, {}, { roadmap: { mode: 'file-less' } });
    expect(fb).toEqual([]);
    expect(fl).toEqual([]);
  });

  it('file-backed and file-less produce DIFFERENT orderings on the same fixture (D4 break)', () => {
    // Fixture designed so weighted scoring (file-backed) re-orders WITHIN a
    // priority tier — proving the two algorithms genuinely diverge, not just
    // happening to coincide on tier-monotonic inputs.
    //
    // Setup:
    //   X (P1, position 1, no dependents)        — eligible
    //   Y (P1, position 2, 1 dependent via Z)    — eligible
    //   Z (P0, position 3, blocked by Y)         — ineligible (Y not done)
    //
    // file-backed within-tier weighted score:
    //   X: 0.5 * (1 - 0/3) + 0.3 * 0    = 0.500
    //   Y: 0.5 * (1 - 1/3) + 0.3 * 1.0  = 0.633  ← wins tier
    //   → [Y, X]
    //
    // file-less D4 (priority+createdAt; createdAt all default-equal):
    //   Stable sort on equal keys preserves insertion order.
    //   → [X, Y]
    const features = [
      mkFeat({ name: 'x', priority: 'P1' }),
      mkFeat({ name: 'y', priority: 'P1' }),
      mkFeat({ name: 'z', priority: 'P0', blockedBy: ['y'] }),
    ];
    const fb = scoreRoadmapCandidatesForMode(
      mkRoadmap(features),
      {},
      {
        roadmap: { mode: 'file-backed' },
      }
    );
    const fl = scoreRoadmapCandidatesForMode(
      mkRoadmap(features),
      {},
      {
        roadmap: { mode: 'file-less' },
      }
    );
    const fbNames = fb.map((c) => c.feature.name);
    const flNames = fl.map((c) => c.feature.name);
    // Both algorithms should yield the same set of eligible features (X and Y;
    // Z is blocked by Y which is not done).
    expect(new Set(fbNames)).toEqual(new Set(['x', 'y']));
    expect(new Set(flNames)).toEqual(new Set(['x', 'y']));
    // The orderings must DIFFER — this is the D4 proof.
    expect(fbNames).toEqual(['y', 'x']);
    expect(flNames).toEqual(['x', 'y']);
    expect(fbNames).not.toEqual(flNames);
    // Sanity: file-backed has positionScore set (real scoring); file-less has zeros.
    expect(fb.every((c) => c.positionScore > 0)).toBe(true);
    expect(fl.every((c) => c.positionScore === 0)).toBe(true);
  });

  it('file-backed parity: result equals scoreRoadmapCandidates direct call', () => {
    const features = [mkFeat({ name: 'a', priority: 'P1' }), mkFeat({ name: 'b', priority: 'P0' })];
    const r1 = scoreRoadmapCandidatesForMode(mkRoadmap(features), {}, undefined);
    const r2 = scoreRoadmapCandidates(mkRoadmap(features), {});
    expect(r1).toEqual(r2);
  });
});
