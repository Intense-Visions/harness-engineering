import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { PredictionEngine } from '../../src/architecture/prediction-engine';
import { PredictionResultSchema } from '../../src/architecture/prediction-types';
import { DEFAULT_STABILITY_THRESHOLDS } from '../../src/architecture/timeline-types';
import type { TimelineFile, TimelineSnapshot } from '../../src/architecture/timeline-types';
import type { ArchMetricCategory } from '../../src/architecture/types';
import type { TimelineManager } from '../../src/architecture/timeline-manager';
import { SpecImpactEstimator } from '../../src/architecture/spec-impact-estimator';

const ALL_CATEGORIES: ArchMetricCategory[] = [
  'circular-deps',
  'layer-violations',
  'complexity',
  'coupling',
  'forbidden-imports',
  'module-size',
  'dependency-depth',
];

/** Build a minimal snapshot with given overrides */
function makeSnapshot(
  weekOffset: number,
  overrides: Partial<Record<ArchMetricCategory, number>> = {},
  baseDate = '2026-01-05T00:00:00.000Z'
): TimelineSnapshot {
  const date = new Date(baseDate);
  date.setDate(date.getDate() + weekOffset * 7);

  const metrics: Record<string, { value: number; violationCount: number }> = {};
  for (const cat of ALL_CATEGORIES) {
    metrics[cat] = { value: overrides[cat] ?? 0, violationCount: 0 };
  }

  return {
    capturedAt: date.toISOString(),
    commitHash: `abc${weekOffset}`,
    stabilityScore: 80,
    metrics: metrics as TimelineSnapshot['metrics'],
  };
}

/** Build a mock TimelineManager that returns the given timeline */
function mockTimelineManager(timeline: TimelineFile): TimelineManager {
  return {
    load: () => timeline,
    save: () => {},
    capture: () => timeline.snapshots[0]!,
    trends: () => ({
      stability: { current: 80, previous: 80, delta: 0, direction: 'stable' as const },
      categories: {} as any,
      snapshotCount: timeline.snapshots.length,
      from: '',
      to: '',
    }),
    computeStabilityScore: (metrics: any, thresholds?: any) => {
      const t = thresholds ?? DEFAULT_STABILITY_THRESHOLDS;
      const scores: number[] = [];
      for (const cat of ALL_CATEGORIES) {
        const val = metrics[cat]?.value ?? 0;
        const thresh = t[cat] ?? 10;
        scores.push(Math.max(0, 1 - val / thresh));
      }
      return Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100);
    },
  } as unknown as TimelineManager;
}

describe('PredictionEngine', () => {
  describe('edge cases', () => {
    it('throws when fewer than 3 snapshots', () => {
      const tm = mockTimelineManager({ version: 1, snapshots: [makeSnapshot(0), makeSnapshot(1)] });
      const engine = new PredictionEngine('/tmp/test', tm, null);
      expect(() => engine.predict()).toThrow(/at least 3 snapshots/i);
    });

    it('throws when timeline is empty', () => {
      const tm = mockTimelineManager({ version: 1, snapshots: [] });
      const engine = new PredictionEngine('/tmp/test', tm, null);
      expect(() => engine.predict()).toThrow(/at least 3 snapshots/i);
    });

    it('handles exactly 3 snapshots (minimum viable)', () => {
      const snapshots = [makeSnapshot(0), makeSnapshot(1), makeSnapshot(2)];
      const tm = mockTimelineManager({ version: 1, snapshots });
      const engine = new PredictionEngine('/tmp/test', tm, null);
      const result = engine.predict();
      expect(result.snapshotsUsed).toBe(3);
      expect(PredictionResultSchema.parse(result)).toBeTruthy();
    });
  });

  describe('baseline forecasts with no estimator', () => {
    let engine: PredictionEngine;

    beforeEach(() => {
      // 5 snapshots with complexity increasing linearly: 40, 45, 50, 55, 60
      const snapshots = [
        makeSnapshot(0, { complexity: 40 }),
        makeSnapshot(1, { complexity: 45 }),
        makeSnapshot(2, { complexity: 50 }),
        makeSnapshot(3, { complexity: 55 }),
        makeSnapshot(4, { complexity: 60 }),
      ];
      const tm = mockTimelineManager({ version: 1, snapshots });
      engine = new PredictionEngine('/tmp/test', tm, null);
    });

    it('returns all 7 categories', () => {
      const result = engine.predict();
      for (const cat of ALL_CATEGORIES) {
        expect(result.categories[cat]).toBeDefined();
      }
    });

    it('returns valid PredictionResult (Zod parse succeeds)', () => {
      const result = engine.predict();
      expect(() => PredictionResultSchema.parse(result)).not.toThrow();
    });

    it('projects increasing values for complexity', () => {
      const result = engine.predict();
      const forecast = result.categories['complexity']!.baseline;
      expect(forecast.current).toBe(60);
      expect(forecast.projectedValue4w).toBeGreaterThan(60);
      expect(forecast.projectedValue8w).toBeGreaterThan(forecast.projectedValue4w);
      expect(forecast.projectedValue12w).toBeGreaterThan(forecast.projectedValue8w);
    });

    it('computes threshold crossing for complexity (threshold=100)', () => {
      const result = engine.predict();
      const forecast = result.categories['complexity']!.baseline;
      expect(forecast.thresholdCrossingWeeks).toBeGreaterThan(0);
      expect(forecast.thresholdCrossingWeeks).not.toBeNull();
    });

    it('returns null threshold crossing for zero-value categories', () => {
      const result = engine.predict();
      const forecast = result.categories['circular-deps']!.baseline;
      expect(forecast.current).toBe(0);
      expect(forecast.thresholdCrossingWeeks).toBeNull();
    });

    it('adjusted equals baseline when no estimator', () => {
      const result = engine.predict();
      for (const cat of ALL_CATEGORIES) {
        const af = result.categories[cat]!;
        expect(af.adjusted).toEqual(af.baseline);
        expect(af.contributingFeatures).toEqual([]);
      }
    });

    it('classifies direction correctly', () => {
      const result = engine.predict();
      // complexity is increasing -> declining
      expect(result.categories['complexity']!.baseline.direction).toBe('declining');
      // zero categories -> stable
      expect(result.categories['circular-deps']!.baseline.direction).toBe('stable');
    });

    it('includes timelineRange from first to last snapshot', () => {
      const result = engine.predict();
      expect(result.timelineRange.from).toContain('2026-01-05');
      expect(result.timelineRange.to).toContain('2026-02-02');
    });

    it('sets snapshotsUsed correctly', () => {
      const result = engine.predict();
      expect(result.snapshotsUsed).toBe(5);
    });
  });

  describe('warnings', () => {
    it('generates critical warning for threshold crossing <= 4 weeks with high confidence', () => {
      // complexity at 95, threshold 100, slope ~5/week -> crosses in 1 week
      const snapshots = [
        makeSnapshot(0, { complexity: 70 }),
        makeSnapshot(1, { complexity: 75 }),
        makeSnapshot(2, { complexity: 80 }),
        makeSnapshot(3, { complexity: 85 }),
        makeSnapshot(4, { complexity: 90 }),
        makeSnapshot(5, { complexity: 95 }),
      ];
      const tm = mockTimelineManager({ version: 1, snapshots });
      const engine = new PredictionEngine('/tmp/test', tm, null);
      const result = engine.predict();

      const criticals = result.warnings.filter((w) => w.severity === 'critical');
      expect(criticals.length).toBeGreaterThanOrEqual(1);
      expect(criticals[0]!.category).toBe('complexity');
      expect(criticals[0]!.weeksUntil).toBeLessThanOrEqual(4);
    });

    it('generates warning severity for threshold crossing <= 8 weeks', () => {
      // complexity at 65, threshold 100, slope ~5/week -> crosses in ~7 weeks
      const snapshots = [
        makeSnapshot(0, { complexity: 40 }),
        makeSnapshot(1, { complexity: 45 }),
        makeSnapshot(2, { complexity: 50 }),
        makeSnapshot(3, { complexity: 55 }),
        makeSnapshot(4, { complexity: 60 }),
        makeSnapshot(5, { complexity: 65 }),
      ];
      const tm = mockTimelineManager({ version: 1, snapshots });
      const engine = new PredictionEngine('/tmp/test', tm, null);
      const result = engine.predict();

      const warnings = result.warnings.filter((w) => w.severity === 'warning');
      expect(warnings.length).toBeGreaterThanOrEqual(1);
      expect(warnings[0]!.category).toBe('complexity');
    });

    it('generates info severity for threshold crossing <= 12 weeks', () => {
      // complexity at 50, threshold 100, slope ~5/week -> crosses in ~10 weeks
      const snapshots = [
        makeSnapshot(0, { complexity: 25 }),
        makeSnapshot(1, { complexity: 30 }),
        makeSnapshot(2, { complexity: 35 }),
        makeSnapshot(3, { complexity: 40 }),
        makeSnapshot(4, { complexity: 45 }),
        makeSnapshot(5, { complexity: 50 }),
      ];
      const tm = mockTimelineManager({ version: 1, snapshots });
      const engine = new PredictionEngine('/tmp/test', tm, null);
      const result = engine.predict();

      const infos = result.warnings.filter((w) => w.severity === 'info');
      expect(infos.length).toBeGreaterThanOrEqual(1);
      expect(infos[0]!.category).toBe('complexity');
    });

    it('does not generate warnings for stable/improving categories', () => {
      // all categories at zero, stable
      const snapshots = [
        makeSnapshot(0),
        makeSnapshot(1),
        makeSnapshot(2),
        makeSnapshot(3),
        makeSnapshot(4),
      ];
      const tm = mockTimelineManager({ version: 1, snapshots });
      const engine = new PredictionEngine('/tmp/test', tm, null);
      const result = engine.predict();
      expect(result.warnings).toEqual([]);
    });

    it('warning contributingFeatures is empty in baseline mode', () => {
      const snapshots = [
        makeSnapshot(0, { complexity: 70 }),
        makeSnapshot(1, { complexity: 75 }),
        makeSnapshot(2, { complexity: 80 }),
        makeSnapshot(3, { complexity: 85 }),
        makeSnapshot(4, { complexity: 90 }),
        makeSnapshot(5, { complexity: 95 }),
      ];
      const tm = mockTimelineManager({ version: 1, snapshots });
      const engine = new PredictionEngine('/tmp/test', tm, null);
      const result = engine.predict();
      for (const w of result.warnings) {
        expect(w.contributingFeatures).toEqual([]);
      }
    });
  });

  describe('stability forecast', () => {
    it('computes composite stability forecast', () => {
      const snapshots = [
        makeSnapshot(0, { complexity: 40 }),
        makeSnapshot(1, { complexity: 45 }),
        makeSnapshot(2, { complexity: 50 }),
        makeSnapshot(3, { complexity: 55 }),
        makeSnapshot(4, { complexity: 60 }),
      ];
      const tm = mockTimelineManager({ version: 1, snapshots });
      const engine = new PredictionEngine('/tmp/test', tm, null);
      const result = engine.predict();

      expect(result.stabilityForecast.current).toBeGreaterThan(0);
      expect(result.stabilityForecast.current).toBeLessThanOrEqual(100);
      // With complexity increasing, projected stability should decrease
      expect(result.stabilityForecast.projected12w).toBeLessThanOrEqual(
        result.stabilityForecast.current
      );
    });

    it('stability forecast has valid confidence and direction', () => {
      const snapshots = [
        makeSnapshot(0, { complexity: 40 }),
        makeSnapshot(1, { complexity: 45 }),
        makeSnapshot(2, { complexity: 50 }),
        makeSnapshot(3, { complexity: 55 }),
        makeSnapshot(4, { complexity: 60 }),
      ];
      const tm = mockTimelineManager({ version: 1, snapshots });
      const engine = new PredictionEngine('/tmp/test', tm, null);
      const result = engine.predict();

      expect(['high', 'medium', 'low']).toContain(result.stabilityForecast.confidence);
      expect(['improving', 'stable', 'declining']).toContain(result.stabilityForecast.direction);
    });
  });

  describe('options', () => {
    it('respects categories filter', () => {
      const snapshots = [
        makeSnapshot(0, { complexity: 40, coupling: 0.5 }),
        makeSnapshot(1, { complexity: 45, coupling: 0.6 }),
        makeSnapshot(2, { complexity: 50, coupling: 0.7 }),
        makeSnapshot(3, { complexity: 55, coupling: 0.8 }),
        makeSnapshot(4, { complexity: 60, coupling: 0.9 }),
      ];
      const tm = mockTimelineManager({ version: 1, snapshots });
      const engine = new PredictionEngine('/tmp/test', tm, null);
      const result = engine.predict({ categories: ['complexity', 'coupling'] });

      // Should still have all 7 categories in result but only filtered ones get full regression
      expect(result.categories['complexity']).toBeDefined();
      expect(result.categories['coupling']).toBeDefined();
    });

    it('respects custom thresholds', () => {
      const snapshots = [
        makeSnapshot(0, { complexity: 40 }),
        makeSnapshot(1, { complexity: 45 }),
        makeSnapshot(2, { complexity: 50 }),
        makeSnapshot(3, { complexity: 55 }),
        makeSnapshot(4, { complexity: 60 }),
      ];
      const tm = mockTimelineManager({ version: 1, snapshots });
      const engine = new PredictionEngine('/tmp/test', tm, null);

      // With threshold=200, crossing should be further out (or null)
      const result = engine.predict({ thresholds: { complexity: 200 } });
      const forecast = result.categories['complexity']!.baseline;
      expect(forecast.threshold).toBe(200);
    });
  });

  describe('roadmap integration with SpecImpactEstimator', () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pred-engine-'));
      // Write harness.config.json
      fs.writeFileSync(
        path.join(tmpDir, 'harness.config.json'),
        JSON.stringify({
          version: 1,
          name: 'test',
          layers: [
            { name: 'core', pattern: 'src/core/**', allowedDependencies: [] },
            { name: 'cli', pattern: 'src/cli/**', allowedDependencies: ['core'] },
          ],
        })
      );
      // Write a roadmap.md
      fs.writeFileSync(
        path.join(tmpDir, 'roadmap.md'),
        [
          '---',
          'project: test',
          'version: 1',
          'last_synced: 2026-01-01',
          'last_manual_edit: 2026-01-01',
          '---',
          '',
          '## Milestone: MVP',
          '',
          '### Feature A',
          '',
          '- **Status:** planned',
          '- **Spec:** docs/spec-a.md',
          '- **Plans:** —',
          '- **Blocked by:** —',
          '- **Summary:** A feature',
          '',
          '### Feature B',
          '',
          '- **Status:** planned',
          '- **Spec:** —',
          '- **Plans:** —',
          '- **Blocked by:** —',
          '- **Summary:** No spec',
        ].join('\n')
      );
      // Write spec-a.md with known signals
      fs.mkdirSync(path.join(tmpDir, 'docs'), { recursive: true });
      fs.writeFileSync(
        path.join(tmpDir, 'docs/spec-a.md'),
        [
          '# Feature A',
          '',
          '## Technical Design',
          '',
          '```',
          'src/core/new-service.ts',
          'src/core/new-service.test.ts',
          '```',
          '',
          '## Implementation Order',
          '',
          '### Phase 1: Foundation',
          '',
          '### Phase 2: Integration',
        ].join('\n')
      );
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('adjusted differs from baseline when estimator is provided and includeRoadmap is true', () => {
      const snapshots = [
        makeSnapshot(0, { complexity: 40 }),
        makeSnapshot(1, { complexity: 45 }),
        makeSnapshot(2, { complexity: 50 }),
        makeSnapshot(3, { complexity: 55 }),
        makeSnapshot(4, { complexity: 60 }),
      ];
      const tm = mockTimelineManager({ version: 1, snapshots });
      const estimator = new SpecImpactEstimator(tmpDir);
      const engine = new PredictionEngine(tmpDir, tm, estimator);
      const result = engine.predict({ includeRoadmap: true });

      // Complexity adjusted should be higher than baseline (spec adds files + phases)
      const complexityAF = result.categories['complexity']!;
      expect(complexityAF.adjusted.projectedValue4w).toBeGreaterThan(
        complexityAF.baseline.projectedValue4w
      );
    });

    it('contributingFeatures is populated for affected categories', () => {
      const snapshots = [
        makeSnapshot(0, { complexity: 40 }),
        makeSnapshot(1, { complexity: 45 }),
        makeSnapshot(2, { complexity: 50 }),
        makeSnapshot(3, { complexity: 55 }),
        makeSnapshot(4, { complexity: 60 }),
      ];
      const tm = mockTimelineManager({ version: 1, snapshots });
      const estimator = new SpecImpactEstimator(tmpDir);
      const engine = new PredictionEngine(tmpDir, tm, estimator);
      const result = engine.predict({ includeRoadmap: true });

      const complexityAF = result.categories['complexity']!;
      expect(complexityAF.contributingFeatures.length).toBeGreaterThan(0);
      expect(complexityAF.contributingFeatures[0]!.name).toBe('Feature A');
      expect(complexityAF.contributingFeatures[0]!.delta).toBeGreaterThan(0);
    });

    it('adjusted equals baseline when includeRoadmap is false', () => {
      const snapshots = [
        makeSnapshot(0, { complexity: 40 }),
        makeSnapshot(1, { complexity: 45 }),
        makeSnapshot(2, { complexity: 50 }),
        makeSnapshot(3, { complexity: 55 }),
        makeSnapshot(4, { complexity: 60 }),
      ];
      const tm = mockTimelineManager({ version: 1, snapshots });
      const estimator = new SpecImpactEstimator(tmpDir);
      const engine = new PredictionEngine(tmpDir, tm, estimator);
      const result = engine.predict({ includeRoadmap: false });

      for (const cat of ALL_CATEGORIES) {
        const af = result.categories[cat]!;
        expect(af.adjusted).toEqual(af.baseline);
        expect(af.contributingFeatures).toEqual([]);
      }
    });

    it('adjusted equals baseline when estimator is null', () => {
      const snapshots = [
        makeSnapshot(0, { complexity: 40 }),
        makeSnapshot(1, { complexity: 45 }),
        makeSnapshot(2, { complexity: 50 }),
        makeSnapshot(3, { complexity: 55 }),
        makeSnapshot(4, { complexity: 60 }),
      ];
      const tm = mockTimelineManager({ version: 1, snapshots });
      const engine = new PredictionEngine(tmpDir, tm, null);
      const result = engine.predict({ includeRoadmap: true });

      for (const cat of ALL_CATEGORIES) {
        const af = result.categories[cat]!;
        expect(af.adjusted).toEqual(af.baseline);
      }
    });

    it('warnings use adjusted forecast for severity calculation', () => {
      // Complexity close to threshold -- spec impact should push it into warning range
      const snapshots = [
        makeSnapshot(0, { complexity: 70 }),
        makeSnapshot(1, { complexity: 75 }),
        makeSnapshot(2, { complexity: 80 }),
        makeSnapshot(3, { complexity: 85 }),
        makeSnapshot(4, { complexity: 90 }),
      ];
      const tm = mockTimelineManager({ version: 1, snapshots });
      const estimator = new SpecImpactEstimator(tmpDir);
      const engine = new PredictionEngine(tmpDir, tm, estimator);
      const result = engine.predict({ includeRoadmap: true });

      // Should have a warning for complexity
      const complexityWarning = result.warnings.find((w) => w.category === 'complexity');
      expect(complexityWarning).toBeDefined();
      // Contributing features should be populated on the warning
      expect(complexityWarning!.contributingFeatures.length).toBeGreaterThan(0);
    });

    it('result still validates against Zod schema with roadmap integration', () => {
      const snapshots = [
        makeSnapshot(0, { complexity: 40 }),
        makeSnapshot(1, { complexity: 45 }),
        makeSnapshot(2, { complexity: 50 }),
        makeSnapshot(3, { complexity: 55 }),
        makeSnapshot(4, { complexity: 60 }),
      ];
      const tm = mockTimelineManager({ version: 1, snapshots });
      const estimator = new SpecImpactEstimator(tmpDir);
      const engine = new PredictionEngine(tmpDir, tm, estimator);
      const result = engine.predict({ includeRoadmap: true });

      expect(() => PredictionResultSchema.parse(result)).not.toThrow();
    });
  });
});
