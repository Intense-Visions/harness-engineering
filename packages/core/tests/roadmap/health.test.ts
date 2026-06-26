import { describe, it, expect } from 'vitest';
import {
  checkRoadmapHealth,
  groomRoadmap,
  defaultIsArchive,
  isUnactionablePlanned,
} from '../../src/roadmap/health';
import type { Roadmap, RoadmapFeature, RoadmapMilestone } from '@harness-engineering/types';

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

function milestone(name: string, features: RoadmapFeature[]): RoadmapMilestone {
  return { name, isBacklog: name === 'Backlog', features };
}

function roadmap(milestones: RoadmapMilestone[]): Roadmap {
  return {
    frontmatter: {
      project: 'test',
      version: 1,
      lastSynced: '2026-01-01T00:00:00Z',
      lastManualEdit: '2026-01-01T00:00:00Z',
    },
    milestones,
    assignmentHistory: [],
  };
}

describe('defaultIsArchive()', () => {
  it('treats version, Shipped, and Hermes milestones as archives', () => {
    expect(defaultIsArchive('v1.0 Foundation')).toBe(true);
    expect(defaultIsArchive('v5.0 — Enforcement Hardening')).toBe(true);
    expect(defaultIsArchive('Shipped')).toBe(true);
    expect(defaultIsArchive('Hermes Adoption')).toBe(true);
  });
  it('treats themed and intake milestones as active', () => {
    expect(defaultIsArchive('Craft Pipeline')).toBe(false);
    expect(defaultIsArchive('Intake')).toBe(false);
  });
});

describe('isUnactionablePlanned()', () => {
  it('is true only for planned rows with no spec and no plan', () => {
    expect(isUnactionablePlanned(feature({ name: 'a', status: 'planned' }))).toBe(true);
    expect(isUnactionablePlanned(feature({ name: 'b', status: 'planned', spec: 'x.md' }))).toBe(
      false
    );
    expect(isUnactionablePlanned(feature({ name: 'c', status: 'planned', plans: ['p.md'] }))).toBe(
      false
    );
    expect(isUnactionablePlanned(feature({ name: 'd', status: 'backlog' }))).toBe(false);
  });
});

describe('checkRoadmapHealth()', () => {
  it('RMH003: flags catch-all milestones as errors', () => {
    const rm = roadmap([
      milestone('Backlog', [feature({ name: 'x', status: 'backlog' })]),
      milestone('Current Work', [feature({ name: 'y', status: 'in-progress' })]),
    ]);
    const findings = checkRoadmapHealth(rm);
    const rmh003 = findings.filter((f) => f.ruleId === 'RMH003');
    expect(rmh003).toHaveLength(2);
    expect(rmh003.every((f) => f.severity === 'error')).toBe(true);
  });

  it('RMH001: flags done features in active milestones, not in archives or intake', () => {
    const rm = roadmap([
      milestone('Craft Pipeline', [feature({ name: 'live-done', status: 'done' })]),
      milestone('Shipped', [feature({ name: 'archived-done', status: 'done' })]),
      milestone('Intake', [feature({ name: 'intake-done', status: 'done' })]),
    ]);
    const rmh001 = checkRoadmapHealth(rm).filter((f) => f.ruleId === 'RMH001');
    expect(rmh001).toHaveLength(1);
    expect(rmh001[0]!.feature).toBe('live-done');
  });

  it('RMH002: flags planned rows with no spec and no plan', () => {
    const rm = roadmap([
      milestone('Craft Pipeline', [
        feature({ name: 'naked', status: 'planned' }),
        feature({ name: 'specced', status: 'planned', spec: 's.md' }),
      ]),
    ]);
    const rmh002 = checkRoadmapHealth(rm).filter((f) => f.ruleId === 'RMH002');
    expect(rmh002).toHaveLength(1);
    expect(rmh002[0]!.feature).toBe('naked');
  });

  it('RMH004: flags oversized active milestones but not archives', () => {
    const many = Array.from({ length: 30 }, (_, i) =>
      feature({ name: `f${i}`, status: 'backlog' })
    );
    const rm = roadmap([milestone('Huge Theme', many), milestone('v9.0 Archive', many)]);
    const rmh004 = checkRoadmapHealth(rm, { maxActiveMilestoneSize: 25 }).filter(
      (f) => f.ruleId === 'RMH004'
    );
    expect(rmh004).toHaveLength(1);
    expect(rmh004[0]!.milestone).toBe('Huge Theme');
  });

  it('returns no findings for a tidy roadmap', () => {
    const rm = roadmap([
      milestone('Intake', []),
      milestone('Craft Pipeline', [feature({ name: 'a', status: 'planned', spec: 's.md' })]),
      milestone('Shipped', [feature({ name: 'b', status: 'done' })]),
    ]);
    expect(checkRoadmapHealth(rm)).toEqual([]);
  });
});

describe('groomRoadmap()', () => {
  it('demotes unactionable planned rows to backlog without mutating input', () => {
    const rm = roadmap([
      milestone('Craft Pipeline', [feature({ name: 'naked', status: 'planned' })]),
    ]);
    const { roadmap: out, changes } = groomRoadmap(rm);
    expect(rm.milestones[0]!.features[0]!.status).toBe('planned'); // input untouched
    expect(out.milestones[0]!.features[0]!.status).toBe('backlog');
    expect(changes).toContainEqual({
      kind: 'demoted',
      feature: 'naked',
      from: 'Craft Pipeline',
      to: 'backlog',
    });
  });

  it('archives done features out of active milestones', () => {
    const rm = roadmap([
      milestone('Craft Pipeline', [
        feature({ name: 'done-1', status: 'done' }),
        feature({ name: 'open-1', status: 'blocked' }),
      ]),
    ]);
    const { roadmap: out, archived, changes } = groomRoadmap(rm);
    expect(archived.map((f) => f.name)).toEqual(['done-1']);
    expect(out.milestones[0]!.features.map((f) => f.name)).toEqual(['open-1']);
    expect(changes).toContainEqual({
      kind: 'archived',
      feature: 'done-1',
      from: 'Craft Pipeline',
      to: 'Shipped',
    });
  });

  it('leaves done features in archive milestones in place', () => {
    const rm = roadmap([milestone('Shipped', [feature({ name: 'old', status: 'done' })])]);
    const { roadmap: out, archived } = groomRoadmap(rm);
    expect(archived).toHaveLength(0);
    expect(out.milestones[0]!.features).toHaveLength(1);
  });

  it('drops emptied active milestones but preserves the intake lane', () => {
    const rm = roadmap([
      milestone('Intake', []),
      milestone('Craft Pipeline', [feature({ name: 'done-1', status: 'done' })]),
    ]);
    const { roadmap: out } = groomRoadmap(rm);
    expect(out.milestones.map((m) => m.name)).toEqual(['Intake']);
  });

  it('respects archiveDone:false (demote only)', () => {
    const rm = roadmap([
      milestone('Craft Pipeline', [feature({ name: 'done-1', status: 'done' })]),
    ]);
    const { archived } = groomRoadmap(rm, { archiveDone: false });
    expect(archived).toHaveLength(0);
  });
});

describe('RMH005 — assignee invariant', () => {
  it('flags an assignee on a non-in-progress row (the pilot bug)', () => {
    const rm = roadmap([
      milestone('Craft Pipeline', [feature({ name: 'a', status: 'planned', assignee: '@chadjw' })]),
    ]);
    const findings = checkRoadmapHealth(rm).filter((f) => f.ruleId === 'RMH005');
    expect(findings).toHaveLength(1);
    expect(findings[0]!.severity).toBe('error');
    expect(findings[0]!.feature).toBe('a');
  });

  it('flags an in-progress row with no assignee (orphan)', () => {
    const rm = roadmap([
      milestone('Craft Pipeline', [feature({ name: 'a', status: 'in-progress', assignee: null })]),
    ]);
    const findings = checkRoadmapHealth(rm).filter((f) => f.ruleId === 'RMH005');
    expect(findings).toHaveLength(1);
    expect(findings[0]!.message).toContain('no assignee');
  });

  it('does not flag rows where the invariant holds', () => {
    const rm = roadmap([
      milestone('Craft Pipeline', [
        feature({ name: 'a', status: 'planned', assignee: null }),
        feature({ name: 'b', status: 'in-progress', assignee: 'orchestrator-5c895000' }),
        feature({ name: 'c', status: 'done', assignee: null }),
      ]),
    ]);
    expect(checkRoadmapHealth(rm).filter((f) => f.ruleId === 'RMH005')).toHaveLength(0);
  });
});

describe('groomRoadmap — assignee invariant migration', () => {
  it('clears the assignee on a non-in-progress row and records an unassigned change', () => {
    const rm = roadmap([
      milestone('Craft Pipeline', [
        feature({ name: 'a', status: 'planned', spec: 'x.md', assignee: '@chadjw' }),
      ]),
    ]);
    const { roadmap: out, changes } = groomRoadmap(rm);
    const groomed = out.milestones[0]!.features[0]!;
    expect(groomed.assignee).toBeNull();
    expect(changes).toContainEqual({
      kind: 'unassigned',
      feature: 'a',
      from: 'Craft Pipeline',
      to: '@chadjw',
    });
    expect(checkRoadmapHealth(out).filter((f) => f.ruleId === 'RMH005')).toHaveLength(0);
  });

  it('demotes an orphaned in-progress row to planned', () => {
    const rm = roadmap([
      milestone('Craft Pipeline', [feature({ name: 'a', status: 'in-progress', assignee: null })]),
    ]);
    const { roadmap: out, changes } = groomRoadmap(rm);
    const groomed = out.milestones[0]!.features[0]!;
    expect(groomed.status).toBe('planned');
    expect(changes).toContainEqual({
      kind: 'demoted',
      feature: 'a',
      from: 'Craft Pipeline',
      to: 'planned',
    });
  });

  it('leaves a valid machine claim intact', () => {
    const rm = roadmap([
      milestone('Craft Pipeline', [
        feature({ name: 'a', status: 'in-progress', assignee: 'orchestrator-5c895000' }),
      ]),
    ]);
    const { roadmap: out, changes } = groomRoadmap(rm);
    expect(out.milestones[0]!.features[0]!.assignee).toBe('orchestrator-5c895000');
    expect(changes.filter((c) => c.feature === 'a')).toHaveLength(0);
  });
});
