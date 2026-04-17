import { describe, it, expect } from 'vitest';
import { detectEmergentConstraints } from '../../src/architecture/detect-emergence';
import type { ViolationHistory, Violation } from '../../src/architecture/types';

function makeViolation(id: string, file: string, category: string, detail: string): Violation {
  return {
    id,
    file,
    category: category as Violation['category'],
    detail,
    severity: 'error',
  };
}

function weeksAgo(weeks: number): string {
  return new Date(Date.now() - weeks * 7 * 24 * 60 * 60 * 1000).toISOString();
}

describe('detectEmergentConstraints', () => {
  it('returns empty suggestions when history is empty', () => {
    const history: ViolationHistory = { version: 1, snapshots: [] };
    const result = detectEmergentConstraints(history, {});
    expect(result.suggestions).toEqual([]);
    expect(result.totalViolationsAnalyzed).toBe(0);
    expect(result.windowWeeks).toBe(4);
    expect(result.minOccurrences).toBe(3);
  });

  it('returns empty suggestions when no cluster meets threshold', () => {
    const history: ViolationHistory = {
      version: 1,
      snapshots: [
        {
          timestamp: weeksAgo(1),
          violations: [
            makeViolation('v1', 'src/a.ts', 'complexity', 'cyclomatic complexity 20 in fn'),
          ],
        },
      ],
    };
    const result = detectEmergentConstraints(history, { minOccurrences: 3 });
    expect(result.suggestions).toEqual([]);
  });

  it('detects emergent constraint when cluster meets threshold', () => {
    const history: ViolationHistory = {
      version: 1,
      snapshots: [
        {
          timestamp: weeksAgo(1),
          violations: [
            makeViolation(
              'v1',
              'src/services/a.ts',
              'layer-violations',
              'core -> cli: src/services/a.ts imports src/cli/x.ts'
            ),
            makeViolation(
              'v2',
              'src/services/b.ts',
              'layer-violations',
              'core -> cli: src/services/b.ts imports src/cli/y.ts'
            ),
          ],
        },
        {
          timestamp: weeksAgo(2),
          violations: [
            makeViolation(
              'v3',
              'src/services/c.ts',
              'layer-violations',
              'core -> cli: src/services/c.ts imports src/cli/z.ts'
            ),
          ],
        },
      ],
    };

    const result = detectEmergentConstraints(history, { minOccurrences: 3 });
    expect(result.suggestions).toHaveLength(1);
    const suggestion = result.suggestions[0]!;
    expect(suggestion.suggestedRule.category).toBe('layer-violations');
    expect(suggestion.suggestedRule.scope).toBe('src/services/');
    expect(suggestion.occurrences).toBe(3);
    expect(suggestion.uniqueFiles).toBe(3);
    expect(suggestion.pattern).toBe('core -> cli');
    expect(suggestion.sampleViolations.length).toBeLessThanOrEqual(5);
    expect(suggestion.rationale).toContain('3');
    expect(suggestion.suggestedRule.id).toBeDefined();
  });

  it('assigns high confidence when >= 2x minOccurrences and >= 3 unique files', () => {
    const violations = Array.from({ length: 6 }, (_, i) =>
      makeViolation(
        `v${i}`,
        `src/svc/f${i}.ts`,
        'layer-violations',
        `core -> cli: src/svc/f${i}.ts imports src/cli/x${i}.ts`
      )
    );
    const history: ViolationHistory = {
      version: 1,
      snapshots: [{ timestamp: weeksAgo(1), violations }],
    };

    const result = detectEmergentConstraints(history, { minOccurrences: 3 });
    expect(result.suggestions[0]!.confidence).toBe('high');
  });

  it('assigns medium confidence when >= minOccurrences and >= 2 unique files', () => {
    const history: ViolationHistory = {
      version: 1,
      snapshots: [
        {
          timestamp: weeksAgo(1),
          violations: [
            makeViolation('v1', 'src/svc/a.ts', 'complexity', 'cyclomatic complexity 20 in fn1'),
            makeViolation('v2', 'src/svc/b.ts', 'complexity', 'cyclomatic complexity 22 in fn2'),
            makeViolation('v3', 'src/svc/a.ts', 'complexity', 'cyclomatic complexity 25 in fn3'),
          ],
        },
      ],
    };

    const result = detectEmergentConstraints(history, { minOccurrences: 3 });
    expect(result.suggestions[0]!.confidence).toBe('medium');
  });

  it('assigns low confidence at minimum threshold', () => {
    const history: ViolationHistory = {
      version: 1,
      snapshots: [
        {
          timestamp: weeksAgo(1),
          violations: [
            makeViolation('v1', 'src/svc/a.ts', 'complexity', 'cyclomatic complexity 20 in fn1'),
            makeViolation('v2', 'src/svc/a.ts', 'complexity', 'cyclomatic complexity 22 in fn2'),
            makeViolation('v3', 'src/svc/a.ts', 'complexity', 'cyclomatic complexity 25 in fn3'),
          ],
        },
      ],
    };

    const result = detectEmergentConstraints(history, { minOccurrences: 3 });
    expect(result.suggestions[0]!.confidence).toBe('low');
  });

  it('filters by category when provided', () => {
    const history: ViolationHistory = {
      version: 1,
      snapshots: [
        {
          timestamp: weeksAgo(1),
          violations: [
            makeViolation('v1', 'src/a.ts', 'complexity', 'cyclomatic complexity 20 in fn'),
            makeViolation('v2', 'src/a.ts', 'complexity', 'cyclomatic complexity 22 in fn2'),
            makeViolation('v3', 'src/a.ts', 'complexity', 'cyclomatic complexity 25 in fn3'),
            makeViolation(
              'v4',
              'src/a.ts',
              'layer-violations',
              'core -> cli: src/a.ts imports src/cli/b.ts'
            ),
            makeViolation(
              'v5',
              'src/a.ts',
              'layer-violations',
              'core -> cli: src/a.ts imports src/cli/c.ts'
            ),
            makeViolation(
              'v6',
              'src/a.ts',
              'layer-violations',
              'core -> cli: src/a.ts imports src/cli/d.ts'
            ),
          ],
        },
      ],
    };

    const result = detectEmergentConstraints(history, {
      minOccurrences: 3,
      category: 'complexity',
    });
    expect(result.suggestions).toHaveLength(1);
    expect(result.suggestions[0]!.suggestedRule.category).toBe('complexity');
  });

  it('respects custom windowWeeks', () => {
    const history: ViolationHistory = {
      version: 1,
      snapshots: [
        {
          timestamp: weeksAgo(3),
          violations: [
            makeViolation('v1', 'src/a.ts', 'complexity', 'cyclomatic complexity 20 in fn'),
            makeViolation('v2', 'src/a.ts', 'complexity', 'cyclomatic complexity 22 in fn2'),
            makeViolation('v3', 'src/a.ts', 'complexity', 'cyclomatic complexity 25 in fn3'),
          ],
        },
      ],
    };

    // Within 4-week window
    const result4 = detectEmergentConstraints(history, { windowWeeks: 4, minOccurrences: 3 });
    expect(result4.suggestions).toHaveLength(1);

    // Outside 2-week window
    const result2 = detectEmergentConstraints(history, { windowWeeks: 2, minOccurrences: 3 });
    expect(result2.suggestions).toHaveLength(0);
  });

  it('limits sample violations to 5', () => {
    const violations = Array.from({ length: 10 }, (_, i) =>
      makeViolation(
        `v${i}`,
        `src/svc/f${i}.ts`,
        'layer-violations',
        `core -> cli: src/svc/f${i}.ts imports src/cli/x${i}.ts`
      )
    );
    const history: ViolationHistory = {
      version: 1,
      snapshots: [{ timestamp: weeksAgo(1), violations }],
    };

    const result = detectEmergentConstraints(history, { minOccurrences: 3 });
    expect(result.suggestions[0]!.sampleViolations).toHaveLength(5);
  });

  it('sorts suggestions by occurrences descending', () => {
    const history: ViolationHistory = {
      version: 1,
      snapshots: [
        {
          timestamp: weeksAgo(1),
          violations: [
            // 3 complexity violations
            makeViolation('v1', 'src/a/x.ts', 'complexity', 'cyclomatic complexity 20'),
            makeViolation('v2', 'src/a/y.ts', 'complexity', 'cyclomatic complexity 22'),
            makeViolation('v3', 'src/a/z.ts', 'complexity', 'cyclomatic complexity 25'),
            // 5 layer violations
            makeViolation(
              'v4',
              'src/b/a.ts',
              'layer-violations',
              'core -> cli: src/b/a.ts imports cli'
            ),
            makeViolation(
              'v5',
              'src/b/b.ts',
              'layer-violations',
              'core -> cli: src/b/b.ts imports cli'
            ),
            makeViolation(
              'v6',
              'src/b/c.ts',
              'layer-violations',
              'core -> cli: src/b/c.ts imports cli'
            ),
            makeViolation(
              'v7',
              'src/b/d.ts',
              'layer-violations',
              'core -> cli: src/b/d.ts imports cli'
            ),
            makeViolation(
              'v8',
              'src/b/e.ts',
              'layer-violations',
              'core -> cli: src/b/e.ts imports cli'
            ),
          ],
        },
      ],
    };

    const result = detectEmergentConstraints(history, { minOccurrences: 3 });
    expect(result.suggestions).toHaveLength(2);
    expect(result.suggestions[0]!.occurrences).toBe(5);
    expect(result.suggestions[1]!.occurrences).toBe(3);
  });
});
