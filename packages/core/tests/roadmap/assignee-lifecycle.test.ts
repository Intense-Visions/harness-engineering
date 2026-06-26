import { describe, it, expect } from 'vitest';
import {
  isMachineAssignee,
  assigneeInvariantHolds,
  pushAssigneeToExternal,
  isClaimableBy,
  claim,
  release,
  setStatus,
} from '../../src/roadmap/assignee-lifecycle';
import type { Roadmap, RoadmapFeature } from '@harness-engineering/types';

function feature(overrides: Partial<RoadmapFeature> & { name: string }): RoadmapFeature {
  return {
    status: 'backlog',
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

function roadmap(features: RoadmapFeature[]): Roadmap {
  return {
    frontmatter: {
      project: 'test',
      version: 1,
      lastSynced: '2026-01-01T00:00:00Z',
      lastManualEdit: '2026-01-01T00:00:00Z',
    },
    milestones: [{ name: 'M', isBacklog: false, features }],
    assignmentHistory: [],
  };
}

const DATE = '2026-06-26';

describe('isMachineAssignee()', () => {
  it('matches orchestrator ids and the legacy hostname-hash form', () => {
    expect(isMachineAssignee('orchestrator-5c895000')).toBe(true);
    expect(isMachineAssignee('chads-macbook-pro-8565381d')).toBe(true);
  });
  it('rejects human handles and null', () => {
    expect(isMachineAssignee('@chadjw')).toBe(false);
    expect(isMachineAssignee('chad.warner@example.com')).toBe(false);
    expect(isMachineAssignee('chad-warner')).toBe(false);
    expect(isMachineAssignee(null)).toBe(false);
  });
});

describe('assigneeInvariantHolds()', () => {
  it('holds iff (assignee != null) === (status === in-progress)', () => {
    expect(assigneeInvariantHolds(feature({ name: 'a', status: 'planned', assignee: null }))).toBe(
      true
    );
    expect(
      assigneeInvariantHolds(feature({ name: 'b', status: 'in-progress', assignee: '@x' }))
    ).toBe(true);
    // Violations: the pilot bug (assignee on a non-in-progress row) and the orphan.
    expect(assigneeInvariantHolds(feature({ name: 'c', status: 'planned', assignee: '@x' }))).toBe(
      false
    );
    expect(
      assigneeInvariantHolds(feature({ name: 'd', status: 'in-progress', assignee: null }))
    ).toBe(false);
  });
});

describe('pushAssigneeToExternal()', () => {
  it('is true only for real (non-null, non-machine) assignees', () => {
    expect(pushAssigneeToExternal('@chadjw')).toBe(true);
    expect(pushAssigneeToExternal('orchestrator-5c895000')).toBe(false);
    expect(pushAssigneeToExternal(null)).toBe(false);
  });
});

describe('isClaimableBy()', () => {
  it('is true for an unassigned row or one already held by the same assignee', () => {
    expect(isClaimableBy(feature({ name: 'a', assignee: null }), 'orchestrator-5c895000')).toBe(
      true
    );
    expect(
      isClaimableBy(
        feature({ name: 'b', status: 'in-progress', assignee: 'orchestrator-5c895000' }),
        'orchestrator-5c895000'
      )
    ).toBe(true);
  });

  it('is false for ANY foreign assignee regardless of status (status-agnostic, stricter than claim)', () => {
    // A peer orchestrator's live claim.
    expect(
      isClaimableBy(
        feature({ name: 'c', status: 'in-progress', assignee: 'orchestrator-deadbeef' }),
        'orchestrator-5c895000'
      )
    ).toBe(false);
    // A human handle on a *non*-in-progress row — claim() would reassign this,
    // but the orchestrator must not steal it.
    expect(
      isClaimableBy(
        feature({ name: 'd', status: 'planned', assignee: '@alice' }),
        'orchestrator-5c895000'
      )
    ).toBe(false);
  });
});

describe('claim()', () => {
  it('sets in-progress + assignee and logs an assigned record', () => {
    const f = feature({ name: 'a', status: 'planned' });
    const rm = roadmap([f]);
    claim(rm, f, '@chadjw', DATE);
    expect(f.status).toBe('in-progress');
    expect(f.assignee).toBe('@chadjw');
    expect(rm.assignmentHistory).toEqual([
      { feature: 'a', assignee: '@chadjw', action: 'assigned', date: DATE },
    ]);
  });

  it('is idempotent for the same assignee (no duplicate history)', () => {
    const f = feature({ name: 'a', status: 'in-progress', assignee: '@chadjw' });
    const rm = roadmap([f]);
    claim(rm, f, '@chadjw', DATE);
    expect(f.assignee).toBe('@chadjw');
    expect(rm.assignmentHistory).toHaveLength(0);
  });

  it('first claim wins: refuses to steal a live claim from a different owner (S4-003)', () => {
    const f = feature({ name: 'a', status: 'in-progress', assignee: 'orchestrator-aaaaaaaa' });
    const rm = roadmap([f]);
    claim(rm, f, '@chadjw', DATE);
    expect(f.assignee).toBe('orchestrator-aaaaaaaa');
    expect(rm.assignmentHistory).toHaveLength(0);
  });

  it('reassigns a non-in-progress row, logging unassigned + assigned', () => {
    const f = feature({ name: 'a', status: 'planned', assignee: '@old' });
    const rm = roadmap([f]);
    claim(rm, f, '@new', DATE);
    expect(f.status).toBe('in-progress');
    expect(f.assignee).toBe('@new');
    expect(rm.assignmentHistory).toEqual([
      { feature: 'a', assignee: '@old', action: 'unassigned', date: DATE },
      { feature: 'a', assignee: '@new', action: 'assigned', date: DATE },
    ]);
  });
});

describe('release()', () => {
  it('clears assignee and returns an in-progress row to planned', () => {
    const f = feature({ name: 'a', status: 'in-progress', assignee: '@chadjw' });
    const rm = roadmap([f]);
    release(rm, f, DATE);
    expect(f.status).toBe('planned');
    expect(f.assignee).toBeNull();
    expect(rm.assignmentHistory).toEqual([
      { feature: 'a', assignee: '@chadjw', action: 'unassigned', date: DATE },
    ]);
    expect(assigneeInvariantHolds(f)).toBe(true);
  });

  it('is a no-op when already unassigned', () => {
    const f = feature({ name: 'a', status: 'planned', assignee: null });
    const rm = roadmap([f]);
    release(rm, f, DATE);
    expect(rm.assignmentHistory).toHaveLength(0);
  });
});

describe('setStatus()', () => {
  it('auto-clears the assignee on any move away from in-progress (S4-001)', () => {
    const f = feature({ name: 'a', status: 'in-progress', assignee: '@chadjw' });
    const rm = roadmap([f]);
    setStatus(rm, f, 'done', DATE);
    expect(f.status).toBe('done');
    expect(f.assignee).toBeNull();
    expect(assigneeInvariantHolds(f)).toBe(true);
    expect(rm.assignmentHistory).toEqual([
      { feature: 'a', assignee: '@chadjw', action: 'unassigned', date: DATE },
    ]);
  });

  it('does not fabricate an assignee when moving to in-progress', () => {
    const f = feature({ name: 'a', status: 'planned', assignee: null });
    const rm = roadmap([f]);
    setStatus(rm, f, 'in-progress', DATE);
    expect(f.status).toBe('in-progress');
    expect(f.assignee).toBeNull();
    expect(rm.assignmentHistory).toHaveLength(0);
  });
});
