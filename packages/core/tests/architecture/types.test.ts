import { describe, it, expect } from 'vitest';
import {
  ArchMetricCategorySchema,
  ViolationSchema,
  MetricResultSchema,
  CategoryBaselineSchema,
  ArchBaselineSchema,
  CategoryRegressionSchema,
  ArchDiffResultSchema,
  ArchConfigSchema,
} from '../../src/architecture/types';
import type { Collector, ArchConfig, MetricResult } from '../../src/architecture/types';

describe('ArchMetricCategorySchema', () => {
  it('accepts all 7 valid categories', () => {
    const categories = [
      'circular-deps',
      'layer-violations',
      'complexity',
      'coupling',
      'forbidden-imports',
      'module-size',
      'dependency-depth',
    ];
    for (const cat of categories) {
      const result = ArchMetricCategorySchema.safeParse(cat);
      expect(result.success).toBe(true);
    }
  });

  it('rejects invalid category', () => {
    const result = ArchMetricCategorySchema.safeParse('invalid-category');
    expect(result.success).toBe(false);
  });
});

describe('ViolationSchema', () => {
  it('validates a complete violation', () => {
    const result = ViolationSchema.safeParse({
      id: 'abc123',
      file: 'src/services/user.ts',
      detail: 'Function exceeds complexity threshold',
      severity: 'error',
    });
    expect(result.success).toBe(true);
  });

  it('validates a warning severity', () => {
    const result = ViolationSchema.safeParse({
      id: 'def456',
      file: 'src/api/routes.ts',
      detail: 'High fan-out detected',
      severity: 'warning',
    });
    expect(result.success).toBe(true);
  });

  it('rejects violation with missing fields', () => {
    const result = ViolationSchema.safeParse({ id: 'abc' });
    expect(result.success).toBe(false);
  });

  it('rejects violation with invalid severity', () => {
    const result = ViolationSchema.safeParse({
      id: 'abc',
      file: 'src/foo.ts',
      detail: 'desc',
      severity: 'critical',
    });
    expect(result.success).toBe(false);
  });
});

describe('MetricResultSchema', () => {
  it('validates a metric result with violations', () => {
    const result = MetricResultSchema.safeParse({
      category: 'complexity',
      scope: 'src/services',
      value: 12,
      violations: [
        { id: 'v1', file: 'src/services/user.ts', detail: 'High complexity', severity: 'warning' },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('validates a metric result with optional metadata', () => {
    const result = MetricResultSchema.safeParse({
      category: 'module-size',
      scope: 'src/api',
      value: 25,
      violations: [],
      metadata: { fileCount: 25, totalLoc: 1500 },
    });
    expect(result.success).toBe(true);
  });

  it('validates a metric result without metadata', () => {
    const result = MetricResultSchema.safeParse({
      category: 'circular-deps',
      scope: 'project',
      value: 0,
      violations: [],
    });
    expect(result.success).toBe(true);
  });

  it('rejects metric result with invalid category', () => {
    const result = MetricResultSchema.safeParse({
      category: 'not-a-category',
      scope: 'project',
      value: 0,
      violations: [],
    });
    expect(result.success).toBe(false);
  });
});

describe('CategoryBaselineSchema', () => {
  it('validates a category baseline', () => {
    const result = CategoryBaselineSchema.safeParse({
      value: 3,
      violationIds: ['v1', 'v2', 'v3'],
    });
    expect(result.success).toBe(true);
  });

  it('validates a category baseline with empty violations', () => {
    const result = CategoryBaselineSchema.safeParse({
      value: 0,
      violationIds: [],
    });
    expect(result.success).toBe(true);
  });
});

describe('ArchBaselineSchema', () => {
  it('validates a complete baseline', () => {
    const result = ArchBaselineSchema.safeParse({
      version: 1,
      updatedAt: '2026-03-23T10:00:00Z',
      updatedFrom: 'abc123def',
      metrics: {
        'circular-deps': { value: 0, violationIds: [] },
        complexity: { value: 12, violationIds: ['v1', 'v2'] },
      },
    });
    expect(result.success).toBe(true);
  });

  it('rejects baseline with wrong version', () => {
    const result = ArchBaselineSchema.safeParse({
      version: 2,
      updatedAt: '2026-03-23T10:00:00Z',
      updatedFrom: 'abc123def',
      metrics: {},
    });
    expect(result.success).toBe(false);
  });

  it('rejects baseline with invalid category key', () => {
    const result = ArchBaselineSchema.safeParse({
      version: 1,
      updatedAt: '2026-03-23T10:00:00Z',
      updatedFrom: 'abc123def',
      metrics: {
        'not-a-category': { value: 0, violationIds: [] },
      },
    });
    expect(result.success).toBe(false);
  });
});

describe('CategoryRegressionSchema', () => {
  it('validates a regression entry', () => {
    const result = CategoryRegressionSchema.safeParse({
      category: 'coupling',
      baselineValue: 5,
      currentValue: 8,
      delta: 3,
    });
    expect(result.success).toBe(true);
  });
});

describe('ArchDiffResultSchema', () => {
  it('validates a passing diff result', () => {
    const result = ArchDiffResultSchema.safeParse({
      passed: true,
      newViolations: [],
      resolvedViolations: ['old-v1'],
      preExisting: ['v2', 'v3'],
      regressions: [],
    });
    expect(result.success).toBe(true);
  });

  it('validates a failing diff result with new violations', () => {
    const result = ArchDiffResultSchema.safeParse({
      passed: false,
      newViolations: [
        { id: 'new-v1', file: 'src/new.ts', detail: 'New circular dep', severity: 'error' },
      ],
      resolvedViolations: [],
      preExisting: ['v2'],
      regressions: [{ category: 'circular-deps', baselineValue: 1, currentValue: 2, delta: 1 }],
    });
    expect(result.success).toBe(true);
  });
});

describe('ArchConfigSchema', () => {
  it('validates a complete config', () => {
    const result = ArchConfigSchema.safeParse({
      enabled: true,
      baselinePath: '.harness/arch/baselines.json',
      thresholds: {
        'circular-deps': 0,
        'layer-violations': 0,
        complexity: 15,
        coupling: { maxFanIn: 10, maxFanOut: 8 },
        'forbidden-imports': 0,
        'module-size': { maxFiles: 30, maxLoc: 3000 },
        'dependency-depth': 7,
      },
      modules: {
        'src/services': { complexity: 10 },
        'src/api': { coupling: { maxFanOut: 5 } },
      },
    });
    expect(result.success).toBe(true);
  });

  it('applies defaults for minimal config', () => {
    const result = ArchConfigSchema.parse({});
    expect(result.enabled).toBe(true);
    expect(result.baselinePath).toBe('.harness/arch/baselines.json');
    expect(result.thresholds).toEqual({});
    expect(result.modules).toEqual({});
  });

  it('allows overriding defaults', () => {
    const result = ArchConfigSchema.parse({
      enabled: false,
      baselinePath: 'custom/path.json',
    });
    expect(result.enabled).toBe(false);
    expect(result.baselinePath).toBe('custom/path.json');
  });
});

describe('Collector interface', () => {
  it('can be implemented with correct shape', () => {
    const mockCollector: Collector = {
      category: 'complexity',
      collect: async (_config: ArchConfig, _rootDir: string): Promise<MetricResult[]> => {
        return [
          {
            category: 'complexity',
            scope: 'project',
            value: 10,
            violations: [],
          },
        ];
      },
    };
    expect(mockCollector.category).toBe('complexity');
    expect(typeof mockCollector.collect).toBe('function');
  });

  it('collect returns a promise of MetricResult[]', async () => {
    const mockCollector: Collector = {
      category: 'circular-deps',
      collect: async () => [],
    };
    const results = await mockCollector.collect(
      { enabled: true, baselinePath: '.harness/arch/baselines.json', thresholds: {}, modules: {} },
      '/tmp/project'
    );
    expect(Array.isArray(results)).toBe(true);
    expect(results).toHaveLength(0);
  });
});
