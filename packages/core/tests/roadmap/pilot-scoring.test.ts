import { describe, it, expect } from 'vitest';
import {
  scoreRoadmapCandidates,
  type ScoredCandidate,
  type PilotScoringOptions,
} from '../../src/roadmap/pilot-scoring';
import type { Roadmap, RoadmapFeature } from '@harness-engineering/types';

function makeFeature(overrides?: Partial<RoadmapFeature>): RoadmapFeature {
  return {
    name: 'Test Feature',
    status: 'planned',
    spec: null,
    plans: [],
    blockedBy: [],
    summary: 'A test feature',
    assignee: null,
    priority: null,
    externalId: null,
    ...overrides,
  };
}

function makeRoadmap(
  milestoneFeatures: Array<{ name: string; isBacklog: boolean; features: RoadmapFeature[] }>
): Roadmap {
  return {
    frontmatter: {
      project: 'test',
      version: 1,
      lastSynced: '2026-04-01T00:00:00Z',
      lastManualEdit: '2026-04-01T00:00:00Z',
    },
    milestones: milestoneFeatures.map((m) => ({
      name: m.name,
      isBacklog: m.isBacklog,
      features: m.features,
    })),
    assignmentHistory: [],
  };
}

describe('scoreRoadmapCandidates()', () => {
  describe('filtering', () => {
    it('includes only planned and backlog items', () => {
      const roadmap = makeRoadmap([
        {
          name: 'M1',
          isBacklog: false,
          features: [
            makeFeature({ name: 'Planned', status: 'planned' }),
            makeFeature({ name: 'InProgress', status: 'in-progress' }),
            makeFeature({ name: 'Done', status: 'done' }),
            makeFeature({ name: 'Blocked', status: 'blocked' }),
          ],
        },
        {
          name: 'Backlog',
          isBacklog: true,
          features: [makeFeature({ name: 'BacklogItem', status: 'backlog' })],
        },
      ]);

      const candidates = scoreRoadmapCandidates(roadmap);
      const names = candidates.map((c) => c.feature.name);
      expect(names).toContain('Planned');
      expect(names).toContain('BacklogItem');
      expect(names).not.toContain('InProgress');
      expect(names).not.toContain('Done');
      expect(names).not.toContain('Blocked');
    });

    it('excludes items with unresolved blockers', () => {
      const roadmap = makeRoadmap([
        {
          name: 'M1',
          isBacklog: false,
          features: [
            makeFeature({ name: 'Dependency', status: 'in-progress' }),
            makeFeature({ name: 'Blocked', status: 'planned', blockedBy: ['Dependency'] }),
            makeFeature({ name: 'Free', status: 'planned' }),
          ],
        },
      ]);

      const candidates = scoreRoadmapCandidates(roadmap);
      const names = candidates.map((c) => c.feature.name);
      expect(names).toContain('Free');
      expect(names).not.toContain('Blocked');
      expect(names).not.toContain('Dependency');
    });

    it('includes items whose blockers are done', () => {
      const roadmap = makeRoadmap([
        {
          name: 'M1',
          isBacklog: false,
          features: [
            makeFeature({ name: 'Dep', status: 'done' }),
            makeFeature({ name: 'Unblocked', status: 'planned', blockedBy: ['Dep'] }),
          ],
        },
      ]);

      const candidates = scoreRoadmapCandidates(roadmap);
      expect(candidates).toHaveLength(1);
      expect(candidates[0]!.feature.name).toBe('Unblocked');
    });

    it('returns empty array when no candidates exist', () => {
      const roadmap = makeRoadmap([
        {
          name: 'M1',
          isBacklog: false,
          features: [makeFeature({ name: 'Done', status: 'done' })],
        },
      ]);

      const candidates = scoreRoadmapCandidates(roadmap);
      expect(candidates).toHaveLength(0);
    });
  });

  describe('two-tier sorting', () => {
    it('sorts priority items before non-priority items', () => {
      const roadmap = makeRoadmap([
        {
          name: 'M1',
          isBacklog: false,
          features: [
            makeFeature({ name: 'NoPrio', status: 'planned', priority: null }),
            makeFeature({ name: 'P2', status: 'planned', priority: 'P2' }),
          ],
        },
      ]);

      const candidates = scoreRoadmapCandidates(roadmap);
      expect(candidates[0]!.feature.name).toBe('P2');
      expect(candidates[1]!.feature.name).toBe('NoPrio');
    });

    it('sorts P0 before P1 before P2 before P3', () => {
      const roadmap = makeRoadmap([
        {
          name: 'M1',
          isBacklog: false,
          features: [
            makeFeature({ name: 'P3', status: 'planned', priority: 'P3' }),
            makeFeature({ name: 'P0', status: 'planned', priority: 'P0' }),
            makeFeature({ name: 'P1', status: 'planned', priority: 'P1' }),
            makeFeature({ name: 'P2', status: 'planned', priority: 'P2' }),
          ],
        },
      ]);

      const candidates = scoreRoadmapCandidates(roadmap);
      expect(candidates.map((c) => c.feature.name)).toEqual(['P0', 'P1', 'P2', 'P3']);
    });

    it('uses weighted score within same priority tier', () => {
      // Two P1 items: first in milestone (position 0) should score higher than second (position 1)
      const roadmap = makeRoadmap([
        {
          name: 'M1',
          isBacklog: false,
          features: [
            makeFeature({ name: 'First', status: 'planned', priority: 'P1' }),
            makeFeature({ name: 'Second', status: 'planned', priority: 'P1' }),
          ],
        },
      ]);

      const candidates = scoreRoadmapCandidates(roadmap);
      expect(candidates[0]!.feature.name).toBe('First');
      expect(candidates[1]!.feature.name).toBe('Second');
    });
  });

  describe('position scoring', () => {
    it('scores earlier milestone items higher than later milestone items', () => {
      const roadmap = makeRoadmap([
        {
          name: 'M1',
          isBacklog: false,
          features: [makeFeature({ name: 'Early', status: 'planned' })],
        },
        {
          name: 'M2',
          isBacklog: false,
          features: [makeFeature({ name: 'Late', status: 'planned' })],
        },
      ]);

      const candidates = scoreRoadmapCandidates(roadmap);
      expect(candidates[0]!.feature.name).toBe('Early');
      expect(candidates[0]!.positionScore).toBeGreaterThan(candidates[1]!.positionScore);
    });

    it('scores earlier features within milestone higher', () => {
      const roadmap = makeRoadmap([
        {
          name: 'M1',
          isBacklog: false,
          features: [
            makeFeature({ name: 'First', status: 'planned' }),
            makeFeature({ name: 'Second', status: 'planned' }),
            makeFeature({ name: 'Third', status: 'planned' }),
          ],
        },
      ]);

      const candidates = scoreRoadmapCandidates(roadmap);
      expect(candidates[0]!.positionScore).toBeGreaterThan(candidates[1]!.positionScore);
      expect(candidates[1]!.positionScore).toBeGreaterThan(candidates[2]!.positionScore);
    });
  });

  describe('dependents scoring', () => {
    it('scores items that unblock more downstream items higher', () => {
      const roadmap = makeRoadmap([
        {
          name: 'M1',
          isBacklog: false,
          features: [
            makeFeature({ name: 'Enabler', status: 'planned' }),
            makeFeature({ name: 'DepA', status: 'planned', blockedBy: ['Enabler'] }),
            makeFeature({ name: 'DepB', status: 'planned', blockedBy: ['Enabler'] }),
            makeFeature({ name: 'Leaf', status: 'planned' }),
          ],
        },
      ]);

      const candidates = scoreRoadmapCandidates(roadmap);
      const enabler = candidates.find((c) => c.feature.name === 'Enabler')!;
      const leaf = candidates.find((c) => c.feature.name === 'Leaf')!;
      expect(enabler.dependentsScore).toBeGreaterThan(leaf.dependentsScore);
    });
  });

  describe('affinity scoring', () => {
    it('gives bonus when user completed a blocker of the candidate', () => {
      const roadmap: Roadmap = {
        frontmatter: {
          project: 'test',
          version: 1,
          lastSynced: '2026-04-01T00:00:00Z',
          lastManualEdit: '2026-04-01T00:00:00Z',
        },
        milestones: [
          {
            name: 'M1',
            isBacklog: false,
            features: [
              makeFeature({ name: 'Foundation', status: 'done' }),
              makeFeature({ name: 'Extension', status: 'planned', blockedBy: ['Foundation'] }),
              makeFeature({ name: 'Unrelated', status: 'planned' }),
            ],
          },
        ],
        assignmentHistory: [
          { feature: 'Foundation', assignee: '@cwarner', action: 'completed', date: '2026-03-15' },
        ],
      };

      const candidates = scoreRoadmapCandidates(roadmap, { currentUser: '@cwarner' });
      const extension = candidates.find((c) => c.feature.name === 'Extension')!;
      const unrelated = candidates.find((c) => c.feature.name === 'Unrelated')!;
      expect(extension.affinityScore).toBe(1.0);
      // Unrelated is in the same milestone as Foundation (completed by user), so gets sibling bonus
      expect(unrelated.affinityScore).toBe(0.5);
    });

    it('gives partial bonus for milestone siblings completed by user', () => {
      const roadmap: Roadmap = {
        frontmatter: {
          project: 'test',
          version: 1,
          lastSynced: '2026-04-01T00:00:00Z',
          lastManualEdit: '2026-04-01T00:00:00Z',
        },
        milestones: [
          {
            name: 'M1',
            isBacklog: false,
            features: [
              makeFeature({ name: 'Sibling', status: 'done' }),
              makeFeature({ name: 'Candidate', status: 'planned' }),
            ],
          },
          {
            name: 'M2',
            isBacklog: false,
            features: [makeFeature({ name: 'OtherMS', status: 'planned' })],
          },
        ],
        assignmentHistory: [
          { feature: 'Sibling', assignee: '@cwarner', action: 'completed', date: '2026-03-15' },
        ],
      };

      const candidates = scoreRoadmapCandidates(roadmap, { currentUser: '@cwarner' });
      const candidate = candidates.find((c) => c.feature.name === 'Candidate')!;
      const otherMs = candidates.find((c) => c.feature.name === 'OtherMS')!;
      expect(candidate.affinityScore).toBe(0.5);
      expect(otherMs.affinityScore).toBe(0);
    });

    it('gives no affinity when no currentUser is provided', () => {
      const roadmap: Roadmap = {
        frontmatter: {
          project: 'test',
          version: 1,
          lastSynced: '2026-04-01T00:00:00Z',
          lastManualEdit: '2026-04-01T00:00:00Z',
        },
        milestones: [
          {
            name: 'M1',
            isBacklog: false,
            features: [makeFeature({ name: 'Feature', status: 'planned' })],
          },
        ],
        assignmentHistory: [
          { feature: 'Something', assignee: '@cwarner', action: 'completed', date: '2026-03-15' },
        ],
      };

      const candidates = scoreRoadmapCandidates(roadmap);
      expect(candidates[0]!.affinityScore).toBe(0);
    });
  });
});
