import { describe, it, expect } from 'vitest';
import { buildMigrationPlan } from '../../../src/roadmap/migrate/plan-builder';
import { hashHistoryEvent } from '../../../src/roadmap/migrate/history-hash';
import { serializeBodyBlock } from '../../../src/roadmap/tracker/body-metadata';
import type {
  Roadmap,
  RoadmapFeature,
  RoadmapMilestone,
  AssignmentRecord,
  RoadmapFrontmatter,
} from '@harness-engineering/types';
import type { TrackedFeature } from '../../../src/roadmap/tracker';

const FRONTMATTER: RoadmapFrontmatter = {
  project: 'test',
  version: 1,
  lastSynced: '2026-05-09T00:00:00Z',
  lastManualEdit: '2026-05-09T00:00:00Z',
};

function makeRoadmap(milestones: RoadmapMilestone[], history: AssignmentRecord[] = []): Roadmap {
  return {
    frontmatter: FRONTMATTER,
    milestones,
    assignmentHistory: history,
  };
}

function makeFeature(partial: Partial<RoadmapFeature> & { name: string }): RoadmapFeature {
  return {
    name: partial.name,
    status: partial.status ?? 'backlog',
    spec: partial.spec ?? null,
    plans: partial.plans ?? [],
    blockedBy: partial.blockedBy ?? [],
    summary: partial.summary ?? `${partial.name} summary`,
    assignee: partial.assignee ?? null,
    priority: partial.priority ?? null,
    externalId: partial.externalId ?? null,
    updatedAt: partial.updatedAt ?? null,
  };
}

function makeMilestone(
  name: string,
  features: RoadmapFeature[],
  isBacklog = false
): RoadmapMilestone {
  return { name, isBacklog, features };
}

function makeTracked(
  partial: Partial<TrackedFeature> & { externalId: string; name: string }
): TrackedFeature {
  return {
    externalId: partial.externalId,
    name: partial.name,
    status: partial.status ?? 'backlog',
    summary: partial.summary ?? `${partial.name} summary`,
    spec: partial.spec ?? null,
    plans: partial.plans ?? [],
    blockedBy: partial.blockedBy ?? [],
    assignee: partial.assignee ?? null,
    priority: partial.priority ?? null,
    milestone: partial.milestone ?? null,
    createdAt: partial.createdAt ?? '2026-05-09T00:00:00Z',
    updatedAt: partial.updatedAt ?? null,
  };
}

describe('buildMigrationPlan', () => {
  it('empty roadmap produces an empty plan', async () => {
    const plan = await buildMigrationPlan(
      makeRoadmap([]),
      [],
      async () => new Set<string>(),
      async () => null
    );
    expect(plan.toCreate).toEqual([]);
    expect(plan.toUpdate).toEqual([]);
    expect(plan.unchanged).toEqual([]);
    expect(plan.historyToAppend).toEqual([]);
    expect(plan.ambiguous).toEqual([]);
  });

  it('feature without External-ID and no title-collision lands in toCreate', async () => {
    const roadmap = makeRoadmap([makeMilestone('Backlog', [makeFeature({ name: 'Foo' })], true)]);
    const plan = await buildMigrationPlan(
      roadmap,
      [],
      async () => new Set<string>(),
      async () => null
    );
    expect(plan.toCreate).toHaveLength(1);
    expect(plan.toCreate[0]!.name).toBe('Foo');
    expect(plan.ambiguous).toHaveLength(0);
  });

  it('feature with External-ID whose body already matches lands in unchanged', async () => {
    const externalId = 'github:o/r#1';
    const roadmap = makeRoadmap([
      makeMilestone('Backlog', [makeFeature({ name: 'Foo', externalId, spec: 'a.md' })], true),
    ]);
    const existing = [makeTracked({ externalId, name: 'Foo' })];
    // Live body has matching spec.
    const liveBody = serializeBodyBlock('Foo summary', { spec: 'a.md' });
    const plan = await buildMigrationPlan(
      roadmap,
      existing,
      async () => new Set<string>(),
      async () => liveBody
    );
    expect(plan.unchanged).toHaveLength(1);
    expect(plan.unchanged[0]!.externalId).toBe(externalId);
    expect(plan.toUpdate).toHaveLength(0);
  });

  it('feature with External-ID whose body differs lands in toUpdate with a diff string', async () => {
    const externalId = 'github:o/r#1';
    const roadmap = makeRoadmap([
      makeMilestone('Backlog', [makeFeature({ name: 'Foo', externalId, priority: 'P1' })], true),
    ]);
    const existing = [makeTracked({ externalId, name: 'Foo' })];
    const liveBody = serializeBodyBlock('Foo summary', { priority: 'P2' });
    const plan = await buildMigrationPlan(
      roadmap,
      existing,
      async () => new Set<string>(),
      async () => liveBody
    );
    expect(plan.toUpdate).toHaveLength(1);
    expect(plan.toUpdate[0]!.diff).toContain('priority');
    expect(plan.unchanged).toHaveLength(0);
  });

  it('feature without External-ID but with a same-titled existing issue lands in ambiguous', async () => {
    const roadmap = makeRoadmap([makeMilestone('Backlog', [makeFeature({ name: 'Foo' })], true)]);
    const existing = [makeTracked({ externalId: 'github:o/r#99', name: 'Foo' })];
    const plan = await buildMigrationPlan(
      roadmap,
      existing,
      async () => new Set<string>(),
      async () => null
    );
    expect(plan.ambiguous).toHaveLength(1);
    expect(plan.ambiguous[0]!.name).toBe('Foo');
    expect(plan.ambiguous[0]!.existingIssueRef).toBe('github:o/r#99');
    expect(plan.toCreate).toHaveLength(0);
  });

  it('assignment-history events not present in fetched comments land in historyToAppend', async () => {
    const externalId = 'github:o/r#1';
    const roadmap = makeRoadmap(
      [makeMilestone('Backlog', [makeFeature({ name: 'Foo', externalId, spec: 'a.md' })], true)],
      [
        { feature: 'Foo', assignee: 'alice', action: 'assigned', date: '2026-05-01' },
        { feature: 'Foo', assignee: 'alice', action: 'completed', date: '2026-05-02' },
        { feature: 'Foo', assignee: 'alice', action: 'unassigned', date: '2026-05-03' },
      ]
    );
    const existing = [makeTracked({ externalId, name: 'Foo' })];
    const liveBody = serializeBodyBlock('Foo summary', { spec: 'a.md' });

    // Pre-existing comment: the 'assigned' event already has a hash on the issue.
    const claimedHash = hashHistoryEvent({
      type: 'claimed',
      actor: 'alice',
      at: '2026-05-01',
    });
    const plan = await buildMigrationPlan(
      roadmap,
      existing,
      async () => new Set<string>([claimedHash]),
      async () => liveBody
    );
    expect(plan.historyToAppend).toHaveLength(2);
    const eventTypes = plan.historyToAppend.map((e) => e.event.type).sort();
    expect(eventTypes).toEqual(['completed', 'released']);
  });
});
