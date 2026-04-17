import { describe, it, expect } from 'vitest';
import { clusterViolations } from '../../src/architecture/cluster-violations';
import type { ViolationSnapshot, Violation } from '../../src/architecture/types';

function makeViolation(id: string, file: string, category: string, detail: string): Violation {
  return {
    id,
    file,
    category: category as Violation['category'],
    detail,
    severity: 'error',
  };
}

function makeSnapshot(timestamp: string, violations: Violation[]): ViolationSnapshot {
  return { timestamp, violations };
}

function weeksAgo(weeks: number): string {
  return new Date(Date.now() - weeks * 7 * 24 * 60 * 60 * 1000).toISOString();
}

describe('clusterViolations', () => {
  it('returns empty clusters for empty snapshots', () => {
    const result = clusterViolations([], 4);
    expect(result).toEqual([]);
  });

  it('clusters violations by (category, pattern, scope)', () => {
    const snapshots: ViolationSnapshot[] = [
      makeSnapshot(weeksAgo(1), [
        makeViolation(
          'v1',
          'src/services/a.ts',
          'layer-violations',
          'core -> cli: src/services/a.ts imports src/cli/b.ts'
        ),
        makeViolation(
          'v2',
          'src/services/c.ts',
          'layer-violations',
          'core -> cli: src/services/c.ts imports src/cli/d.ts'
        ),
      ]),
      makeSnapshot(weeksAgo(2), [
        makeViolation(
          'v3',
          'src/services/e.ts',
          'layer-violations',
          'core -> cli: src/services/e.ts imports src/cli/f.ts'
        ),
      ]),
    ];

    const clusters = clusterViolations(snapshots, 4);
    expect(clusters).toHaveLength(1);
    expect(clusters[0]!.category).toBe('layer-violations');
    expect(clusters[0]!.pattern).toBe('core -> cli');
    expect(clusters[0]!.scope).toBe('src/services/');
    expect(clusters[0]!.violations).toHaveLength(3);
    expect(clusters[0]!.uniqueFiles.size).toBe(3);
  });

  it('separates clusters with different patterns', () => {
    const snapshots: ViolationSnapshot[] = [
      makeSnapshot(weeksAgo(1), [
        makeViolation(
          'v1',
          'src/a.ts',
          'layer-violations',
          'core -> cli: src/a.ts imports src/cli/b.ts'
        ),
        makeViolation(
          'v2',
          'src/a.ts',
          'layer-violations',
          'types -> graph: src/a.ts imports src/graph/c.ts'
        ),
      ]),
    ];

    const clusters = clusterViolations(snapshots, 4);
    expect(clusters).toHaveLength(2);
  });

  it('separates clusters with different scopes', () => {
    const snapshots: ViolationSnapshot[] = [
      makeSnapshot(weeksAgo(1), [
        makeViolation('v1', 'src/a/foo.ts', 'complexity', 'cyclomatic complexity 20 in fn'),
        makeViolation('v2', 'src/b/bar.ts', 'complexity', 'cyclomatic complexity 18 in fn2'),
      ]),
    ];

    const clusters = clusterViolations(snapshots, 4);
    expect(clusters).toHaveLength(2);
    const scopes = clusters.map((c) => c.scope).sort();
    expect(scopes).toEqual(['src/a/', 'src/b/']);
  });

  it('excludes violations outside the time window', () => {
    const snapshots: ViolationSnapshot[] = [
      makeSnapshot(weeksAgo(10), [
        makeViolation('v1', 'src/a.ts', 'complexity', 'cyclomatic complexity 20 in fn'),
      ]),
      makeSnapshot(weeksAgo(1), [
        makeViolation('v2', 'src/a.ts', 'complexity', 'cyclomatic complexity 22 in fn2'),
      ]),
    ];

    const clusters = clusterViolations(snapshots, 4);
    expect(clusters).toHaveLength(1);
    expect(clusters[0]!.violations).toHaveLength(1);
  });
});
