import { describe, it, expect } from 'vitest';
import { architecture, archModule, archMatchers } from '../../src/architecture/matchers';
import type { MetricResult } from '../../src/architecture/types';

describe('architecture() factory', () => {
  it('returns a handle with scope "project"', () => {
    const handle = architecture();
    expect(handle.kind).toBe('arch-handle');
    expect(handle.scope).toBe('project');
    expect(handle.rootDir).toBe(process.cwd());
  });

  it('accepts a custom rootDir', () => {
    const handle = architecture({ rootDir: '/custom/path' });
    expect(handle.rootDir).toBe('/custom/path');
  });

  it('accepts a config override', () => {
    const handle = architecture({ config: { enabled: false } });
    expect(handle.config).toEqual({ enabled: false });
  });
});

describe('archModule() factory', () => {
  it('returns a handle with the given module scope', () => {
    const handle = archModule('src/services');
    expect(handle.kind).toBe('arch-handle');
    expect(handle.scope).toBe('src/services');
    expect(handle.rootDir).toBe(process.cwd());
  });

  it('accepts a custom rootDir', () => {
    const handle = archModule('src/api', { rootDir: '/other' });
    expect(handle.rootDir).toBe('/other');
  });
});

describe('archMatchers', () => {
  describe('toHaveNoCircularDeps', () => {
    it('passes when no circular deps found', async () => {
      const handle = architecture({ rootDir: '/fake' });
      const mockResults: MetricResult[] = [
        { category: 'circular-deps', scope: 'project', value: 0, violations: [] },
      ];

      const matcher = archMatchers.toHaveNoCircularDeps;
      const result = await matcher.call(
        { isNot: false, equals: Object.is, utils: {} as any } as any,
        { ...handle, _mockResults: mockResults } as any
      );
      expect(result.pass).toBe(true);
    });

    it('fails with readable message when circular deps found', async () => {
      const handle = architecture({ rootDir: '/fake' });
      const mockResults: MetricResult[] = [
        {
          category: 'circular-deps',
          scope: 'project',
          value: 2,
          violations: [
            {
              id: 'cd-1',
              file: 'src/a.ts',
              detail: 'Circular: src/a.ts -> src/b.ts -> src/a.ts',
              severity: 'error',
            },
            {
              id: 'cd-2',
              file: 'src/c.ts',
              detail: 'Circular: src/c.ts -> src/d.ts -> src/c.ts',
              severity: 'error',
            },
          ],
        },
      ];

      const matcher = archMatchers.toHaveNoCircularDeps;
      const result = await matcher.call(
        { isNot: false, equals: Object.is, utils: {} as any } as any,
        { ...handle, _mockResults: mockResults } as any
      );
      expect(result.pass).toBe(false);
      expect(result.message()).toContain('2 circular');
      expect(result.message()).toContain('src/a.ts');
    });
  });

  describe('toHaveNoLayerViolations', () => {
    it('passes when no layer violations found', async () => {
      const handle = architecture({ rootDir: '/fake' });
      const mockResults: MetricResult[] = [
        { category: 'layer-violations', scope: 'project', value: 0, violations: [] },
      ];
      const matcher = archMatchers.toHaveNoLayerViolations;
      const result = await matcher.call(
        { isNot: false, equals: Object.is, utils: {} as any } as any,
        { ...handle, _mockResults: mockResults } as any
      );
      expect(result.pass).toBe(true);
    });

    it('fails with readable message when layer violations found', async () => {
      const handle = architecture({ rootDir: '/fake' });
      const mockResults: MetricResult[] = [
        {
          category: 'layer-violations',
          scope: 'project',
          value: 1,
          violations: [
            {
              id: 'lv-1',
              file: 'src/ui/button.ts',
              detail: 'ui -> data: src/ui/button.ts imports src/data/db.ts',
              severity: 'error',
            },
          ],
        },
      ];
      const matcher = archMatchers.toHaveNoLayerViolations;
      const result = await matcher.call(
        { isNot: false, equals: Object.is, utils: {} as any } as any,
        { ...handle, _mockResults: mockResults } as any
      );
      expect(result.pass).toBe(false);
      expect(result.message()).toContain('1 layer violation');
      expect(result.message()).toContain('src/ui/button.ts');
    });
  });

  describe('toMatchBaseline', () => {
    it('passes when diff shows no regressions', async () => {
      const handle = architecture({ rootDir: '/fake' });
      const mockDiff = {
        passed: true,
        newViolations: [],
        resolvedViolations: [],
        preExisting: [],
        regressions: [],
      };
      const matcher = archMatchers.toMatchBaseline;
      const result = await matcher.call(
        { isNot: false, equals: Object.is, utils: {} as any } as any,
        { ...handle, _mockDiff: mockDiff } as any
      );
      expect(result.pass).toBe(true);
    });

    it('fails with readable message when regressions found', async () => {
      const handle = architecture({ rootDir: '/fake' });
      const mockDiff = {
        passed: false,
        newViolations: [
          { id: 'nv-1', file: 'src/new.ts', detail: 'New violation', severity: 'error' as const },
        ],
        resolvedViolations: [],
        preExisting: [],
        regressions: [
          {
            category: 'complexity' as const,
            baselineValue: 10,
            currentValue: 15,
            delta: 5,
          },
        ],
      };
      const matcher = archMatchers.toMatchBaseline;
      const result = await matcher.call(
        { isNot: false, equals: Object.is, utils: {} as any } as any,
        { ...handle, _mockDiff: mockDiff } as any
      );
      expect(result.pass).toBe(false);
      expect(result.message()).toContain('1 new violation');
      expect(result.message()).toContain('src/new.ts');
      expect(result.message()).toContain('complexity');
    });

    it('respects tolerance option', async () => {
      const handle = architecture({ rootDir: '/fake' });
      const mockDiff = {
        passed: false,
        newViolations: [
          { id: 'nv-1', file: 'src/new.ts', detail: 'New violation', severity: 'error' as const },
        ],
        resolvedViolations: [],
        preExisting: [],
        regressions: [],
      };
      const matcher = archMatchers.toMatchBaseline;
      // With tolerance: 2, 1 new violation should pass
      const result = await matcher.call(
        { isNot: false, equals: Object.is, utils: {} as any } as any,
        { ...handle, _mockDiff: mockDiff } as any,
        { tolerance: 2 }
      );
      expect(result.pass).toBe(true);
    });
  });
});
