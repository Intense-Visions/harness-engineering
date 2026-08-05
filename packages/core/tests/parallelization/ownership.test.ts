import { describe, it, expect } from 'vitest';
import type { PlanTask } from '@harness-engineering/types';
import { forecastOwnershipConflicts, pathsOverlap } from '../../src/parallelization/ownership';

describe('pathsOverlap()', () => {
  it('treats identical concrete paths as overlapping', () => {
    expect(pathsOverlap('src/api/users.ts', 'src/api/users.ts')).toBe(true);
  });

  it('treats distinct concrete paths as disjoint', () => {
    expect(pathsOverlap('src/api/users.ts', 'src/api/orders.ts')).toBe(false);
  });

  it('matches a covering glob against a concrete path it contains', () => {
    expect(pathsOverlap('src/api/**', 'src/api/users.ts')).toBe(true);
    expect(pathsOverlap('src/api/users.ts', 'src/api/**')).toBe(true);
  });

  it('treats a narrower glob nested under a broader glob as overlapping', () => {
    expect(pathsOverlap('src/**', 'src/api/**')).toBe(true);
  });

  it('treats disjoint directory globs as non-overlapping', () => {
    expect(pathsOverlap('src/api/**', 'src/web/**')).toBe(false);
  });

  it('does not let a single-star glob cross directory boundaries', () => {
    expect(pathsOverlap('src/*.ts', 'src/api/handler.ts')).toBe(false);
  });

  it('matches dotfiles under a globstar (dot option enabled)', () => {
    expect(pathsOverlap('src/**', 'src/.eslintrc.js')).toBe(true);
  });
});

describe('forecastOwnershipConflicts()', () => {
  it('flags a pair whose owned globs overlap', () => {
    const tasks: PlanTask[] = [
      { id: 'a', files: [], owns: ['src/api/**'] },
      { id: 'b', files: [], owns: ['src/api/users.ts'] },
    ];
    const conflicts = forecastOwnershipConflicts(tasks);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({ taskA: 'a', taskB: 'b' });
    expect(conflicts[0]!.overlaps).toEqual([
      { ownedByA: 'src/api/**', ownedByB: 'src/api/users.ts' },
    ]);
  });

  it('does not flag tasks whose owned paths are disjoint', () => {
    const tasks: PlanTask[] = [
      { id: 'a', files: [], owns: ['src/api/**'] },
      { id: 'b', files: [], owns: ['src/web/**'] },
    ];
    expect(forecastOwnershipConflicts(tasks)).toEqual([]);
  });

  it('is a no-op when tasks declare no owns (absent field preserves behavior)', () => {
    const tasks: PlanTask[] = [
      { id: 'a', files: ['src/api/users.ts'] },
      { id: 'b', files: ['src/api/users.ts'] },
    ];
    expect(forecastOwnershipConflicts(tasks)).toEqual([]);
  });

  it('skips a pair when only one side declares owns', () => {
    const tasks: PlanTask[] = [
      { id: 'a', files: [], owns: ['src/api/**'] },
      { id: 'b', files: ['src/api/users.ts'] },
    ];
    expect(forecastOwnershipConflicts(tasks)).toEqual([]);
  });

  it('reports every overlapping pattern pair for a flagged pair', () => {
    const tasks: PlanTask[] = [
      { id: 'a', files: [], owns: ['src/api/**', 'src/shared/**'] },
      { id: 'b', files: [], owns: ['src/api/users.ts', 'src/shared/log.ts'] },
    ];
    const conflicts = forecastOwnershipConflicts(tasks);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]!.overlaps).toEqual([
      { ownedByA: 'src/api/**', ownedByB: 'src/api/users.ts' },
      { ownedByA: 'src/shared/**', ownedByB: 'src/shared/log.ts' },
    ]);
  });

  it('flags across three tasks pairwise and preserves input order', () => {
    const tasks: PlanTask[] = [
      { id: 'a', files: [], owns: ['src/api/**'] },
      { id: 'b', files: [], owns: ['src/web/**'] },
      { id: 'c', files: [], owns: ['src/api/handler.ts'] },
    ];
    const conflicts = forecastOwnershipConflicts(tasks);
    expect(conflicts.map((c) => [c.taskA, c.taskB])).toEqual([['a', 'c']]);
  });
});
