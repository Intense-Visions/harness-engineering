/**
 * #2255 — the pilot scorer must treat a row whose `Blockers` field references a
 * not-done row as NOT dispatchable, in the forms the roadmap shards actually use:
 * backticked slugs (`Depends on \`some-row\``), the comma-split fragments of a
 * multi-dependency sentence, issue references (`#552`), and free prose that names
 * no row at all. The original filter only matched a blocker string that was
 * byte-for-byte a feature NAME, so on this repo's shards it excluded 2 of the 100
 * planned/backlog rows that carry blockers and ranked the other 98 as dispatchable.
 */
import { describe, it, expect } from 'vitest';
import { scoreRoadmapCandidates } from '../../src/roadmap/pilot-scoring';
import {
  findBlockedRoadmapCandidates,
  shardSlugAliases,
} from '../../src/roadmap/blocker-resolution';
import type { Roadmap, RoadmapFeature } from '@harness-engineering/types';

function feature(overrides: Partial<RoadmapFeature> & { name: string }): RoadmapFeature {
  return {
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

function roadmapOf(features: RoadmapFeature[]): Roadmap {
  return {
    frontmatter: {
      project: 'test',
      version: 1,
      lastSynced: '2026-04-01T00:00:00Z',
      lastManualEdit: '2026-04-01T00:00:00Z',
    },
    milestones: [{ name: 'M1', isBacklog: false, features }],
    assignmentHistory: [],
  };
}

function candidateNames(roadmap: Roadmap): string[] {
  return scoreRoadmapCandidates(roadmap).map((c) => c.feature.name);
}

describe('scoreRoadmapCandidates — Blockers eligibility (#2255)', () => {
  it('excludes a row whose blocker is a backticked slug of an open row', () => {
    const roadmap = roadmapOf([
      feature({ name: 'Duplication detection', status: 'in-progress' }),
      feature({ name: 'Consumer', blockedBy: ['Depends on `duplication-detection`'] }),
    ]);
    expect(candidateNames(roadmap)).not.toContain('Consumer');
  });

  it('includes a row whose backticked-slug blocker is done', () => {
    const roadmap = roadmapOf([
      feature({ name: 'Duplication detection', status: 'done' }),
      feature({ name: 'Consumer', blockedBy: ['Depends on `duplication-detection`'] }),
    ]);
    expect(candidateNames(roadmap)).toContain('Consumer');
  });

  it('resolves every fragment of a comma-split multi-dependency sentence', () => {
    // `Depends on \`a\`, \`b\`, and \`c\`` is decoded by the list codec into three items.
    const blockedBy = ['Depends on `row-a`', '`row-b`', 'and `row-c`'];
    const allDone = roadmapOf([
      feature({ name: 'Row A', status: 'done' }),
      feature({ name: 'Row B', status: 'done' }),
      feature({ name: 'Row C', status: 'done' }),
      feature({ name: 'Consumer', blockedBy }),
    ]);
    expect(candidateNames(allDone)).toContain('Consumer');

    const lastOpen = roadmapOf([
      feature({ name: 'Row A', status: 'done' }),
      feature({ name: 'Row B', status: 'done' }),
      feature({ name: 'Row C', status: 'planned' }),
      feature({ name: 'Consumer', blockedBy }),
    ]);
    expect(candidateNames(lastOpen)).not.toContain('Consumer');
  });

  it('matches a blocker that is a feature name regardless of case', () => {
    const roadmap = roadmapOf([
      feature({ name: 'Build harness:outcome-eval skill', status: 'blocked' }),
      feature({ name: 'Consumer', blockedBy: ['build HARNESS:outcome-eval skill'] }),
    ]);
    expect(candidateNames(roadmap)).not.toContain('Consumer');
  });

  it('excludes a row whose blocker references an open row by issue number', () => {
    const roadmap = roadmapOf([
      feature({
        name: 'Upstream',
        status: 'planned',
        externalId: 'github:Intense-Visions/harness-engineering#552',
      }),
      feature({ name: 'Consumer', blockedBy: ['Waits on #552'] }),
    ]);
    expect(candidateNames(roadmap)).not.toContain('Consumer');
  });

  it('excludes a row whose blocker is prose that names no row (fail closed)', () => {
    const roadmap = roadmapOf([
      feature({
        name: 'Consumer',
        blockedBy: ['Needs 5+ active harness-managed projects for adoption density'],
      }),
      feature({ name: 'Free' }),
    ]);
    expect(candidateNames(roadmap)).toEqual(['Free']);
  });

  it('keeps rows with no blockers dispatchable', () => {
    const roadmap = roadmapOf([feature({ name: 'Free' }), feature({ name: 'Also free' })]);
    expect(candidateNames(roadmap).sort()).toEqual(['Also free', 'Free']);
  });
});

describe('findBlockedRoadmapCandidates (#2255)', () => {
  it('reports each blocked planned/backlog row with why each blocker holds', () => {
    const roadmap = roadmapOf([
      feature({ name: 'Open dep', status: 'in-progress' }),
      feature({ name: 'Done dep', status: 'done' }),
      feature({ name: 'By open row', blockedBy: ['Depends on `open-dep`'] }),
      feature({ name: 'By prose', status: 'backlog', blockedBy: ['Design decision deferred'] }),
      feature({ name: 'Cleared', blockedBy: ['Depends on `done-dep`'] }),
      feature({ name: 'Not a candidate', status: 'in-progress', blockedBy: ['Anything'] }),
    ]);

    const blocked = findBlockedRoadmapCandidates(roadmap);
    expect(blocked.map((b) => b.feature.name)).toEqual(['By open row', 'By prose']);

    const [byOpenRow, byProse] = blocked;
    expect(byOpenRow!.milestone).toBe('M1');
    expect(byOpenRow!.blockers).toEqual([
      { text: 'Depends on `open-dep`', reason: 'open', openRefs: ['Open dep'] },
    ]);
    expect(byProse!.blockers).toEqual([
      { text: 'Design decision deferred', reason: 'unresolved', openRefs: [] },
    ]);
  });

  it('partitions planned/backlog rows: blocked + scored = all eligible-by-status', () => {
    const roadmap = roadmapOf([
      feature({ name: 'Dep', status: 'planned' }),
      feature({ name: 'A', blockedBy: ['Dep'] }),
      feature({ name: 'B', status: 'backlog', blockedBy: ['`dep`'] }),
      feature({ name: 'C' }),
    ]);
    const scored = scoreRoadmapCandidates(roadmap).map((c) => c.feature.name);
    const blocked = findBlockedRoadmapCandidates(roadmap).map((b) => b.feature.name);
    expect(scored.sort()).toEqual(['C', 'Dep']);
    expect(blocked.sort()).toEqual(['A', 'B']);
  });
});

describe('shard slug aliases (#2255)', () => {
  // A shard's slug is often a shortened title, and Blockers reference that slug.
  const shards = [
    {
      slug: 'rejection-ledger-negative-knowledge',
      feature: { name: 'Rejection ledger — durable negative knowledge that stops re-proposal' },
    },
  ];
  const consumer = feature({
    name: 'Precedent',
    blockedBy: ['Depends on `rejection-ledger-negative-knowledge`'],
  });

  it('releases a row once the shard-slug-referenced row is done', () => {
    const roadmap = roadmapOf([
      feature({ name: shards[0]!.feature.name, status: 'done' }),
      consumer,
    ]);
    const slugAliases = shardSlugAliases(shards);
    expect(scoreRoadmapCandidates(roadmap, { slugAliases }).map((c) => c.feature.name)).toContain(
      'Precedent'
    );
    expect(findBlockedRoadmapCandidates(roadmap, { slugAliases })).toEqual([]);
  });

  it('reports the shard-slug-referenced row as open while it is not done', () => {
    const roadmap = roadmapOf([
      feature({ name: shards[0]!.feature.name, status: 'planned' }),
      consumer,
    ]);
    const [blocked] = findBlockedRoadmapCandidates(roadmap, {
      slugAliases: shardSlugAliases(shards),
    });
    expect(blocked!.blockers[0]!.reason).toBe('open');
    expect(blocked!.blockers[0]!.openRefs).toEqual([shards[0]!.feature.name]);
  });

  it('without aliases, an unrecognised slug still withholds the row (fail closed)', () => {
    const roadmap = roadmapOf([
      feature({ name: shards[0]!.feature.name, status: 'done' }),
      consumer,
    ]);
    const [blocked] = findBlockedRoadmapCandidates(roadmap);
    expect(blocked!.blockers[0]!.reason).toBe('unresolved');
  });
});
