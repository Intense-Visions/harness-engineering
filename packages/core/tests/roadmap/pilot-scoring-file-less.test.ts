import { describe, it, expect } from 'vitest';
import { scoreRoadmapCandidatesFileLess } from '../../src/roadmap/pilot-scoring-file-less';
import type { TrackedFeature } from '../../src/roadmap/tracker';

const tf = (over: Partial<TrackedFeature>): TrackedFeature => ({
  externalId: over.externalId ?? 'github:o/r#1',
  name: over.name ?? 'F',
  status: over.status ?? 'planned',
  summary: '',
  spec: null,
  plans: [],
  blockedBy: over.blockedBy ?? [],
  assignee: null,
  priority: over.priority ?? null,
  milestone: null,
  createdAt: over.createdAt ?? '2026-01-01T00:00:00Z',
  updatedAt: null,
});

describe('scoreRoadmapCandidatesFileLess', () => {
  it('sorts by priority then createdAt ascending', () => {
    const features = [
      tf({ name: 'b-p1-late', priority: 'P1', createdAt: '2026-03-01' }),
      tf({ name: 'a-p0-early', priority: 'P0', createdAt: '2026-01-01' }),
      tf({ name: 'd-null', priority: null, createdAt: '2026-01-15' }),
      tf({ name: 'c-p1-early', priority: 'P1', createdAt: '2026-02-01' }),
      tf({ name: 'e-p0-late', priority: 'P0', createdAt: '2026-02-15' }),
    ];
    const order = scoreRoadmapCandidatesFileLess(features, {}).map((c) => c.feature.name);
    expect(order).toEqual(['a-p0-early', 'e-p0-late', 'c-p1-early', 'b-p1-late', 'd-null']);
  });
  it('filters non-eligible statuses', () => {
    const features = [
      tf({ name: 'in-progress', status: 'in-progress' }),
      tf({ name: 'planned', status: 'planned' }),
      tf({ name: 'backlog', status: 'backlog' }),
      tf({ name: 'done', status: 'done' }),
    ];
    const names = scoreRoadmapCandidatesFileLess(features, {}).map((c) => c.feature.name);
    expect(names).toEqual(['planned', 'backlog']);
  });
  it('returns empty for empty input', () => {
    expect(scoreRoadmapCandidatesFileLess([], {})).toEqual([]);
  });
  it('excludes features blocked by non-done features in the set', () => {
    const features = [
      tf({ name: 'foundation', status: 'planned' }),
      tf({ name: 'dependent', status: 'planned', blockedBy: ['foundation'] }),
    ];
    const names = scoreRoadmapCandidatesFileLess(features, {}).map((c) => c.feature.name);
    expect(names).toEqual(['foundation']);
  });
  it('includes features whose blockers are done', () => {
    const features = [
      tf({ name: 'foundation', status: 'done' }),
      tf({ name: 'dependent', status: 'planned', blockedBy: ['foundation'] }),
    ];
    const names = scoreRoadmapCandidatesFileLess(features, {}).map((c) => c.feature.name);
    expect(names).toEqual(['dependent']);
  });
});
