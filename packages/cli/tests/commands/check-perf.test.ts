import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock @harness-engineering/core before importing anything that uses it
const mockAnalyze = vi.fn();
const mockEntropyConstructorArgs: unknown[] = [];

vi.mock('@harness-engineering/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@harness-engineering/core')>();

  class MockEntropyAnalyzer {
    analyze = mockAnalyze;
    constructor(opts: unknown) {
      mockEntropyConstructorArgs.push(opts);
    }
  }

  return {
    ...actual,
    EntropyAnalyzer: MockEntropyAnalyzer,
  };
});

import { runCheckPerf, createCheckPerfCommand } from '../../src/commands/check-perf';

describe('check-perf command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEntropyConstructorArgs.length = 0;
  });

  describe('createCheckPerfCommand', () => {
    it('creates command with correct name', () => {
      const cmd = createCheckPerfCommand();
      expect(cmd.name()).toBe('check-perf');
    });

    it('has description', () => {
      const cmd = createCheckPerfCommand();
      expect(cmd.description()).toContain('performance');
    });

    it('has --structural option', () => {
      const cmd = createCheckPerfCommand();
      const opt = cmd.options.find((o) => o.long === '--structural');
      expect(opt).toBeDefined();
    });

    it('has --coupling option', () => {
      const cmd = createCheckPerfCommand();
      const opt = cmd.options.find((o) => o.long === '--coupling');
      expect(opt).toBeDefined();
    });

    it('has --size option', () => {
      const cmd = createCheckPerfCommand();
      const opt = cmd.options.find((o) => o.long === '--size');
      expect(opt).toBeDefined();
    });
  });

  describe('runCheckPerf', () => {
    it('returns valid result with no violations when analysis is clean', async () => {
      mockAnalyze.mockResolvedValue({
        ok: true,
        value: {
          complexity: {
            violations: [],
            stats: { filesAnalyzed: 10, violationCount: 0, errorCount: 0, warningCount: 0 },
          },
          coupling: {
            violations: [],
            stats: { violationCount: 0, warningCount: 0 },
          },
          sizeBudget: {
            violations: [],
          },
        },
      });

      const result = await runCheckPerf('/tmp/test', {});
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.valid).toBe(true);
        expect(result.value.violations).toHaveLength(0);
        expect(result.value.stats.filesAnalyzed).toBe(10);
        expect(result.value.stats.violationCount).toBe(0);
        expect(result.value.stats.errorCount).toBe(0);
        expect(result.value.stats.warningCount).toBe(0);
        expect(result.value.stats.infoCount).toBe(0);
      }
    });

    it('runs all checks when no specific option is provided', async () => {
      mockAnalyze.mockResolvedValue({
        ok: true,
        value: {
          complexity: {
            violations: [],
            stats: { filesAnalyzed: 5, violationCount: 0, errorCount: 0, warningCount: 0 },
          },
          coupling: { violations: [], stats: { violationCount: 0, warningCount: 0 } },
          sizeBudget: { violations: [] },
        },
      });

      await runCheckPerf('/tmp/test', {});

      expect(mockEntropyConstructorArgs).toHaveLength(1);
      expect(mockEntropyConstructorArgs[0]).toEqual(
        expect.objectContaining({
          analyze: { complexity: true, coupling: true, sizeBudget: true },
        })
      );
    });

    it('runs only structural checks when structural option is set', async () => {
      mockAnalyze.mockResolvedValue({
        ok: true,
        value: {
          complexity: {
            violations: [],
            stats: { filesAnalyzed: 5, violationCount: 0, errorCount: 0, warningCount: 0 },
          },
        },
      });

      await runCheckPerf('/tmp/test', { structural: true });

      expect(mockEntropyConstructorArgs).toHaveLength(1);
      expect(mockEntropyConstructorArgs[0]).toEqual(
        expect.objectContaining({
          analyze: { complexity: true, coupling: false, sizeBudget: false },
        })
      );
    });

    it('runs only coupling checks when coupling option is set', async () => {
      mockAnalyze.mockResolvedValue({
        ok: true,
        value: {
          coupling: { violations: [], stats: { violationCount: 0, warningCount: 0 } },
        },
      });

      await runCheckPerf('/tmp/test', { coupling: true });

      expect(mockEntropyConstructorArgs).toHaveLength(1);
      expect(mockEntropyConstructorArgs[0]).toEqual(
        expect.objectContaining({
          analyze: { complexity: false, coupling: true, sizeBudget: false },
        })
      );
    });

    it('runs only size checks when size option is set', async () => {
      mockAnalyze.mockResolvedValue({
        ok: true,
        value: {
          sizeBudget: { violations: [] },
        },
      });

      await runCheckPerf('/tmp/test', { size: true });

      expect(mockEntropyConstructorArgs).toHaveLength(1);
      expect(mockEntropyConstructorArgs[0]).toEqual(
        expect.objectContaining({
          analyze: { complexity: false, coupling: false, sizeBudget: true },
        })
      );
    });

    it('returns analysis error as a violation when analysis fails', async () => {
      mockAnalyze.mockResolvedValue({
        ok: false,
        error: new Error('Failed to read config'),
      });

      const result = await runCheckPerf('/tmp/test', {});
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.valid).toBe(false);
        expect(result.value.violations).toHaveLength(1);
        expect(result.value.violations[0].severity).toBe('error');
        expect(result.value.violations[0].metric).toBe('analysis-error');
        expect(result.value.violations[0].message).toContain('Failed to read config');
        expect(result.value.stats.errorCount).toBe(1);
        expect(result.value.stats.filesAnalyzed).toBe(0);
      }
    });

    it('collects complexity violations', async () => {
      mockAnalyze.mockResolvedValue({
        ok: true,
        value: {
          complexity: {
            violations: [
              {
                tier: 1,
                severity: 'error',
                metric: 'cyclomatic-complexity',
                file: 'src/big.ts',
                function: 'processAll',
                value: 25,
                threshold: 15,
                message: '',
              },
            ],
            stats: { filesAnalyzed: 8, violationCount: 1, errorCount: 1, warningCount: 0 },
          },
          coupling: { violations: [], stats: { violationCount: 0, warningCount: 0 } },
          sizeBudget: { violations: [] },
        },
      });

      const result = await runCheckPerf('/tmp/test', {});
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.valid).toBe(false);
        expect(result.value.violations).toHaveLength(1);
        expect(result.value.violations[0].metric).toBe('cyclomatic-complexity');
        expect(result.value.violations[0].file).toBe('src/big.ts');
        expect(result.value.violations[0].value).toBe(25);
        expect(result.value.violations[0].threshold).toBe(15);
        expect(result.value.stats.errorCount).toBe(1);
      }
    });

    it('collects coupling violations', async () => {
      mockAnalyze.mockResolvedValue({
        ok: true,
        value: {
          complexity: {
            violations: [],
            stats: { filesAnalyzed: 5, violationCount: 0, errorCount: 0, warningCount: 0 },
          },
          coupling: {
            violations: [
              {
                tier: 2,
                severity: 'warning',
                metric: 'afferent-coupling',
                file: 'src/hub.ts',
                value: 30,
                threshold: 20,
                message: 'High afferent coupling',
              },
            ],
            stats: { violationCount: 1, warningCount: 1 },
          },
          sizeBudget: { violations: [] },
        },
      });

      const result = await runCheckPerf('/tmp/test', {});
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.valid).toBe(true); // only warnings, no errors
        expect(result.value.violations).toHaveLength(1);
        expect(result.value.violations[0].metric).toBe('afferent-coupling');
        expect(result.value.violations[0].severity).toBe('warning');
        expect(result.value.stats.warningCount).toBe(1);
        expect(result.value.stats.errorCount).toBe(0);
      }
    });

    it('collects size budget violations', async () => {
      mockAnalyze.mockResolvedValue({
        ok: true,
        value: {
          complexity: {
            violations: [],
            stats: { filesAnalyzed: 3, violationCount: 0, errorCount: 0, warningCount: 0 },
          },
          coupling: { violations: [], stats: { violationCount: 0, warningCount: 0 } },
          sizeBudget: {
            violations: [
              {
                tier: 1,
                severity: 'error',
                package: '@harness-engineering/core',
                currentSize: 500000,
                budgetSize: 400000,
              },
            ],
          },
        },
      });

      const result = await runCheckPerf('/tmp/test', {});
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.valid).toBe(false);
        expect(result.value.violations).toHaveLength(1);
        expect(result.value.violations[0].metric).toBe('sizeBudget');
        expect(result.value.violations[0].file).toBe('@harness-engineering/core');
        expect(result.value.violations[0].value).toBe(500000);
        expect(result.value.violations[0].threshold).toBe(400000);
        expect(result.value.violations[0].message).toContain('Size');
      }
    });

    it('handles missing report sections gracefully', async () => {
      mockAnalyze.mockResolvedValue({
        ok: true,
        value: {
          // No complexity, coupling, or sizeBudget
        },
      });

      const result = await runCheckPerf('/tmp/test', {});
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.valid).toBe(true);
        expect(result.value.violations).toHaveLength(0);
        expect(result.value.stats.filesAnalyzed).toBe(0);
      }
    });

    it('counts info-level violations correctly', async () => {
      mockAnalyze.mockResolvedValue({
        ok: true,
        value: {
          complexity: {
            violations: [
              {
                tier: 3,
                severity: 'info',
                metric: 'lines-of-code',
                file: 'src/util.ts',
                function: 'helper',
                value: 100,
                threshold: 80,
                message: 'Informational: function is long',
              },
            ],
            stats: { filesAnalyzed: 2, violationCount: 1, errorCount: 0, warningCount: 0 },
          },
          coupling: { violations: [], stats: { violationCount: 0, warningCount: 0 } },
          sizeBudget: { violations: [] },
        },
      });

      const result = await runCheckPerf('/tmp/test', {});
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.valid).toBe(true); // info does not invalidate
        expect(result.value.stats.infoCount).toBe(1);
        expect(result.value.stats.errorCount).toBe(0);
        expect(result.value.stats.warningCount).toBe(0);
      }
    });

    it('uses fallback message when violation message is empty', async () => {
      mockAnalyze.mockResolvedValue({
        ok: true,
        value: {
          complexity: {
            violations: [
              {
                tier: 1,
                severity: 'error',
                metric: 'cyclomatic-complexity',
                file: 'src/complex.ts',
                function: 'doStuff',
                value: 30,
                threshold: 15,
                message: '',
              },
            ],
            stats: { filesAnalyzed: 1, violationCount: 1, errorCount: 1, warningCount: 0 },
          },
          coupling: { violations: [], stats: { violationCount: 0, warningCount: 0 } },
          sizeBudget: { violations: [] },
        },
      });

      const result = await runCheckPerf('/tmp/test', {});
      expect(result.ok).toBe(true);
      if (result.ok) {
        const msg = result.value.violations[0].message;
        expect(msg).toContain('Tier 1');
        expect(msg).toContain('cyclomatic-complexity');
        expect(msg).toContain('doStuff');
        expect(msg).toContain('30');
        expect(msg).toContain('15');
      }
    });

    it('uses fallback message for coupling violation with empty message', async () => {
      mockAnalyze.mockResolvedValue({
        ok: true,
        value: {
          complexity: {
            violations: [],
            stats: { filesAnalyzed: 1, violationCount: 0, errorCount: 0, warningCount: 0 },
          },
          coupling: {
            violations: [
              {
                tier: 2,
                severity: 'warning',
                metric: 'efferent-coupling',
                file: 'src/hub.ts',
                value: 25,
                threshold: 20,
                message: '',
              },
            ],
            stats: { violationCount: 1, warningCount: 1 },
          },
          sizeBudget: { violations: [] },
        },
      });

      const result = await runCheckPerf('/tmp/test', {});
      expect(result.ok).toBe(true);
      if (result.ok) {
        const msg = result.value.violations[0].message;
        expect(msg).toContain('Tier 2');
        expect(msg).toContain('efferent-coupling');
        expect(msg).toContain('src/hub.ts');
      }
    });

    it('aggregates violations from all sections', async () => {
      mockAnalyze.mockResolvedValue({
        ok: true,
        value: {
          complexity: {
            violations: [
              {
                tier: 1,
                severity: 'error',
                metric: 'cc',
                file: 'a.ts',
                function: 'f',
                value: 20,
                threshold: 10,
                message: 'too complex',
              },
            ],
            stats: { filesAnalyzed: 3, violationCount: 1, errorCount: 1, warningCount: 0 },
          },
          coupling: {
            violations: [
              {
                tier: 2,
                severity: 'warning',
                metric: 'coupling',
                file: 'b.ts',
                value: 15,
                threshold: 10,
                message: 'high coupling',
              },
            ],
            stats: { violationCount: 1, warningCount: 1 },
          },
          sizeBudget: {
            violations: [
              { tier: 1, severity: 'error', package: 'pkg', currentSize: 200, budgetSize: 100 },
            ],
          },
        },
      });

      const result = await runCheckPerf('/tmp/test', {});
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.violations).toHaveLength(3);
        expect(result.value.stats.violationCount).toBe(3);
        expect(result.value.stats.errorCount).toBe(2);
        expect(result.value.stats.warningCount).toBe(1);
        expect(result.value.valid).toBe(false);
      }
    });
  });
});
