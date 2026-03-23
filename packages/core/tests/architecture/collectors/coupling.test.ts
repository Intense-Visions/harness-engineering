import { describe, it, expect, vi } from 'vitest';
import { CouplingCollector } from '../../../src/architecture/collectors/coupling';
import type { ArchConfig } from '../../../src/architecture/types';

const baseConfig: ArchConfig = {
  enabled: true,
  baselinePath: '.harness/arch/baselines.json',
  thresholds: {},
  modules: {},
};

vi.mock('../../../src/entropy/detectors/coupling', () => ({
  detectCouplingViolations: vi.fn(),
}));

import { detectCouplingViolations } from '../../../src/entropy/detectors/coupling';
const mockDetect = vi.mocked(detectCouplingViolations);

describe('CouplingCollector', () => {
  const collector = new CouplingCollector();

  it('has category "coupling"', () => {
    expect(collector.category).toBe('coupling');
  });

  it('returns empty results when no violations', async () => {
    mockDetect.mockResolvedValue({
      ok: true,
      value: {
        violations: [],
        stats: { filesAnalyzed: 5, violationCount: 0, warningCount: 0, infoCount: 0 },
      },
    } as any);

    const results = await collector.collect(baseConfig, '/project');
    expect(results).toHaveLength(1);
    expect(results[0]!.value).toBe(0);
    expect(results[0]!.violations).toHaveLength(0);
  });

  it('converts CouplingViolation to Violation with stable IDs', async () => {
    mockDetect.mockResolvedValue({
      ok: true,
      value: {
        violations: [
          {
            file: '/project/src/hub.ts',
            metric: 'fanOut',
            value: 20,
            threshold: 15,
            tier: 2,
            severity: 'warning',
            message: 'File has 20 imports',
          },
        ],
        stats: { filesAnalyzed: 1, violationCount: 1, warningCount: 1, infoCount: 0 },
      },
    } as any);

    const results = await collector.collect(baseConfig, '/project');
    expect(results[0]!.value).toBe(1);
    expect(results[0]!.violations).toHaveLength(1);
    expect(results[0]!.violations[0]!.file).toBe('src/hub.ts');
    expect(results[0]!.violations[0]!.id).toMatch(/^[a-f0-9]{64}$/);
    expect(results[0]!.violations[0]!.severity).toBe('warning');
  });

  it('excludes info-severity violations', async () => {
    mockDetect.mockResolvedValue({
      ok: true,
      value: {
        violations: [
          {
            file: '/project/src/popular.ts',
            metric: 'fanIn',
            value: 25,
            threshold: 20,
            tier: 3,
            severity: 'info',
            message: 'High fan-in',
          },
        ],
        stats: { filesAnalyzed: 1, violationCount: 1, warningCount: 0, infoCount: 1 },
      },
    } as any);

    const results = await collector.collect(baseConfig, '/project');
    expect(results[0]!.violations).toHaveLength(0);
  });

  it('includes metadata with stats', async () => {
    mockDetect.mockResolvedValue({
      ok: true,
      value: {
        violations: [],
        stats: { filesAnalyzed: 15, violationCount: 0, warningCount: 0, infoCount: 0 },
      },
    } as any);

    const results = await collector.collect(baseConfig, '/project');
    expect(results[0]!.metadata).toEqual({ filesAnalyzed: 15 });
  });
});
