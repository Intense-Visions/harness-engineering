import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockAnalyze = vi.fn();

vi.mock('@harness-engineering/core', async () => {
  const actual = await vi.importActual<typeof import('@harness-engineering/core')>(
    '@harness-engineering/core'
  );
  return {
    ...actual,
    EntropyAnalyzer: class MockEntropyAnalyzer {
      analyze = mockAnalyze;
    },
  };
});

import { gatherPerf } from '../../../src/server/gather/perf';

describe('gatherPerf', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns perf data with no violations when analysis is clean', async () => {
    mockAnalyze.mockResolvedValue({
      ok: true,
      value: {
        complexity: { violations: [], stats: { filesAnalyzed: 5 } },
        coupling: { violations: [] },
        sizeBudget: { violations: [] },
      },
    });

    const result = await gatherPerf('/project');

    expect('error' in result).toBe(false);
    if ('error' in result) return;
    expect(result.valid).toBe(true);
    expect(result.violations).toEqual([]);
    expect(result.stats.filesAnalyzed).toBe(5);
    expect(result.stats.violationCount).toBe(0);
  });

  it('returns violations mapped to PerfViolationSummary shape', async () => {
    mockAnalyze.mockResolvedValue({
      ok: true,
      value: {
        complexity: {
          violations: [
            {
              tier: 1,
              severity: 'error',
              metric: 'cyclomaticComplexity',
              file: 'src/a.ts',
              value: 25,
              threshold: 15,
              function: 'doStuff',
              message: '',
            },
          ],
          stats: { filesAnalyzed: 3 },
        },
        coupling: {
          violations: [
            {
              tier: 2,
              severity: 'warning',
              metric: 'fanOut',
              file: 'src/b.ts',
              value: 12,
              threshold: 10,
              message: '',
            },
          ],
        },
        sizeBudget: { violations: [] },
      },
    });

    const result = await gatherPerf('/project');

    if ('error' in result) return;
    expect(result.valid).toBe(false);
    expect(result.violations).toHaveLength(2);
    expect(result.violations[0]).toEqual({
      metric: 'cyclomaticComplexity',
      file: 'src/a.ts',
      value: 25,
      threshold: 15,
      severity: 'error',
    });
    expect(result.violations[1]).toEqual({
      metric: 'fanOut',
      file: 'src/b.ts',
      value: 12,
      threshold: 10,
      severity: 'warning',
    });
    expect(result.stats.violationCount).toBe(2);
  });

  it('returns error when analysis fails', async () => {
    mockAnalyze.mockResolvedValue({
      ok: false,
      error: { message: 'Analysis config invalid' },
    });

    const result = await gatherPerf('/project');

    expect('error' in result).toBe(true);
    if (!('error' in result)) return;
    expect(result.error).toContain('Analysis config invalid');
  });

  it('returns error when analyzer throws', async () => {
    mockAnalyze.mockRejectedValue(new Error('Unexpected crash'));

    const result = await gatherPerf('/project');

    expect('error' in result).toBe(true);
    if (!('error' in result)) return;
    expect(result.error).toContain('Unexpected crash');
  });
});
