import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { TimelineManager } from '../../src/architecture/timeline-manager';
import type { TimelineFile } from '../../src/architecture/timeline-types';
import type { ArchMetricCategory } from '../../src/architecture/types';

function tmpDir(): string {
  return path.join(__dirname, '__test-tmp-timeline__');
}

function timelinePath(root: string): string {
  return path.join(root, '.harness', 'arch', 'timeline.json');
}

/** Helper: create MetricResult[] with one result per category */
function makeResults(
  overrides: Partial<Record<ArchMetricCategory, { value: number; violationCount: number }>> = {}
) {
  const categories: ArchMetricCategory[] = [
    'circular-deps',
    'layer-violations',
    'complexity',
    'coupling',
    'forbidden-imports',
    'module-size',
    'dependency-depth',
  ];
  return categories.map((category) => {
    const ov = overrides[category];
    const value = ov?.value ?? 0;
    const violationCount = ov?.violationCount ?? 0;
    const violations = Array.from({ length: violationCount }, (_, i) => ({
      id: `${category}-v${i}`,
      file: 'src/test.ts',
      detail: `test violation ${i}`,
      severity: 'warning' as const,
    }));
    return { category, scope: 'project', value, violations };
  });
}

describe('TimelineManager', () => {
  let root: string;
  let manager: TimelineManager;

  beforeEach(() => {
    root = tmpDir();
    fs.mkdirSync(root, { recursive: true });
    manager = new TimelineManager(root);
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  describe('load()', () => {
    it('returns empty TimelineFile when file does not exist', () => {
      const result = manager.load();
      expect(result).toEqual({ version: 1, snapshots: [] });
    });

    it('returns empty TimelineFile when file contains invalid JSON', () => {
      const fp = timelinePath(root);
      fs.mkdirSync(path.dirname(fp), { recursive: true });
      fs.writeFileSync(fp, 'not-json');
      const result = manager.load();
      expect(result).toEqual({ version: 1, snapshots: [] });
    });

    it('returns empty TimelineFile when file fails schema validation', () => {
      const fp = timelinePath(root);
      fs.mkdirSync(path.dirname(fp), { recursive: true });
      fs.writeFileSync(fp, JSON.stringify({ version: 99, snapshots: 'bad' }));
      const result = manager.load();
      expect(result).toEqual({ version: 1, snapshots: [] });
    });

    it('loads valid TimelineFile from disk', () => {
      const fp = timelinePath(root);
      fs.mkdirSync(path.dirname(fp), { recursive: true });
      const file: TimelineFile = {
        version: 1,
        snapshots: [
          {
            capturedAt: '2026-04-01T00:00:00.000Z',
            commitHash: 'abc1234',
            stabilityScore: 85,
            metrics: {
              'circular-deps': { value: 0, violationCount: 0 },
              'layer-violations': { value: 0, violationCount: 0 },
              complexity: { value: 15, violationCount: 0 },
              coupling: { value: 0, violationCount: 0 },
              'forbidden-imports': { value: 0, violationCount: 0 },
              'module-size': { value: 0, violationCount: 0 },
              'dependency-depth': { value: 0, violationCount: 0 },
            },
          },
        ],
      };
      fs.writeFileSync(fp, JSON.stringify(file));
      const result = manager.load();
      expect(result.version).toBe(1);
      expect(result.snapshots).toHaveLength(1);
      expect(result.snapshots[0]!.commitHash).toBe('abc1234');
    });
  });

  describe('save()', () => {
    it('creates parent directories and writes file', () => {
      const file: TimelineFile = { version: 1, snapshots: [] };
      manager.save(file);
      const fp = timelinePath(root);
      expect(fs.existsSync(fp)).toBe(true);
      const content = JSON.parse(fs.readFileSync(fp, 'utf-8'));
      expect(content.version).toBe(1);
    });

    it('uses atomic write -- no temp files left behind', () => {
      const file: TimelineFile = { version: 1, snapshots: [] };
      manager.save(file);
      const dir = path.dirname(timelinePath(root));
      const files = fs.readdirSync(dir);
      const tmpFiles = files.filter((f) => f.endsWith('.tmp'));
      expect(tmpFiles).toHaveLength(0);
    });
  });

  describe('computeStabilityScore()', () => {
    it('returns 100 when all categories have value 0', () => {
      const metrics = Object.fromEntries(
        [
          'circular-deps',
          'layer-violations',
          'complexity',
          'coupling',
          'forbidden-imports',
          'module-size',
          'dependency-depth',
        ].map((c) => [c, { value: 0, violationCount: 0 }])
      ) as Record<ArchMetricCategory, { value: number; violationCount: number }>;
      expect(manager.computeStabilityScore(metrics)).toBe(100);
    });

    it('returns 0 when all categories are at or above threshold', () => {
      const metrics = {
        'circular-deps': { value: 5, violationCount: 5 },
        'layer-violations': { value: 10, violationCount: 10 },
        complexity: { value: 100, violationCount: 5 },
        coupling: { value: 2, violationCount: 2 },
        'forbidden-imports': { value: 5, violationCount: 5 },
        'module-size': { value: 10, violationCount: 10 },
        'dependency-depth': { value: 10, violationCount: 10 },
      } as Record<ArchMetricCategory, { value: number; violationCount: number }>;
      expect(manager.computeStabilityScore(metrics)).toBe(0);
    });

    it('returns intermediate score for partial violations', () => {
      const metrics = Object.fromEntries(
        [
          'circular-deps',
          'layer-violations',
          'complexity',
          'coupling',
          'forbidden-imports',
          'module-size',
          'dependency-depth',
        ].map((c) => [c, { value: 0, violationCount: 0 }])
      ) as Record<ArchMetricCategory, { value: number; violationCount: number }>;
      // complexity threshold is 100, set value to 50 -> health = 0.5
      metrics['complexity'] = { value: 50, violationCount: 2 };
      // 6 categories at health 1.0, 1 at 0.5 => mean = (6 + 0.5) / 7 = 0.9286
      const score = manager.computeStabilityScore(metrics);
      expect(score).toBe(93); // round(0.9286 * 100)
    });
  });
});
