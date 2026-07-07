import { describe, it, expect } from 'vitest';
import type { ConflictPrediction } from '@harness-engineering/graph';
import {
  buildTaskGraph,
  classifyFiring,
  deriveFiring,
  planParallelization,
  validatePlanTasks,
} from '../../src/parallelization/plan';
import type { FiringDecision, WaveSeverity } from '../../src/parallelization/plan';

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

  it('errors on a combined explicit+implicit cycle, consistent with plan.cyclic', () => {
    // a explicitly depends on b; a and b share file f.ts, so buildTaskGraph
    // also orients b->a (later depends on earlier). The union is a real cycle
    // that the planner reports in cyclic[] and drops — validation must agree.
    const tasks = [
      { id: 'a', files: ['f.ts'], dependsOn: ['b'] },
      { id: 'b', files: ['f.ts'] },
    ];
    const { errors } = validatePlanTasks(tasks);
    const cycleErr = errors.find((e) => /cycle/i.test(e));
    expect(cycleErr).toBeDefined();
    expect(cycleErr).toContain('a');
    expect(cycleErr).toContain('b');
    // The planner and validator must name the same cyclic set.
    const plan = planParallelization({ tasks, conflicts: noConflicts(['a', 'b']) });
    expect(plan.cyclic.sort()).toEqual(['a', 'b']);
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

describe('classifyFiring() truth table', () => {
  const MIN = 3;
  const big = MIN; // wave size at/above minWaveSize so the size gate does not mask severity

  // Every (severity × analysisLevel) combination at a large-enough wave.
  const cases: Array<[WaveSeverity, 'graph-expanded' | 'file-only', FiringDecision]> = [
    ['none', 'graph-expanded', 'auto-dispatch'],
    ['none', 'file-only', 'confirm'],
    ['low', 'graph-expanded', 'auto-dispatch'],
    ['low', 'file-only', 'confirm'],
    ['medium', 'graph-expanded', 'confirm'],
    ['medium', 'file-only', 'confirm'],
    ['high', 'graph-expanded', 'serialize'],
    ['high', 'file-only', 'serialize'],
  ];

  it.each(cases)('%s severity + %s analysis => %s', (severity, analysisLevel, expected) => {
    const { firing, reason } = classifyFiring(severity, big, MIN, analysisLevel);
    expect(firing).toBe(expected);
    expect(reason.length).toBeGreaterThan(0);
  });

  it('serializes any non-high severity below minWaveSize (size gate)', () => {
    for (const sev of ['none', 'low', 'medium'] as WaveSeverity[]) {
      expect(classifyFiring(sev, MIN - 1, MIN, 'graph-expanded').firing).toBe('serialize');
    }
  });

  it('attributes a high-severity below-min wave to severity, not wave size (P2-SUG-4)', () => {
    // Precedence guard: the high-severity branch runs BEFORE the size gate, so
    // a small high-severity wave serializes and its reason cites severity.
    const { firing, reason } = classifyFiring('high', MIN - 1, MIN, 'graph-expanded');
    expect(firing).toBe('serialize');
    expect(reason).toMatch(/high-severity/i);
    expect(reason).not.toMatch(/wave size/i);
  });

  it('attributes a medium-severity below-min wave to wave size, not severity (P2-SUG-4)', () => {
    // Precedence guard: the size gate runs BEFORE the medium branch, so a small
    // medium wave serializes and its reason cites wave size, not severity.
    const { firing, reason } = classifyFiring('medium', MIN - 1, MIN, 'graph-expanded');
    expect(firing).toBe('serialize');
    expect(reason).toMatch(/wave size/i);
    expect(reason).not.toMatch(/medium-severity/i);
  });

  it('reason names the deciding factor', () => {
    expect(classifyFiring('high', big, MIN, 'graph-expanded').reason).toMatch(/high-severity/i);
    expect(classifyFiring('none', 1, MIN, 'graph-expanded').reason).toMatch(/wave size/i);
    expect(classifyFiring('medium', big, MIN, 'graph-expanded').reason).toMatch(/medium-severity/i);
    expect(classifyFiring('none', big, MIN, 'file-only').reason).toMatch(/file-only/i);
    expect(classifyFiring('none', big, MIN, 'graph-expanded').reason).toMatch(/graph-expanded/i);
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

  it('keeps waves, serialized, and cyclic mutually disjoint (Truth #6)', () => {
    // a,b share a file (implicit edge a->b) AND have a high-severity conflict
    // so both are forced serial. c,d,e are independent and clean.
    const tasks = [
      { id: 'a', files: ['shared.ts'] },
      { id: 'b', files: ['shared.ts'] },
      { id: 'c', files: ['c.ts'] },
      { id: 'd', files: ['d.ts'] },
      { id: 'e', files: ['e.ts'] },
    ];
    const conflicts: ConflictPrediction = {
      ...noConflicts(['a', 'b', 'c', 'd', 'e']),
      conflicts: [
        { taskA: 'a', taskB: 'b', severity: 'high', reason: '', mitigation: '', overlaps: [] },
      ],
      groups: [['a', 'b'], ['c'], ['d'], ['e']],
      summary: { high: 1, medium: 0, low: 0, regrouped: true },
    };
    const plan = planParallelization({ tasks, conflicts });

    const waveMembers = plan.waves.flatMap((w) => w.tasks);
    const serializedSet = new Set(plan.serialized);
    const cyclicSet = new Set(plan.cyclic);

    // No task may appear in both a wave and serialized...
    for (const id of waveMembers) expect(serializedSet.has(id)).toBe(false);
    // ...nor in both a wave and cyclic.
    for (const id of waveMembers) expect(cyclicSet.has(id)).toBe(false);
    // The forced-serial pair is present exactly in serialized.
    expect(plan.serialized).toEqual(['a', 'b']);
    // Deterministic, sorted output preserved.
    expect(waveMembers).toEqual([...waveMembers].sort());
    expect(plan.serialized).toEqual([...plan.serialized].sort());
  });

  it('narrates a multi-wave DAG: names tasks, waits-on, and firing reason (Truth #4)', () => {
    // a is a root; b,c,d all depend on a (wave 2, size 3 => auto-dispatch);
    // e depends on b (wave 3). All clean + graph-expanded.
    const tasks = [
      { id: 'a', files: [] },
      { id: 'b', files: [], dependsOn: ['a'] },
      { id: 'c', files: [], dependsOn: ['a'] },
      { id: 'd', files: [], dependsOn: ['a'] },
      { id: 'e', files: [], dependsOn: ['b'] },
    ];
    const plan = planParallelization({
      tasks,
      conflicts: noConflicts(['a', 'b', 'c', 'd', 'e']),
    });
    const n = plan.narration;
    expect(n).toContain('Wave 1'); // legacy assertion preserved
    expect(n).toContain('[b, c, d]'); // names the wave-2 tasks
    expect(n).toMatch(/waits on[^\n]*a/); // wave 2 waits on a
    expect(n).toContain('auto-dispatch');
    expect(n).toContain('graph-expanded');
  });

  it('narrates the root-wave clause and the summary/count header (P2-SUG-5)', () => {
    // Three independent, clean, graph-expanded tasks => a single auto-dispatch
    // root wave with no upstream dependencies.
    const tasks = [
      { id: 'a', files: [] },
      { id: 'b', files: [] },
      { id: 'c', files: [] },
    ];
    const n = planParallelization({ tasks, conflicts: noConflicts(['a', 'b', 'c']) }).narration;
    // Summary/count header line (wave/serialized/cyclic counts).
    expect(n).toContain('Parallelization: 1 wave(s), 0 serialized, 0 cyclic.');
    // Root-wave clause for a wave with no upstream.
    expect(n).toContain('no upstream dependencies (root wave)');
  });

  it('narration is deterministic across runs (Truth #5)', () => {
    const tasks = [
      { id: 'a', files: [] },
      { id: 'b', files: [], dependsOn: ['a'] },
      { id: 'c', files: [], dependsOn: ['a'] },
    ];
    const conflicts = noConflicts(['a', 'b', 'c']);
    const first = planParallelization({ tasks, conflicts }).narration;
    const second = planParallelization({ tasks, conflicts }).narration;
    expect(first).toBe(second);
  });

  it('caps a wave at confirm when it depends on a serialized (cross-bucket) task (P2-IMP-1)', () => {
    // High-severity group [a,x] => both land in `serialized`. b,c,d each depend
    // on a. Without the cross-bucket guard, [b,c,d] is a clean size-3
    // graph-expanded wave => auto-dispatch, and a Phase-3 scheduler keying off
    // `firing` alone would fire b,c,d before a (which runs in the serialized
    // channel, NOT as a wave) ever ran.
    const tasks = [
      { id: 'a', files: ['a.ts'] },
      { id: 'x', files: ['x.ts'] },
      { id: 'b', files: ['b.ts'], dependsOn: ['a'] },
      { id: 'c', files: ['c.ts'], dependsOn: ['a'] },
      { id: 'd', files: ['d.ts'], dependsOn: ['a'] },
    ];
    const conflicts: ConflictPrediction = {
      ...noConflicts(['a', 'x', 'b', 'c', 'd']),
      conflicts: [
        { taskA: 'a', taskB: 'x', severity: 'high', reason: '', mitigation: '', overlaps: [] },
      ],
      groups: [['a', 'x'], ['b'], ['c'], ['d']],
      summary: { high: 1, medium: 0, low: 0, regrouped: true },
    };
    const plan = planParallelization({ tasks, conflicts });

    // a,x are forced serial and removed from waves; the dependent wave is [b,c,d].
    expect(plan.serialized).toEqual(['a', 'x']);
    const depWave = plan.waves.find((w) => w.tasks.includes('b'));
    expect(depWave).toBeDefined();
    expect(depWave!.tasks).toEqual(['b', 'c', 'd']);
    // The guard downgrades auto-dispatch -> confirm (capped, never below confirm).
    expect(depWave!.firing).toBe('confirm');
    // Narration names the serialized upstream explicitly as a cross-bucket wait,
    // distinct from a plain earlier-wave dependency.
    expect(plan.narration).toContain('a (serialized)');
  });

  it('does not downgrade a wave whose upstream runs in an earlier wave, not the serialized channel', () => {
    // b,c,d depend on a, but a is a clean root wave (not serialized/cyclic), so
    // the cross-bucket guard must NOT fire — [b,c,d] stays auto-dispatch and the
    // wait is a plain (unlabeled) earlier-wave dependency.
    const tasks = [
      { id: 'a', files: [] },
      { id: 'b', files: [], dependsOn: ['a'] },
      { id: 'c', files: [], dependsOn: ['a'] },
      { id: 'd', files: [], dependsOn: ['a'] },
    ];
    const plan = planParallelization({
      tasks,
      conflicts: noConflicts(['a', 'b', 'c', 'd']),
    });
    const depWave = plan.waves.find((w) => w.tasks.includes('b'))!;
    expect(depWave.firing).toBe('auto-dispatch');
    expect(plan.narration).not.toContain('a (serialized)');
    expect(plan.narration).not.toContain('a (cyclic)');
  });

  it('narrates a serialized high-severity group with its reason', () => {
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
    const n = planParallelization({ tasks, conflicts }).narration;
    expect(n).toContain('Serialized');
    expect(n).toContain('a');
    expect(n).toContain('b');
  });

  it('narrates the file-only confirm rationale', () => {
    const tasks = [
      { id: 'a', files: [] },
      { id: 'b', files: [] },
      { id: 'c', files: [] },
    ];
    const conflicts: ConflictPrediction = {
      ...noConflicts(['a', 'b', 'c']),
      analysisLevel: 'file-only',
    };
    const n = planParallelization({ tasks, conflicts }).narration;
    expect(n).toContain('confirm');
    expect(n).toContain('file-only');
  });
});
