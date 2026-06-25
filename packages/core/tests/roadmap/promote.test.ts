import { describe, it, expect } from 'vitest';
import { promoteFeature, decidePromotionForRow } from '../../src/roadmap/promote';
import { serializeRoadmap } from '../../src/roadmap/serialize';
import type { Roadmap, RoadmapFeature, FeatureStatus } from '@harness-engineering/types';

const SPEC = 'docs/changes/push-notifications/proposal.md';

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

function roadmapWith(features: RoadmapFeature[], milestoneName = 'Backlog'): Roadmap {
  return {
    frontmatter: {
      project: 'test',
      version: 1,
      lastSynced: '2026-01-01T00:00:00Z',
      lastManualEdit: '2026-01-01T00:00:00Z',
    },
    milestones: [{ name: milestoneName, isBacklog: milestoneName === 'Backlog', features }],
    assignmentHistory: [],
  };
}

describe('promoteFeature()', () => {
  describe('D2 — state-transition matrix', () => {
    it('backlog → planned, sets spec (happy path)', () => {
      const roadmap = roadmapWith([feature({ name: 'Push', status: 'backlog' })]);
      const { result, nextRoadmap } = promoteFeature(roadmap, { feature: 'Push', spec: SPEC });

      expect(result).toEqual({ ok: true, transitioned: 'backlog→planned', feature: 'Push' });
      const row = nextRoadmap.milestones[0]!.features[0]!;
      expect(row.status).toBe('planned');
      expect(row.spec).toBe(SPEC);
    });

    it('not found (no near neighbour) → creates a new planned row under Current Work', () => {
      const roadmap = roadmapWith([feature({ name: 'Push', status: 'backlog' })]);
      const { result, nextRoadmap } = promoteFeature(roadmap, {
        feature: 'Telemetry Overhaul',
        spec: SPEC,
        summary: 'New telemetry pipeline',
      });

      expect(result).toEqual({ ok: true, transitioned: 'created', feature: 'Telemetry Overhaul' });
      const current = nextRoadmap.milestones.find((m) => m.name === 'Current Work');
      expect(current).toBeDefined();
      const created = current!.features[0]!;
      expect(created.status).toBe('planned');
      expect(created.spec).toBe(SPEC);
      expect(created.summary).toBe('New telemetry pipeline');
    });

    it.each<[FeatureStatus, 'spec-updated']>([
      ['planned', 'spec-updated'],
      ['blocked', 'spec-updated'],
      ['needs-human', 'spec-updated'],
    ])('%s → updates spec, preserves status', (status, transitioned) => {
      const roadmap = roadmapWith([
        feature({ name: 'Push', status, spec: 'docs/changes/push/old.md' }),
      ]);
      const { result, nextRoadmap } = promoteFeature(roadmap, { feature: 'Push', spec: SPEC });

      expect(result).toEqual({ ok: true, transitioned, feature: 'Push' });
      const row = nextRoadmap.milestones[0]!.features[0]!;
      expect(row.status).toBe(status);
      expect(row.spec).toBe(SPEC);
    });

    it('in-progress → refuses without mutation', () => {
      const roadmap = roadmapWith([feature({ name: 'Push', status: 'in-progress', spec: SPEC })]);
      const before = serializeRoadmap(roadmap);
      const { result, nextRoadmap } = promoteFeature(roadmap, {
        feature: 'Push',
        spec: 'docs/changes/other.md',
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason).toBe('in-progress');
      expect(serializeRoadmap(nextRoadmap)).toBe(before);
    });

    it('done → refuses without mutation', () => {
      const roadmap = roadmapWith([feature({ name: 'Push', status: 'done', spec: SPEC })]);
      const before = serializeRoadmap(roadmap);
      const { result, nextRoadmap } = promoteFeature(roadmap, {
        feature: 'Push',
        spec: 'docs/changes/other.md',
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason).toBe('done');
      expect(serializeRoadmap(nextRoadmap)).toBe(before);
    });
  });

  describe('D1 — lookup behaviour', () => {
    it('matches case-insensitively and trims whitespace', () => {
      const roadmap = roadmapWith([feature({ name: 'Push Notifications', status: 'backlog' })]);
      const { result } = promoteFeature(roadmap, { feature: '  push notifications  ', spec: SPEC });
      expect(result).toMatchObject({ ok: true, transitioned: 'backlog→planned' });
    });

    it('ambiguous heading across milestones → refuses with milestone-qualified matches', () => {
      const roadmap: Roadmap = {
        frontmatter: {
          project: 'test',
          version: 1,
          lastSynced: '2026-01-01T00:00:00Z',
          lastManualEdit: '2026-01-01T00:00:00Z',
        },
        milestones: [
          {
            name: 'v1.0',
            isBacklog: false,
            features: [feature({ name: 'Auth', status: 'backlog' })],
          },
          {
            name: 'v2.0',
            isBacklog: false,
            features: [feature({ name: 'Auth', status: 'planned' })],
          },
        ],
        assignmentHistory: [],
      };
      const before = serializeRoadmap(roadmap);
      const { result, nextRoadmap } = promoteFeature(roadmap, { feature: 'Auth', spec: SPEC });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason).toBe('ambiguous');
      if (result.reason !== 'ambiguous') return;
      expect(result.matches).toEqual(['v1.0 > Auth', 'v2.0 > Auth']);
      expect(serializeRoadmap(nextRoadmap)).toBe(before);
    });

    it('typo against an existing row → not-found with closest matches (≤3)', () => {
      const roadmap = roadmapWith([
        feature({ name: 'Auto-promote', status: 'backlog' }),
        feature({ name: 'Auto-detect', status: 'backlog' }),
        feature({ name: 'Auto-archive', status: 'backlog' }),
        feature({ name: 'Auto-merge', status: 'backlog' }),
      ]);
      const { result } = promoteFeature(roadmap, { feature: 'Auto-promot', spec: SPEC });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason).toBe('not-found');
      if (result.reason !== 'not-found') return;
      expect(result.closestMatches[0]).toBe('Auto-promote');
      expect(result.closestMatches.length).toBeLessThanOrEqual(3);
    });
  });

  describe('D4 — idempotency', () => {
    it('planned row with identical spec → noop with zero diff', () => {
      const roadmap = roadmapWith([
        feature({ name: 'Push', status: 'planned', spec: SPEC, summary: 'Already summarised' }),
      ]);
      const before = serializeRoadmap(roadmap);
      const { result, nextRoadmap } = promoteFeature(roadmap, { feature: 'Push', spec: SPEC });

      expect(result).toEqual({ ok: true, transitioned: 'noop', feature: 'Push' });
      expect(serializeRoadmap(nextRoadmap)).toBe(before);
    });

    it('planned row with a different spec → spec-updated, warns via spec-updated transition', () => {
      const roadmap = roadmapWith([
        feature({ name: 'Push', status: 'planned', spec: 'docs/changes/push/old.md' }),
      ]);
      const { result, nextRoadmap } = promoteFeature(roadmap, { feature: 'Push', spec: SPEC });

      expect(result).toMatchObject({ ok: true, transitioned: 'spec-updated' });
      expect(nextRoadmap.milestones[0]!.features[0]!.spec).toBe(SPEC);
    });
  });

  describe('D5 — field-write policy', () => {
    it('fills an empty summary with the spec H1', () => {
      const roadmap = roadmapWith([feature({ name: 'Push', status: 'backlog', summary: '—' })]);
      const { nextRoadmap } = promoteFeature(roadmap, {
        feature: 'Push',
        spec: SPEC,
        summary: 'Push via WebSocket',
      });
      expect(nextRoadmap.milestones[0]!.features[0]!.summary).toBe('Push via WebSocket');
    });

    it('does not overwrite a human-written summary', () => {
      const roadmap = roadmapWith([
        feature({ name: 'Push', status: 'backlog', summary: 'Human wrote this' }),
      ]);
      const { nextRoadmap } = promoteFeature(roadmap, {
        feature: 'Push',
        spec: SPEC,
        summary: 'Generated H1',
      });
      expect(nextRoadmap.milestones[0]!.features[0]!.summary).toBe('Human wrote this');
    });

    it('preserves plan, assignee, priority, external-id, blockers, milestone', () => {
      const roadmap = roadmapWith(
        [
          feature({
            name: 'Push',
            status: 'backlog',
            plans: ['docs/plans/p1.md'],
            blockedBy: ['Other'],
            assignee: '@cwarner',
            priority: 'P1',
            externalId: 'github:o/r#7',
          }),
        ],
        'MVP'
      );
      const { nextRoadmap } = promoteFeature(roadmap, { feature: 'Push', spec: SPEC });
      const row = nextRoadmap.milestones[0]!.features[0]!;

      expect(nextRoadmap.milestones[0]!.name).toBe('MVP');
      expect(row.plans).toEqual(['docs/plans/p1.md']);
      expect(row.blockedBy).toEqual(['Other']);
      expect(row.assignee).toBe('@cwarner');
      expect(row.priority).toBe('P1');
      expect(row.externalId).toBe('github:o/r#7');
    });
  });

  describe('purity', () => {
    it('does not mutate the input roadmap on a successful transition', () => {
      const roadmap = roadmapWith([feature({ name: 'Push', status: 'backlog' })]);
      const before = serializeRoadmap(roadmap);
      promoteFeature(roadmap, { feature: 'Push', spec: SPEC });
      expect(serializeRoadmap(roadmap)).toBe(before);
    });
  });
});

describe('decidePromotionForRow()', () => {
  it.each<[FeatureStatus, string]>([
    ['backlog', 'set-planned'],
    ['planned', 'update-spec'],
    ['blocked', 'update-spec'],
    ['needs-human', 'update-spec'],
  ])('%s yields %s when the spec differs', (status, action) => {
    const decision = decidePromotionForRow(status, 'docs/old.md', '', { feature: 'X', spec: SPEC });
    expect(decision.action).toBe(action);
  });

  it('returns noop when planned and spec already matches', () => {
    const decision = decidePromotionForRow('planned', SPEC, 'has summary', {
      feature: 'X',
      spec: SPEC,
    });
    expect(decision).toEqual({ action: 'noop' });
  });

  it('refuses in-progress and done', () => {
    expect(decidePromotionForRow('in-progress', SPEC, '', { feature: 'X', spec: SPEC })).toEqual({
      action: 'refuse',
      reason: 'in-progress',
    });
    expect(decidePromotionForRow('done', SPEC, '', { feature: 'X', spec: SPEC })).toEqual({
      action: 'refuse',
      reason: 'done',
    });
  });
});
