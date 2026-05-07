import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ArchBaselineManager } from '../../src/architecture/baseline-manager';
import { ArchBaselineSchema } from '../../src/architecture/types';
import type { MetricResult } from '../../src/architecture/types';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs';
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

  describe('load()', () => {
    it('returns null when baselines file does not exist', () => {
      expect(manager.load()).toBeNull();
    });

    it('loads a valid baselines file', () => {
      const baseline = {
        version: 1,
        updatedAt: '2026-03-23T10:00:00.000Z',
        updatedFrom: 'abc123',
        metrics: {
          'circular-deps': { value: 2, violationIds: ['cd-1', 'cd-2'] },
        },
      };
      mkdirSync(join(tmpDir, '.harness', 'arch'), { recursive: true });
      writeFileSync(join(tmpDir, '.harness', 'arch', 'baselines.json'), JSON.stringify(baseline));

      const loaded = manager.load();
      expect(loaded).toEqual(baseline);
    });

    it('returns null for invalid JSON', () => {
      mkdirSync(join(tmpDir, '.harness', 'arch'), { recursive: true });
      writeFileSync(join(tmpDir, '.harness', 'arch', 'baselines.json'), 'not-valid-json{{{');
      expect(manager.load()).toBeNull();
    });

    it('returns null for JSON that fails schema validation', () => {
      mkdirSync(join(tmpDir, '.harness', 'arch'), { recursive: true });
      writeFileSync(
        join(tmpDir, '.harness', 'arch', 'baselines.json'),
        JSON.stringify({ version: 99, bad: true })
      );
      expect(manager.load()).toBeNull();
    });
  });

  describe('save()', () => {
    it('writes baseline to disk creating directories', () => {
      const baseline = manager.capture(
        [{ category: 'coupling', scope: 'project', value: 3, violations: [] }],
        'save-hash'
      );

      manager.save(baseline);

      const raw = readFileSync(join(tmpDir, '.harness', 'arch', 'baselines.json'), 'utf-8');
      const written = JSON.parse(raw);
      expect(written.version).toBe(1);
      expect(written.updatedFrom).toBe('save-hash');
      expect(written.metrics['coupling']).toEqual({ value: 3, violationIds: [] });
    });

    it('overwrites existing baseline file', () => {
      const first = manager.capture(
        [{ category: 'coupling', scope: 'project', value: 3, violations: [] }],
        'first'
      );
      manager.save(first);

      const second = manager.capture(
        [{ category: 'coupling', scope: 'project', value: 5, violations: [] }],
        'second'
      );
      manager.save(second);

      const loaded = manager.load();
      expect(loaded!.updatedFrom).toBe('second');
      expect(loaded!.metrics['coupling']!.value).toBe(5);
    });
  });

  describe('custom baselinePath', () => {
    it('uses custom path when provided', () => {
      const customManager = new ArchBaselineManager(tmpDir, 'custom/baselines.json');
      const baseline = customManager.capture(
        [{ category: 'complexity', scope: 'project', value: 1, violations: [] }],
        'custom-hash'
      );
      customManager.save(baseline);

      const loaded = customManager.load();
      expect(loaded).not.toBeNull();
      expect(loaded!.updatedFrom).toBe('custom-hash');
    });
  });

  describe('update()', () => {
    // Regression coverage for issue #268: --update-baseline must not drop
    // categories that already exist in the baseline but happen to be absent
    // from the new results (e.g. a collector silently returned []).
    it('preserves existing categories when new results omit them', () => {
      const initial: MetricResult[] = [
        { category: 'circular-deps', scope: 'project', value: 0, violations: [] },
        { category: 'layer-violations', scope: 'project', value: 0, violations: [] },
        {
          category: 'complexity',
          scope: 'project',
          value: 2,
          violations: [
            { id: 'cx-1', file: 'a.ts', detail: 'd1', severity: 'warning' },
            { id: 'cx-2', file: 'b.ts', detail: 'd2', severity: 'warning' },
          ],
        },
      ];
      manager.update(initial, 'commit-1');

      // Re-run with only one category present (simulating a partial collector run).
      manager.update(
        [{ category: 'module-size', scope: 'project', value: 7, violations: [] }],
        'commit-2'
      );

      const loaded = manager.load();
      expect(loaded).not.toBeNull();
      expect(Object.keys(loaded!.metrics).sort()).toEqual([
        'circular-deps',
        'complexity',
        'layer-violations',
        'module-size',
      ]);
      expect(loaded!.metrics['complexity']!.value).toBe(2);
      expect(loaded!.metrics['complexity']!.violationIds).toEqual(['cx-1', 'cx-2']);
      expect(loaded!.metrics['module-size']!.value).toBe(7);
      expect(loaded!.updatedFrom).toBe('commit-2');
    });

    it('overwrites categories that appear in both existing and new results', () => {
      manager.update(
        [{ category: 'complexity', scope: 'project', value: 5, violations: [] }],
        'commit-1'
      );
      manager.update(
        [
          {
            category: 'complexity',
            scope: 'project',
            value: 3,
            violations: [{ id: 'cx-x', file: 'x.ts', detail: 'd', severity: 'warning' }],
          },
        ],
        'commit-2'
      );

      const loaded = manager.load();
      expect(loaded!.metrics['complexity']!.value).toBe(3);
      expect(loaded!.metrics['complexity']!.violationIds).toEqual(['cx-x']);
    });

    it('writes a fresh baseline when none exists on disk', () => {
      const result = manager.update(
        [{ category: 'coupling', scope: 'project', value: 1, violations: [] }],
        'first'
      );
      expect(result.metrics['coupling']!.value).toBe(1);
      const loaded = manager.load();
      expect(loaded!.metrics['coupling']!.value).toBe(1);
    });
  });
});
