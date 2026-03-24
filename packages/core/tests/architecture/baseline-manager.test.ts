import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ArchBaselineManager } from '../../src/architecture/baseline-manager';
import { ArchBaselineSchema } from '../../src/architecture/types';
import type { MetricResult } from '../../src/architecture/types';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('ArchBaselineManager', () => {
  let tmpDir: string;
  let manager: ArchBaselineManager;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'arch-baseline-'));
    manager = new ArchBaselineManager(tmpDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('capture()', () => {
    it('creates a baseline from metric results', () => {
      const results: MetricResult[] = [
        {
          category: 'circular-deps',
          scope: 'project',
          value: 2,
          violations: [
            { id: 'cd-1', file: 'src/a.ts', detail: 'Cycle: a -> b -> a', severity: 'error' },
            { id: 'cd-2', file: 'src/c.ts', detail: 'Cycle: c -> d -> c', severity: 'error' },
          ],
        },
        {
          category: 'complexity',
          scope: 'src/services',
          value: 15,
          violations: [
            {
              id: 'cx-1',
              file: 'src/services/user.ts',
              detail: 'High complexity: 18',
              severity: 'warning',
            },
          ],
        },
      ];

      const baseline = manager.capture(results, 'abc123');

      expect(baseline.version).toBe(1);
      expect(baseline.updatedFrom).toBe('abc123');
      // updatedAt should be valid ISO 8601
      expect(() => new Date(baseline.updatedAt).toISOString()).not.toThrow();
      // metrics keyed by category
      expect(baseline.metrics['circular-deps']).toEqual({
        value: 2,
        violationIds: ['cd-1', 'cd-2'],
      });
      expect(baseline.metrics['complexity']).toEqual({
        value: 15,
        violationIds: ['cx-1'],
      });
    });

    it('aggregates multiple results for the same category', () => {
      const results: MetricResult[] = [
        {
          category: 'complexity',
          scope: 'src/services',
          value: 10,
          violations: [{ id: 'cx-1', file: 'src/a.ts', detail: 'd1', severity: 'warning' }],
        },
        {
          category: 'complexity',
          scope: 'src/api',
          value: 5,
          violations: [{ id: 'cx-2', file: 'src/b.ts', detail: 'd2', severity: 'warning' }],
        },
      ];

      const baseline = manager.capture(results, 'def456');

      expect(baseline.metrics['complexity']!.value).toBe(15);
      expect(baseline.metrics['complexity']!.violationIds).toEqual(['cx-1', 'cx-2']);
    });

    it('produces a baseline that passes ArchBaselineSchema validation', () => {
      const results: MetricResult[] = [
        { category: 'coupling', scope: 'project', value: 3, violations: [] },
      ];
      const baseline = manager.capture(results, 'hash1');
      const parsed = ArchBaselineSchema.safeParse(baseline);
      expect(parsed.success).toBe(true);
    });

    it('returns empty metrics record for empty results', () => {
      const baseline = manager.capture([], 'hash2');
      expect(baseline.metrics).toEqual({});
      expect(baseline.version).toBe(1);
    });
  });
});
