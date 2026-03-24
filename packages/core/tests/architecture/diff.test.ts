import { describe, it, expect } from 'vitest';
import { diff } from '../../src/architecture/diff';
import type { MetricResult, ArchBaseline } from '../../src/architecture/types';

function makeBaseline(
  metrics: Record<string, { value: number; violationIds: string[] }>
): ArchBaseline {
  return {
    version: 1,
    updatedAt: '2026-03-23T10:00:00.000Z',
    updatedFrom: 'baseline-hash',
    metrics,
  };
}

describe('diff()', () => {
  it('passes when current matches baseline exactly', () => {
    const baseline = makeBaseline({
      'circular-deps': { value: 2, violationIds: ['cd-1', 'cd-2'] },
    });
    const current: MetricResult[] = [
      {
        category: 'circular-deps',
        scope: 'project',
        value: 2,
        violations: [
          { id: 'cd-1', file: 'src/a.ts', detail: 'Cycle a', severity: 'error' },
          { id: 'cd-2', file: 'src/b.ts', detail: 'Cycle b', severity: 'error' },
        ],
      },
    ];

    const result = diff(current, baseline);

    expect(result.passed).toBe(true);
    expect(result.newViolations).toEqual([]);
    expect(result.resolvedViolations).toEqual([]);
    expect(result.preExisting).toEqual(['cd-1', 'cd-2']);
    expect(result.regressions).toEqual([]);
  });

  it('fails when there are new violations', () => {
    const baseline = makeBaseline({
      'circular-deps': { value: 1, violationIds: ['cd-1'] },
    });
    const current: MetricResult[] = [
      {
        category: 'circular-deps',
        scope: 'project',
        value: 2,
        violations: [
          { id: 'cd-1', file: 'src/a.ts', detail: 'Cycle a', severity: 'error' },
          { id: 'cd-new', file: 'src/c.ts', detail: 'New cycle', severity: 'error' },
        ],
      },
    ];

    const result = diff(current, baseline);

    expect(result.passed).toBe(false);
    expect(result.newViolations).toHaveLength(1);
    expect(result.newViolations[0]!.id).toBe('cd-new');
    expect(result.preExisting).toEqual(['cd-1']);
  });

  it('detects resolved violations', () => {
    const baseline = makeBaseline({
      'circular-deps': { value: 2, violationIds: ['cd-1', 'cd-2'] },
    });
    const current: MetricResult[] = [
      {
        category: 'circular-deps',
        scope: 'project',
        value: 1,
        violations: [{ id: 'cd-1', file: 'src/a.ts', detail: 'Cycle a', severity: 'error' }],
      },
    ];

    const result = diff(current, baseline);

    expect(result.passed).toBe(true);
    expect(result.resolvedViolations).toEqual(['cd-2']);
    expect(result.preExisting).toEqual(['cd-1']);
  });

  it('fails when aggregate value exceeds baseline (regression)', () => {
    const baseline = makeBaseline({
      complexity: { value: 10, violationIds: ['cx-1'] },
    });
    const current: MetricResult[] = [
      {
        category: 'complexity',
        scope: 'project',
        value: 15,
        violations: [{ id: 'cx-1', file: 'src/a.ts', detail: 'High', severity: 'warning' }],
      },
    ];

    const result = diff(current, baseline);

    expect(result.passed).toBe(false);
    expect(result.regressions).toHaveLength(1);
    expect(result.regressions[0]).toEqual({
      category: 'complexity',
      baselineValue: 10,
      currentValue: 15,
      delta: 5,
    });
    // No new violations since cx-1 is pre-existing
    expect(result.newViolations).toEqual([]);
    expect(result.preExisting).toEqual(['cx-1']);
  });

  it('handles multiple categories independently', () => {
    const baseline = makeBaseline({
      'circular-deps': { value: 1, violationIds: ['cd-1'] },
      complexity: { value: 5, violationIds: ['cx-1'] },
    });
    const current: MetricResult[] = [
      {
        category: 'circular-deps',
        scope: 'project',
        value: 0,
        violations: [],
      },
      {
        category: 'complexity',
        scope: 'project',
        value: 8,
        violations: [
          { id: 'cx-1', file: 'src/a.ts', detail: 'High', severity: 'warning' },
          { id: 'cx-2', file: 'src/b.ts', detail: 'New', severity: 'warning' },
        ],
      },
    ];

    const result = diff(current, baseline);

    expect(result.passed).toBe(false);
    // circular-deps resolved
    expect(result.resolvedViolations).toContain('cd-1');
    // complexity has new violation and regression
    expect(result.newViolations).toHaveLength(1);
    expect(result.newViolations[0]!.id).toBe('cx-2');
    expect(result.regressions).toHaveLength(1);
    expect(result.regressions[0]!.category).toBe('complexity');
  });

  it('passes when aggregate decreases (improvement)', () => {
    const baseline = makeBaseline({
      complexity: { value: 10, violationIds: ['cx-1', 'cx-2'] },
    });
    const current: MetricResult[] = [
      {
        category: 'complexity',
        scope: 'project',
        value: 7,
        violations: [{ id: 'cx-1', file: 'src/a.ts', detail: 'High', severity: 'warning' }],
      },
    ];

    const result = diff(current, baseline);

    expect(result.passed).toBe(true);
    expect(result.regressions).toEqual([]);
    expect(result.resolvedViolations).toContain('cx-2');
  });

  it('handles categories in current that are not in baseline', () => {
    const baseline = makeBaseline({
      'circular-deps': { value: 0, violationIds: [] },
    });
    const current: MetricResult[] = [
      {
        category: 'circular-deps',
        scope: 'project',
        value: 0,
        violations: [],
      },
      {
        category: 'complexity',
        scope: 'project',
        value: 5,
        violations: [{ id: 'cx-1', file: 'src/a.ts', detail: 'High', severity: 'warning' }],
      },
    ];

    const result = diff(current, baseline);

    // New category not in baseline — all violations are new
    expect(result.passed).toBe(false);
    expect(result.newViolations).toHaveLength(1);
    expect(result.newViolations[0]!.id).toBe('cx-1');
  });

  it('aggregates multiple MetricResults for the same category', () => {
    const baseline = makeBaseline({
      complexity: { value: 15, violationIds: ['cx-1', 'cx-2'] },
    });
    const current: MetricResult[] = [
      {
        category: 'complexity',
        scope: 'src/services',
        value: 8,
        violations: [
          { id: 'cx-1', file: 'src/services/a.ts', detail: 'High', severity: 'warning' },
        ],
      },
      {
        category: 'complexity',
        scope: 'src/api',
        value: 7,
        violations: [{ id: 'cx-2', file: 'src/api/b.ts', detail: 'High', severity: 'warning' }],
      },
    ];

    const result = diff(current, baseline);

    expect(result.passed).toBe(true);
    expect(result.preExisting).toEqual(expect.arrayContaining(['cx-1', 'cx-2']));
    expect(result.regressions).toEqual([]);
  });

  it('handles new category with zero violations as passing', () => {
    const baseline = makeBaseline({
      'circular-deps': { value: 0, violationIds: [] },
    });
    const current: MetricResult[] = [
      { category: 'circular-deps', scope: 'project', value: 0, violations: [] },
      { category: 'complexity', scope: 'project', value: 0, violations: [] },
    ];

    const result = diff(current, baseline);

    expect(result.passed).toBe(true);
    expect(result.newViolations).toEqual([]);
  });

  it('resolves all violations when category disappears from current', () => {
    const baseline = makeBaseline({
      'circular-deps': { value: 2, violationIds: ['cd-1', 'cd-2'] },
      complexity: { value: 5, violationIds: ['cx-1'] },
    });
    // Only complexity in current, circular-deps entirely gone
    const current: MetricResult[] = [
      {
        category: 'complexity',
        scope: 'project',
        value: 5,
        violations: [{ id: 'cx-1', file: 'src/a.ts', detail: 'High', severity: 'warning' }],
      },
    ];

    const result = diff(current, baseline);

    expect(result.passed).toBe(true);
    expect(result.resolvedViolations).toContain('cd-1');
    expect(result.resolvedViolations).toContain('cd-2');
    expect(result.preExisting).toEqual(['cx-1']);
  });

  it('passes with empty current and empty baseline', () => {
    const baseline = makeBaseline({});
    const current: MetricResult[] = [];

    const result = diff(current, baseline);

    expect(result.passed).toBe(true);
    expect(result.newViolations).toEqual([]);
    expect(result.resolvedViolations).toEqual([]);
    expect(result.preExisting).toEqual([]);
    expect(result.regressions).toEqual([]);
  });

  it('new violations contain full Violation objects not just IDs', () => {
    const baseline = makeBaseline({
      'forbidden-imports': { value: 0, violationIds: [] },
    });
    const current: MetricResult[] = [
      {
        category: 'forbidden-imports',
        scope: 'project',
        value: 1,
        violations: [
          {
            id: 'fi-1',
            file: 'src/api/handler.ts',
            detail: 'Imports from src/internal',
            severity: 'error',
          },
        ],
      },
    ];

    const result = diff(current, baseline);

    expect(result.passed).toBe(false);
    expect(result.newViolations[0]).toEqual({
      id: 'fi-1',
      file: 'src/api/handler.ts',
      detail: 'Imports from src/internal',
      severity: 'error',
    });
  });
});
