import { describe, it, expect, vi } from 'vitest';
import { ComplexityCollector } from '../../../src/architecture/collectors/complexity';
import type { ArchConfig } from '../../../src/architecture/types';

const baseConfig: ArchConfig = {
  enabled: true,
  baselinePath: '.harness/arch/baselines.json',
  thresholds: {},
  modules: {},
};

vi.mock('../../../src/entropy/detectors/complexity', () => ({
  detectComplexityViolations: vi.fn(),
}));

import { detectComplexityViolations } from '../../../src/entropy/detectors/complexity';
const mockDetect = vi.mocked(detectComplexityViolations);

describe('ComplexityCollector', () => {
  const collector = new ComplexityCollector();

  it('has category "complexity"', () => {
    expect(collector.category).toBe('complexity');
  });

  it('returns empty results when no violations', async () => {
    mockDetect.mockResolvedValue({
      ok: true,
      value: {
        violations: [],
        stats: {
          filesAnalyzed: 5,
          functionsAnalyzed: 10,
          violationCount: 0,
          errorCount: 0,
          warningCount: 0,
          infoCount: 0,
        },
      },
    } as any);

    const results = await collector.collect(baseConfig, '/project');
    expect(results).toHaveLength(1);
    expect(results[0]!.value).toBe(0);
    expect(results[0]!.violations).toHaveLength(0);
  });

  it('converts ComplexityViolation to Violation with stable IDs', async () => {
    mockDetect.mockResolvedValue({
      ok: true,
      value: {
        violations: [
          {
            file: '/project/src/service.ts',
            function: 'processData',
            line: 10,
            metric: 'cyclomaticComplexity',
            value: 18,
            threshold: 15,
            tier: 1,
            severity: 'error',
            message: 'Function "processData" has cyclomatic complexity of 18',
          },
        ],
        stats: {
          filesAnalyzed: 1,
          functionsAnalyzed: 1,
          violationCount: 1,
          errorCount: 1,
          warningCount: 0,
          infoCount: 0,
        },
      },
    } as any);

    const results = await collector.collect(baseConfig, '/project');
    expect(results).toHaveLength(1);
    expect(results[0]!.value).toBe(1);
    expect(results[0]!.violations).toHaveLength(1);
    expect(results[0]!.violations[0]!.id).toMatch(/^[a-f0-9]{64}$/);
    expect(results[0]!.violations[0]!.file).toBe('src/service.ts');
    expect(results[0]!.violations[0]!.detail).toContain('processData');
    expect(results[0]!.violations[0]!.detail).toContain('cyclomaticComplexity');
  });

  it('maps warning severity from ComplexityViolation', async () => {
    mockDetect.mockResolvedValue({
      ok: true,
      value: {
        violations: [
          {
            file: '/project/src/util.ts',
            function: 'helper',
            line: 5,
            metric: 'nestingDepth',
            value: 5,
            threshold: 4,
            tier: 2,
            severity: 'warning',
            message: 'Nesting too deep',
          },
        ],
        stats: {
          filesAnalyzed: 1,
          functionsAnalyzed: 1,
          violationCount: 1,
          errorCount: 0,
          warningCount: 1,
          infoCount: 0,
        },
      },
    } as any);

    const results = await collector.collect(baseConfig, '/project');
    expect(results[0]!.violations[0]!.severity).toBe('warning');
  });

  it('excludes info-severity violations (only error/warning)', async () => {
    mockDetect.mockResolvedValue({
      ok: true,
      value: {
        violations: [
          {
            file: '/project/src/big.ts',
            function: '<file>',
            line: 1,
            metric: 'fileLength',
            value: 400,
            threshold: 300,
            tier: 3,
            severity: 'info',
            message: 'File too long',
          },
        ],
        stats: {
          filesAnalyzed: 1,
          functionsAnalyzed: 0,
          violationCount: 1,
          errorCount: 0,
          warningCount: 0,
          infoCount: 1,
        },
      },
    } as any);

    const results = await collector.collect(baseConfig, '/project');
    // info violations are excluded because Violation type only supports error|warning
    expect(results[0]!.violations).toHaveLength(0);
    expect(results[0]!.value).toBe(0);
  });

  it('includes metadata with stats', async () => {
    mockDetect.mockResolvedValue({
      ok: true,
      value: {
        violations: [],
        stats: {
          filesAnalyzed: 10,
          functionsAnalyzed: 50,
          violationCount: 0,
          errorCount: 0,
          warningCount: 0,
          infoCount: 0,
        },
      },
    } as any);

    const results = await collector.collect(baseConfig, '/project');
    expect(results[0]!.metadata).toEqual({
      filesAnalyzed: 10,
      functionsAnalyzed: 50,
    });
  });
});
