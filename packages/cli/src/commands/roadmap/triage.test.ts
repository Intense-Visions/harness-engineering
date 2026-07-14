// packages/cli/src/commands/roadmap/triage.test.ts
//
// Roadmap Auto-Triage — Phase 1, Task 6: the read-only report core (SC1 shape, SC8 gating).
//
// Exercises the pure report core offline (no live model, no graph): every actionable item
// gets a verdict, non-actionable items are excluded, ranking is applied, and the renderers
// produce human + JSON. The gating (SC8) is enforced in the command action; here we pin the
// pure core's behavior.

import { describe, it, expect } from 'vitest';
import { GraphStore } from '@harness-engineering/graph';
import type { GraphNode } from '@harness-engineering/graph';
import type { Roadmap, RoadmapFeature } from '@harness-engineering/types';
import { isActionable, featureToIssue, runTriageReport, renderHuman, renderJson } from './triage';

function feature(overrides: Partial<RoadmapFeature>): RoadmapFeature {
  return {
    name: 'Rename BackendRouter',
    status: 'planned',
    spec: null,
    plans: [],
    blockedBy: [],
    summary: 'Rename the `BackendRouter` symbol.',
    assignee: null,
    priority: null,
    externalId: 'github:acme/repo#1',
    updatedAt: null,
    ...overrides,
  };
}

function roadmapWith(features: RoadmapFeature[]): Roadmap {
  return {
    frontmatter: {} as Roadmap['frontmatter'],
    milestones: [{ name: 'MVP', isBacklog: false, features }],
    assignmentHistory: [],
  } as Roadmap;
}

function node(id: string, name: string): GraphNode {
  return { id, name, type: 'class', metadata: {} } as GraphNode;
}

describe('isActionable', () => {
  it('accepts planned + backlog, rejects in-progress/done/blocked/needs-human', () => {
    expect(isActionable(feature({ status: 'planned' }))).toBe(true);
    expect(isActionable(feature({ status: 'backlog' }))).toBe(true);
    expect(isActionable(feature({ status: 'in-progress' }))).toBe(false);
    expect(isActionable(feature({ status: 'done' }))).toBe(false);
    expect(isActionable(feature({ status: 'blocked' }))).toBe(false);
    expect(isActionable(feature({ status: 'needs-human' }))).toBe(false);
  });
});

describe('featureToIssue', () => {
  it('maps name/summary/status/externalId onto the Issue model', () => {
    const issue = featureToIssue(feature({}));
    expect(issue.title).toBe('Rename BackendRouter');
    expect(issue.description).toContain('BackendRouter');
    expect(issue.externalId).toBe('github:acme/repo#1');
  });
});

describe('runTriageReport — SC1 (N items → N verdicts) + actionable filter', () => {
  it('emits one verdict per actionable item and excludes non-actionable ones', async () => {
    const rm = roadmapWith([
      feature({ name: 'A', status: 'planned' }),
      feature({ name: 'B', status: 'done' }), // excluded
      feature({ name: 'C', status: 'backlog' }),
    ]);
    const rows = await runTriageReport(rm); // offline, no graph
    expect(rows.map((r) => r.name).sort()).toEqual(['A', 'C']);
    for (const row of rows) {
      expect(row.verdict.levers).toBeDefined();
      expect(typeof row.verdict.dispatchable).toBe('boolean');
    }
  });

  it('offline (no graph) holds everything to human as unresolved-scope (fail-safe)', async () => {
    const rm = roadmapWith([feature({ name: 'A' })]);
    const rows = await runTriageReport(rm);
    expect(rows[0]?.verdict.dispatchable).toBe(false);
    expect(rows[0]?.verdict.holdReason).toBe('unresolved-scope');
  });

  it('with a graph that resolves the entity, the scope lever produces a real estimate', async () => {
    const store = new GraphStore();
    store.addNode(node('class:BackendRouter', 'BackendRouter'));
    const rm = roadmapWith([feature({ name: 'Rename BackendRouter' })]);
    const rows = await runTriageReport(rm, { graphStore: store });
    expect(rows[0]?.verdict.levers.scope.value).not.toBe('unknown');
  });

  it('ranks rows deterministically (higher pilot score first)', async () => {
    const rm = roadmapWith([
      feature({ name: 'low', priority: 'P3' }),
      feature({ name: 'high', priority: 'P0' }),
    ]);
    const rows = await runTriageReport(rm);
    // Equal (offline) confidence/effort ⇒ impact from priority drives the order.
    expect(rows[0]?.name).toBe('high');
  });
});

describe('renderers', () => {
  it('renderHuman includes a per-item badge and a summary line', async () => {
    const rm = roadmapWith([feature({ name: 'A' })]);
    const out = renderHuman(await runTriageReport(rm));
    expect(out).toContain('A');
    expect(out).toMatch(/dispatchable/i);
  });

  it('renderJson emits a stable machine-readable shape', async () => {
    const rm = roadmapWith([feature({ name: 'A' })]);
    const json = JSON.parse(renderJson(await runTriageReport(rm)));
    expect(json.count).toBe(1);
    expect(json.items[0].name).toBe('A');
    expect(json.items[0]).toHaveProperty('holdReason');
    expect(json.items[0]).toHaveProperty('levers');
  });

  it('renderHuman handles the empty case', () => {
    expect(renderHuman([])).toContain('No actionable');
  });
});
