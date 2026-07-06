import { describe, it, expect } from 'vitest';
import type { ConflictPrediction } from '@harness-engineering/graph';
import {
  buildTaskGraph,
  deriveFiring,
  planParallelization,
  validatePlanTasks,
} from '../../src/parallelization/plan';

const noConflicts = (tasks: string[]): ConflictPrediction => ({
  tasks,
  analysisLevel: 'graph-expanded',
  depth: 1,
  conflicts: [],
  groups: tasks.map((t) => [t]),
  summary: { high: 0, medium: 0, low: 0, regrouped: false },
  verdict: '',
});

describe('buildTaskGraph()', () => {
  it('carries explicit dependsOn edges through', () => {
    const nodes = buildTaskGraph([
      { id: 'a', files: [] },
      { id: 'b', files: [], dependsOn: ['a'] },
    ]);
    const b = nodes.find((n) => n.id === 'b')!;
    expect(b.dependsOn).toContain('a');
  });

  it('adds an implicit edge for a shared file (later depends on earlier)', () => {
    const nodes = buildTaskGraph([
      { id: 'a', files: ['shared.ts'] },
      { id: 'b', files: ['shared.ts'] },
    ]);
    const b = nodes.find((n) => n.id === 'b')!;
    expect(b.dependsOn).toContain('a');
  });

  it('adds an implicit edge for overlapping owns globs', () => {
    const nodes = buildTaskGraph([
      { id: 'a', files: [], owns: ['src/x.ts'] },
      { id: 'b', files: ['src/x.ts'] },
    ]);
    const b = nodes.find((n) => n.id === 'b')!;
    expect(b.dependsOn).toContain('a');
  });

  it('does not duplicate an edge already present via dependsOn', () => {
    const nodes = buildTaskGraph([
      { id: 'a', files: ['shared.ts'] },
      { id: 'b', files: ['shared.ts'], dependsOn: ['a'] },
    ]);
    const b = nodes.find((n) => n.id === 'b')!;
    expect(b.dependsOn.filter((d) => d === 'a')).toHaveLength(1);
  });
});

describe('validatePlanTasks()', () => {
  it('errors on an unknown dependsOn id', () => {
    const { errors } = validatePlanTasks([{ id: 'a', files: [], dependsOn: ['ghost'] }]);
    expect(errors.some((e) => e.includes('ghost'))).toBe(true);
  });

  it('errors on a dependency cycle', () => {
    const { errors } = validatePlanTasks([
      { id: 'a', files: [], dependsOn: ['b'] },
      { id: 'b', files: [], dependsOn: ['a'] },
    ]);
    expect(errors.some((e) => /cycle/i.test(e))).toBe(true);
  });

  it('warns when a task depends on a later-declared task (consumer before producer)', () => {
    const { warnings, errors } = validatePlanTasks([
      { id: 'a', files: [], dependsOn: ['b'] }, // a declared before its producer b
      { id: 'b', files: [] },
    ]);
    expect(errors).toHaveLength(0);
    expect(warnings.some((w) => w.includes('a') && w.includes('b'))).toBe(true);
  });

  it('returns no errors/warnings for a well-ordered acyclic set', () => {
    const { errors, warnings } = validatePlanTasks([
      { id: 'a', files: [] },
      { id: 'b', files: [], dependsOn: ['a'] },
    ]);
    expect(errors).toHaveLength(0);
    expect(warnings).toHaveLength(0);
  });
});

describe('deriveFiring()', () => {
  it('serializes a wave with a high-severity member', () => {
    expect(deriveFiring('high', 5, 3, 'graph-expanded')).toBe('serialize');
  });
  it('serializes a wave smaller than minWaveSize', () => {
    expect(deriveFiring('none', 2, 3, 'graph-expanded')).toBe('serialize');
  });
  it('confirms a medium-severity wave at/above minWaveSize', () => {
    expect(deriveFiring('medium', 3, 3, 'graph-expanded')).toBe('confirm');
  });
  it('confirms when analysis is file-only even with no conflicts', () => {
    expect(deriveFiring('none', 3, 3, 'file-only')).toBe('confirm');
  });
  it('auto-dispatches a clean, large-enough, graph-expanded wave', () => {
    expect(deriveFiring('none', 3, 3, 'graph-expanded')).toBe('auto-dispatch');
  });
});

describe('planParallelization()', () => {
  it('produces independent waves for an acyclic dependsOn chain', () => {
    const tasks = [
      { id: 'a', files: [] },
      { id: 'b', files: [], dependsOn: ['a'] },
    ];
    const plan = planParallelization({ tasks, conflicts: noConflicts(['a', 'b']) });
    expect(plan.waves.map((w) => w.tasks)).toEqual([['a'], ['b']]);
    expect(plan.cyclic).toEqual([]);
    expect(plan.narration).toContain('Wave 1');
  });

  it('separates file-overlapping tasks across waves (Truth #4)', () => {
    const tasks = [
      { id: 'a', files: ['shared.ts'] },
      { id: 'b', files: ['shared.ts'] },
    ];
    const plan = planParallelization({ tasks, conflicts: noConflicts(['a', 'b']) });
    // implicit edge a->b => b in a later wave, not co-scheduled with a
    expect(plan.waves).toHaveLength(2);
    expect(plan.waves[0]!.tasks).toEqual(['a']);
    expect(plan.waves[1]!.tasks).toEqual(['b']);
  });

  it('reports cyclic tasks in cyclic and serialized (Truth #5)', () => {
    const tasks = [
      { id: 'a', files: [], dependsOn: ['b'] },
      { id: 'b', files: [], dependsOn: ['a'] },
    ];
    const plan = planParallelization({ tasks, conflicts: noConflicts(['a', 'b']) });
    expect(plan.cyclic.sort()).toEqual(['a', 'b']);
    expect(plan.serialized).toEqual(expect.arrayContaining(['a', 'b']));
  });

  it('serializes high-severity conflict group members', () => {
    const tasks = [
      { id: 'a', files: ['x.ts'] },
      { id: 'b', files: ['y.ts'] },
    ];
    const conflicts: ConflictPrediction = {
      ...noConflicts(['a', 'b']),
      conflicts: [
        { taskA: 'a', taskB: 'b', severity: 'high', reason: '', mitigation: '', overlaps: [] },
      ],
      groups: [['a', 'b']],
      summary: { high: 1, medium: 0, low: 0, regrouped: true },
    };
    const plan = planParallelization({ tasks, conflicts });
    expect(plan.serialized).toEqual(expect.arrayContaining(['a', 'b']));
  });
});
