import { describe, it, expect } from 'vitest';
import { scoreRoadmapCandidates } from '../../src/roadmap/pilot-scoring';
import type { Roadmap, RoadmapFeature } from '@harness-engineering/types';

/**
 * #2222 — two of the scorer's three weighted inputs were inert on a real roadmap:
 * `dependents` keyed on raw Blockers prose, and `affinity` read only `completed`
 * assignment records, which nothing writes. These fixtures use the shapes a real
 * sharded roadmap carries, and each asserts that the input CHANGES THE RANKING,
 * so a regression to a constant zero fails here rather than silently reducing the
 * score to shard order.
 */

function feature(name: string, overrides?: Partial<RoadmapFeature>): RoadmapFeature {
  return {
    name,
    status: 'planned',
    spec: null,
    plans: [],
    blockedBy: [],
    summary: '',
    assignee: null,
    priority: null,
    externalId: null,
    updatedAt: null,
    ...overrides,
  };
}

function roadmap(
  milestones: Array<{ name: string; features: RoadmapFeature[] }>,
  assignmentHistory: Roadmap['assignmentHistory'] = []
): Roadmap {
  return {
    frontmatter: {
      project: 'test',
      version: 1,
      lastSynced: '2026-04-01T00:00:00Z',
      lastManualEdit: '2026-04-01T00:00:00Z',
    },
    milestones: milestones.map((m) => ({ name: m.name, isBacklog: false, features: m.features })),
    assignmentHistory,
  };
}

const names = (rm: Roadmap, opts?: Parameters<typeof scoreRoadmapCandidates>[1]) =>
  scoreRoadmapCandidates(rm, opts).map((c) => c.feature.name);

describe('#2222 dependents resolves Blockers the way eligibility does', () => {
  it('counts a backticked-slug blocker in prose as a dependent and lifts the target', () => {
    const rm = roadmap([
      {
        name: 'M1',
        features: [
          feature('Early Item'),
          feature('Duplication Detection'),
          // Dependents reference the target by slug inside prose, never by exact name.
          feature('Downstream A', {
            status: 'blocked',
            blockedBy: ['Depends on `duplication-detection`'],
          }),
          feature('Downstream B', {
            status: 'blocked',
            blockedBy: ['Needs `duplication-detection` first'],
          }),
        ],
      },
    ]);
    const scored = scoreRoadmapCandidates(rm);
    const target = scored.find((c) => c.feature.name === 'Duplication Detection')!;
    expect(target.dependentsScore).toBe(1);
    expect(names(rm)[0]).toBe('Duplication Detection');
  });

  it('counts an issue-reference blocker via External-ID', () => {
    const rm = roadmap([
      {
        name: 'M1',
        features: [
          feature('Early Item'),
          feature('Target', { externalId: 'github:o/r#552' }),
          feature('Waiter', { status: 'in-progress', blockedBy: ['Waits on #552'] }),
        ],
      },
    ]);
    expect(names(rm)[0]).toBe('Target');
  });

  it('counts each dependent row once even when its Blockers split into several fragments naming the target', () => {
    const rm = roadmap([
      {
        name: 'M1',
        features: [
          feature('Alpha'),
          feature('Beta'),
          feature('One', { status: 'blocked', blockedBy: ['Depends on `alpha`', 'and `alpha`'] }),
          feature('Two', { status: 'blocked', blockedBy: ['`beta`'] }),
          feature('Three', { status: 'blocked', blockedBy: ['`beta`'] }),
        ],
      },
    ]);
    const scored = scoreRoadmapCandidates(rm);
    const by = (n: string) => scored.find((c) => c.feature.name === n)!;
    expect(by('Beta').dependentsScore).toBe(1);
    expect(by('Alpha').dependentsScore).toBe(0.5);
  });

  it('does not normalize against prose keys that name no row', () => {
    const rm = roadmap([
      {
        name: 'M1',
        features: [
          feature('Target'),
          feature('Waiter', { status: 'blocked', blockedBy: ['`target`'] }),
          // Six rows sharing one unresolvable prose blocker used to set maxDependents = 6.
          ...[1, 2, 3, 4, 5, 6].map((i) =>
            feature(`Prose ${i}`, { status: 'blocked', blockedBy: ['Needs 5+ active projects'] })
          ),
        ],
      },
    ]);
    const target = scoreRoadmapCandidates(rm).find((c) => c.feature.name === 'Target')!;
    expect(target.dependentsScore).toBe(1);
  });
});

describe('#2222 affinity reads data the roadmap actually carries', () => {
  // No `completed` assignment records: nothing in production writes that action.
  // Done rows that pad the position range so a 0.5 sibling bonus can outrank a
  // one-slot position lead (0.2 x 0.5 = 0.1 against a gap of 0.5 / total rows).
  const TAIL = {
    name: 'Tail',
    features: [1, 2, 3, 4, 5].map((i) => feature(`Tail ${i}`, { status: 'done' as const })),
  };
  const history: Roadmap['assignmentHistory'] = [
    { feature: 'Shipped Phase 1', assignee: '@chadjw', action: 'assigned', date: '2026-05-01' },
  ];

  it('treats a done row assigned to the user (via history) as user-completed and lifts its siblings', () => {
    const rm = roadmap(
      [
        { name: 'Other', features: [feature('Unrelated Early')] },
        {
          name: 'Feature Line',
          features: [feature('Phase 2'), feature('Shipped Phase 1', { status: 'done' })],
        },
        TAIL,
      ],
      history
    );
    expect(names(rm)).toEqual(['Unrelated Early', 'Phase 2']);
    const withUser = scoreRoadmapCandidates(rm, { currentUser: 'chadjw' });
    expect(withUser.map((c) => c.feature.name)).toEqual(['Phase 2', 'Unrelated Early']);
    expect(withUser[0]!.affinityScore).toBe(0.5);
  });

  it('treats a done row whose Assignee is the user as user-completed, with full affinity for a candidate it unblocked', () => {
    const rm = roadmap([
      { name: 'Other', features: [feature('Unrelated Early')] },
      {
        name: 'M2',
        features: [feature('Builds On It', { blockedBy: ['Depends on `foundation`'] })],
      },
      { name: 'M3', features: [feature('Foundation', { status: 'done', assignee: '@chadjw' })] },
    ]);
    const scored = scoreRoadmapCandidates(rm, { currentUser: '@ChadJW' });
    expect(scored[0]!.feature.name).toBe('Builds On It');
    expect(scored[0]!.affinityScore).toBe(1);
  });

  it('gives no affinity for a done row last assigned to someone else', () => {
    const rm = roadmap(
      [
        { name: 'Other', features: [feature('Unrelated Early')] },
        {
          name: 'Line',
          features: [feature('Shipped Phase 1', { status: 'done' }), feature('Phase 2')],
        },
      ],
      [
        ...history,
        {
          feature: 'Shipped Phase 1',
          assignee: '@chadjw',
          action: 'unassigned',
          date: '2026-05-02',
        },
        {
          feature: 'Shipped Phase 1',
          assignee: '@someone',
          action: 'assigned',
          date: '2026-05-02',
        },
      ]
    );
    const scored = scoreRoadmapCandidates(rm, { currentUser: 'chadjw' });
    expect(scored.every((c) => c.affinityScore === 0)).toBe(true);
  });

  it('gives no affinity for a row assigned to the user that is not done', () => {
    const rm = roadmap(
      [
        { name: 'Other', features: [feature('Unrelated Early')] },
        {
          name: 'Line',
          features: [feature('Shipped Phase 1', { status: 'in-progress' }), feature('Phase 2')],
        },
      ],
      history
    );
    const scored = scoreRoadmapCandidates(rm, { currentUser: 'chadjw' });
    expect(scored.every((c) => c.affinityScore === 0)).toBe(true);
  });
});
