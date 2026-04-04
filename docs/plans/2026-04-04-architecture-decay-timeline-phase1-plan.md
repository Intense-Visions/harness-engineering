# Plan: Architecture Decay Timeline -- Phase 1: Core Types and TimelineManager

**Date:** 2026-04-04
**Spec:** docs/changes/architecture-decay-timeline/proposal.md
**Estimated tasks:** 6
**Estimated time:** 25 minutes

## Goal

TimelineManager can capture, persist, load, and compute trends over architecture metric snapshots, with a composite 0-100 stability score, stored in `.harness/arch/timeline.json`.

## Observable Truths (Acceptance Criteria)

1. `packages/core/src/architecture/timeline-types.ts` exists and exports `TimelineSnapshot`, `CategorySnapshot`, `TimelineFile`, `TrendResult`, `TrendLine` types plus `TimelineFileSchema` Zod schema.
2. `packages/core/src/architecture/timeline-manager.ts` exists and exports `TimelineManager` class with `capture()`, `load()`, `save()`, `trends()`, `computeStabilityScore()` methods.
3. `packages/core/src/architecture/index.ts` re-exports all new types and `TimelineManager`.
4. When `capture()` is called with `MetricResult[]` and a commit hash, it returns a `TimelineSnapshot` with all 7 categories, a stability score 0-100, and persists to disk.
5. When `capture()` is called with a commit hash matching the latest snapshot, it replaces rather than appends (deduplication).
6. When `load()` is called and the file does not exist, it returns an empty `TimelineFile` with `version: 1` and empty snapshots array.
7. When `save()` is called, it uses atomic write (temp file + rename) matching `ArchBaselineManager.save()` pattern.
8. When `trends()` is called with `{ last: N }`, it computes `TrendResult` comparing first and last snapshots in the window with correct delta and direction.
9. `computeStabilityScore()` returns 100 when all categories have 0 violations/value, and returns lower scores proportional to category values vs thresholds.
10. `|delta| < 2` is classified as `stable` direction.
11. `npx vitest run packages/core/src/architecture/timeline-manager.test.ts` passes with all tests green.
12. `harness validate` passes.

## File Map

- CREATE `packages/core/src/architecture/timeline-types.ts`
- CREATE `packages/core/src/architecture/timeline-manager.ts`
- CREATE `packages/core/src/architecture/timeline-manager.test.ts`
- MODIFY `packages/core/src/architecture/index.ts` (add exports)

## Tasks

### Task 1: Define timeline types and Zod schemas

**Depends on:** none
**Files:** `packages/core/src/architecture/timeline-types.ts`

1. Create `packages/core/src/architecture/timeline-types.ts` with the following content:

```typescript
import { z } from 'zod';
import { ArchMetricCategorySchema } from './types';
import type { ArchMetricCategory } from './types';

// --- Category Snapshot ---

export const CategorySnapshotSchema = z.object({
  /** Aggregate metric value (e.g., violation count, avg complexity) */
  value: z.number(),
  /** Count of violations in this category */
  violationCount: z.number(),
});

export type CategorySnapshot = z.infer<typeof CategorySnapshotSchema>;

// --- Timeline Snapshot ---

export const TimelineSnapshotSchema = z.object({
  /** ISO 8601 timestamp of capture */
  capturedAt: z.string().datetime(),
  /** Git commit hash at capture time */
  commitHash: z.string(),
  /** Composite stability score (0-100, higher is healthier) */
  stabilityScore: z.number().min(0).max(100),
  /** Per-category metric aggregates */
  metrics: z.record(ArchMetricCategorySchema, CategorySnapshotSchema),
});

export type TimelineSnapshot = z.infer<typeof TimelineSnapshotSchema>;

// --- Timeline File ---

export const TimelineFileSchema = z.object({
  version: z.literal(1),
  snapshots: z.array(TimelineSnapshotSchema),
});

export type TimelineFile = z.infer<typeof TimelineFileSchema>;

// --- Trend Line ---

export const TrendLineSchema = z.object({
  /** Current value */
  current: z.number(),
  /** Previous value (from comparison snapshot) */
  previous: z.number(),
  /** Absolute delta (current - previous) */
  delta: z.number(),
  /** Direction indicator */
  direction: z.enum(['improving', 'stable', 'declining']),
});

export type TrendLine = z.infer<typeof TrendLineSchema>;

// --- Trend Result ---

export const TrendResultSchema = z.object({
  /** Overall stability trend */
  stability: TrendLineSchema,
  /** Per-category trends */
  categories: z.record(ArchMetricCategorySchema, TrendLineSchema),
  /** Number of snapshots analyzed */
  snapshotCount: z.number(),
  /** Time range covered */
  from: z.string(),
  to: z.string(),
});

export type TrendResult = z.infer<typeof TrendResultSchema>;

// --- Default thresholds for stability score computation ---

/**
 * Reasonable ceiling per category for normalizing health scores.
 * health = max(0, 1 - (value / threshold))
 * Categories at or above threshold get health = 0.
 */
export const DEFAULT_STABILITY_THRESHOLDS: Record<ArchMetricCategory, number> = {
  'circular-deps': 5,
  'layer-violations': 10,
  complexity: 100,
  coupling: 2,
  'forbidden-imports': 5,
  'module-size': 10,
  'dependency-depth': 10,
};
```

2. Run: `npx harness validate`
3. Commit: `feat(arch): define timeline types and Zod schemas`

---

### Task 2: Implement TimelineManager -- load, save, computeStabilityScore

**Depends on:** Task 1
**Files:** `packages/core/src/architecture/timeline-manager.ts`

1. Create `packages/core/src/architecture/timeline-manager.ts` with the following content:

```typescript
import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { join, dirname } from 'node:path';
import { TimelineFileSchema, DEFAULT_STABILITY_THRESHOLDS } from './timeline-types';
import type {
  TimelineFile,
  TimelineSnapshot,
  CategorySnapshot,
  TrendResult,
  TrendLine,
} from './timeline-types';
import type { ArchMetricCategory, MetricResult } from './types';
import { ArchMetricCategorySchema } from './types';

const ALL_CATEGORIES = ArchMetricCategorySchema.options;

export class TimelineManager {
  private readonly timelinePath: string;

  constructor(private readonly rootDir: string) {
    this.timelinePath = join(rootDir, '.harness', 'arch', 'timeline.json');
  }

  /**
   * Load timeline from disk.
   * Returns empty TimelineFile if file does not exist or is invalid.
   */
  load(): TimelineFile {
    if (!existsSync(this.timelinePath)) {
      return { version: 1, snapshots: [] };
    }
    try {
      const raw = readFileSync(this.timelinePath, 'utf-8');
      const data = JSON.parse(raw);
      const parsed = TimelineFileSchema.safeParse(data);
      if (!parsed.success) {
        console.error(
          `Timeline validation failed for ${this.timelinePath}:`,
          parsed.error.format()
        );
        return { version: 1, snapshots: [] };
      }
      return parsed.data;
    } catch (error) {
      console.error(`Error loading timeline from ${this.timelinePath}:`, error);
      return { version: 1, snapshots: [] };
    }
  }

  /**
   * Save timeline to disk using atomic write (temp file + rename).
   * Creates parent directories if they do not exist.
   */
  save(timeline: TimelineFile): void {
    const dir = dirname(this.timelinePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    const tmp = this.timelinePath + '.' + randomBytes(4).toString('hex') + '.tmp';
    writeFileSync(tmp, JSON.stringify(timeline, null, 2));
    renameSync(tmp, this.timelinePath);
  }

  /**
   * Capture a new snapshot from current metric results.
   * Aggregates MetricResult[] by category, computes stability score,
   * appends to timeline (or replaces if same commitHash), and saves.
   */
  capture(results: MetricResult[], commitHash: string): TimelineSnapshot {
    const metrics = this.aggregateByCategory(results);
    const stabilityScore = this.computeStabilityScore(metrics);

    const snapshot: TimelineSnapshot = {
      capturedAt: new Date().toISOString(),
      commitHash,
      stabilityScore,
      metrics,
    };

    const timeline = this.load();

    // Deduplication: if latest snapshot has same commitHash, replace it
    const lastIndex = timeline.snapshots.length - 1;
    if (lastIndex >= 0 && timeline.snapshots[lastIndex]!.commitHash === commitHash) {
      timeline.snapshots[lastIndex] = snapshot;
    } else {
      timeline.snapshots.push(snapshot);
    }

    this.save(timeline);
    return snapshot;
  }

  /**
   * Compute trends between snapshots over a window.
   * @param options.last - Number of recent snapshots to analyze (default: 10)
   * @param options.since - ISO date string to filter snapshots from
   */
  trends(options?: { last?: number; since?: string }): TrendResult {
    const timeline = this.load();
    let snapshots = timeline.snapshots;

    if (options?.since) {
      const sinceDate = new Date(options.since);
      snapshots = snapshots.filter((s) => new Date(s.capturedAt) >= sinceDate);
    }

    if (options?.last && snapshots.length > options.last) {
      snapshots = snapshots.slice(-options.last);
    }

    if (snapshots.length === 0) {
      return this.emptyTrendResult();
    }

    if (snapshots.length === 1) {
      const only = snapshots[0]!;
      return {
        stability: this.buildTrendLine(only.stabilityScore, only.stabilityScore, true),
        categories: this.buildCategoryTrends(only.metrics, only.metrics),
        snapshotCount: 1,
        from: only.capturedAt,
        to: only.capturedAt,
      };
    }

    const first = snapshots[0]!;
    const last = snapshots[snapshots.length - 1]!;

    return {
      stability: this.buildTrendLine(last.stabilityScore, first.stabilityScore, true),
      categories: this.buildCategoryTrends(last.metrics, first.metrics),
      snapshotCount: snapshots.length,
      from: first.capturedAt,
      to: last.capturedAt,
    };
  }

  /**
   * Compute composite stability score from category metrics.
   * Equal weight across all categories. Score is 0-100 (higher = healthier).
   * health = max(0, 1 - (value / threshold)) per category.
   */
  computeStabilityScore(
    metrics: Record<ArchMetricCategory, CategorySnapshot>,
    thresholds: Record<ArchMetricCategory, number> = DEFAULT_STABILITY_THRESHOLDS
  ): number {
    const healthScores: number[] = [];

    for (const category of ALL_CATEGORIES) {
      const snapshot = metrics[category];
      if (!snapshot) {
        // Missing category treated as perfectly healthy
        healthScores.push(1.0);
        continue;
      }
      const threshold = thresholds[category] ?? 10;
      const health = Math.max(0, 1 - snapshot.value / threshold);
      healthScores.push(health);
    }

    const mean = healthScores.reduce((sum, h) => sum + h, 0) / healthScores.length;
    return Math.round(mean * 100);
  }

  // --- Private helpers ---

  private aggregateByCategory(
    results: MetricResult[]
  ): Record<ArchMetricCategory, CategorySnapshot> {
    const metrics: Partial<Record<ArchMetricCategory, CategorySnapshot>> = {};

    for (const result of results) {
      const existing = metrics[result.category];
      if (existing) {
        existing.value += result.value;
        existing.violationCount += result.violations.length;
      } else {
        metrics[result.category] = {
          value: result.value,
          violationCount: result.violations.length,
        };
      }
    }

    // Ensure all categories present (missing ones get zero values)
    for (const category of ALL_CATEGORIES) {
      if (!metrics[category]) {
        metrics[category] = { value: 0, violationCount: 0 };
      }
    }

    return metrics as Record<ArchMetricCategory, CategorySnapshot>;
  }

  private buildTrendLine(current: number, previous: number, isStabilityScore: boolean): TrendLine {
    const delta = current - previous;
    let direction: 'improving' | 'stable' | 'declining';

    if (Math.abs(delta) < 2) {
      direction = 'stable';
    } else if (isStabilityScore) {
      // For stability score: higher is better
      direction = delta > 0 ? 'improving' : 'declining';
    } else {
      // For violation categories: lower is better
      direction = delta < 0 ? 'improving' : 'declining';
    }

    return { current, previous, delta, direction };
  }

  private buildCategoryTrends(
    currentMetrics: Record<ArchMetricCategory, CategorySnapshot>,
    previousMetrics: Record<ArchMetricCategory, CategorySnapshot>
  ): Record<ArchMetricCategory, TrendLine> {
    const trends: Partial<Record<ArchMetricCategory, TrendLine>> = {};

    for (const category of ALL_CATEGORIES) {
      const current = currentMetrics[category]?.value ?? 0;
      const previous = previousMetrics[category]?.value ?? 0;
      // For categories: lower values are better (fewer violations/lower complexity)
      trends[category] = this.buildTrendLine(current, previous, false);
    }

    return trends as Record<ArchMetricCategory, TrendLine>;
  }

  private emptyTrendResult(): TrendResult {
    const zeroLine: TrendLine = { current: 0, previous: 0, delta: 0, direction: 'stable' };
    const categories: Partial<Record<ArchMetricCategory, TrendLine>> = {};
    for (const category of ALL_CATEGORIES) {
      categories[category] = { ...zeroLine };
    }

    return {
      stability: { ...zeroLine },
      categories: categories as Record<ArchMetricCategory, TrendLine>,
      snapshotCount: 0,
      from: '',
      to: '',
    };
  }
}
```

2. Run: `npx harness validate`
3. Commit: `feat(arch): implement TimelineManager with capture/load/save/trends`

---

### Task 3: Add barrel exports to architecture index

**Depends on:** Task 1, Task 2
**Files:** `packages/core/src/architecture/index.ts`

1. Add the following exports to the end of `packages/core/src/architecture/index.ts`:

```typescript
export {
  CategorySnapshotSchema,
  TimelineSnapshotSchema,
  TimelineFileSchema,
  TrendLineSchema,
  TrendResultSchema,
  DEFAULT_STABILITY_THRESHOLDS,
} from './timeline-types';

export type {
  CategorySnapshot as TimelineCategorySnapshot,
  TimelineSnapshot,
  TimelineFile,
  TrendLine,
  TrendResult,
} from './timeline-types';

export { TimelineManager } from './timeline-manager';
```

Note: `CategorySnapshot` is exported as `TimelineCategorySnapshot` to avoid confusion with any future type conflicts -- it is specific to timeline snapshots.

2. Run: `npx harness validate`
3. Commit: `feat(arch): export timeline types and TimelineManager from barrel`

---

### Task 4: Unit tests -- load, save, computeStabilityScore

**Depends on:** Task 2
**Files:** `packages/core/src/architecture/timeline-manager.test.ts`

1. Create `packages/core/src/architecture/timeline-manager.test.ts` with the following content:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { TimelineManager } from './timeline-manager';
import type { TimelineFile } from './timeline-types';
import type { ArchMetricCategory } from './types';

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
```

2. Run: `npx vitest run packages/core/src/architecture/timeline-manager.test.ts`
3. Observe: all tests pass.
4. Run: `npx harness validate`
5. Commit: `test(arch): add unit tests for TimelineManager load/save/computeStabilityScore`

---

### Task 5: Unit tests -- capture and deduplication

**Depends on:** Task 4
**Files:** `packages/core/src/architecture/timeline-manager.test.ts`

1. Append the following test blocks inside the outer `describe('TimelineManager', ...)` block in `packages/core/src/architecture/timeline-manager.test.ts`:

```typescript
describe('capture()', () => {
  it('creates snapshot with all 7 categories from MetricResult[]', () => {
    const results = makeResults({
      complexity: { value: 30, violationCount: 2 },
      coupling: { value: 0.5, violationCount: 1 },
    });
    const snapshot = manager.capture(results, 'abc1234');

    expect(snapshot.commitHash).toBe('abc1234');
    expect(snapshot.capturedAt).toBeTruthy();
    expect(snapshot.stabilityScore).toBeGreaterThanOrEqual(0);
    expect(snapshot.stabilityScore).toBeLessThanOrEqual(100);
    expect(Object.keys(snapshot.metrics)).toHaveLength(7);
    expect(snapshot.metrics['complexity']!.value).toBe(30);
    expect(snapshot.metrics['complexity']!.violationCount).toBe(2);
    expect(snapshot.metrics['coupling']!.value).toBe(0.5);
  });

  it('persists snapshot to disk', () => {
    const results = makeResults();
    manager.capture(results, 'abc1234');
    const loaded = manager.load();
    expect(loaded.snapshots).toHaveLength(1);
    expect(loaded.snapshots[0]!.commitHash).toBe('abc1234');
  });

  it('appends new snapshot for different commit hash', () => {
    const results = makeResults();
    manager.capture(results, 'abc1234');
    manager.capture(results, 'def5678');
    const loaded = manager.load();
    expect(loaded.snapshots).toHaveLength(2);
  });

  it('deduplicates -- replaces latest snapshot when commit hash matches', () => {
    const results1 = makeResults({ complexity: { value: 30, violationCount: 2 } });
    manager.capture(results1, 'abc1234');

    const results2 = makeResults({ complexity: { value: 25, violationCount: 1 } });
    manager.capture(results2, 'abc1234');

    const loaded = manager.load();
    expect(loaded.snapshots).toHaveLength(1);
    expect(loaded.snapshots[0]!.metrics['complexity']!.value).toBe(25);
  });

  it('only deduplicates when latest snapshot matches -- not earlier ones', () => {
    const results = makeResults();
    manager.capture(results, 'aaa');
    manager.capture(results, 'bbb');
    manager.capture(results, 'aaa'); // does NOT deduplicate because latest is 'bbb'
    const loaded = manager.load();
    expect(loaded.snapshots).toHaveLength(3);
  });

  it('aggregates multiple MetricResults for same category', () => {
    const results = [
      { category: 'complexity' as const, scope: 'src/a.ts', value: 10, violations: [] },
      {
        category: 'complexity' as const,
        scope: 'src/b.ts',
        value: 20,
        violations: [{ id: 'v1', file: 'src/b.ts', detail: 'high', severity: 'warning' as const }],
      },
    ];
    const snapshot = manager.capture(results, 'abc1234');
    expect(snapshot.metrics['complexity']!.value).toBe(30);
    expect(snapshot.metrics['complexity']!.violationCount).toBe(1);
  });
});
```

2. Run: `npx vitest run packages/core/src/architecture/timeline-manager.test.ts`
3. Observe: all tests pass (previous + new).
4. Run: `npx harness validate`
5. Commit: `test(arch): add unit tests for TimelineManager capture and deduplication`

---

### Task 6: Unit tests -- trends computation

**Depends on:** Task 5
**Files:** `packages/core/src/architecture/timeline-manager.test.ts`

1. Append the following test block inside the outer `describe('TimelineManager', ...)` block in `packages/core/src/architecture/timeline-manager.test.ts`:

```typescript
describe('trends()', () => {
  it('returns empty trend result when no snapshots exist', () => {
    const result = manager.trends();
    expect(result.snapshotCount).toBe(0);
    expect(result.stability.direction).toBe('stable');
    expect(result.from).toBe('');
    expect(result.to).toBe('');
  });

  it('returns stable trends for single snapshot', () => {
    const results = makeResults({ complexity: { value: 30, violationCount: 2 } });
    manager.capture(results, 'abc1234');
    const trend = manager.trends();
    expect(trend.snapshotCount).toBe(1);
    expect(trend.stability.delta).toBe(0);
    expect(trend.stability.direction).toBe('stable');
  });

  it('detects improving stability trend', () => {
    // First snapshot: high complexity (lower score)
    const results1 = makeResults({ complexity: { value: 80, violationCount: 5 } });
    manager.capture(results1, 'aaa');

    // Second snapshot: low complexity (higher score)
    const results2 = makeResults({ complexity: { value: 10, violationCount: 1 } });
    manager.capture(results2, 'bbb');

    const trend = manager.trends();
    expect(trend.snapshotCount).toBe(2);
    expect(trend.stability.direction).toBe('improving');
    expect(trend.stability.delta).toBeGreaterThan(0);
  });

  it('detects declining stability trend', () => {
    // First snapshot: low complexity (higher score)
    const results1 = makeResults({ complexity: { value: 10, violationCount: 1 } });
    manager.capture(results1, 'aaa');

    // Second snapshot: high complexity (lower score)
    const results2 = makeResults({ complexity: { value: 80, violationCount: 5 } });
    manager.capture(results2, 'bbb');

    const trend = manager.trends();
    expect(trend.stability.direction).toBe('declining');
    expect(trend.stability.delta).toBeLessThan(0);
  });

  it('classifies |delta| < 2 as stable direction', () => {
    const results1 = makeResults({ complexity: { value: 50, violationCount: 2 } });
    manager.capture(results1, 'aaa');

    // Only change complexity by 1 -- stability score delta should be < 2
    const results2 = makeResults({ complexity: { value: 51, violationCount: 2 } });
    manager.capture(results2, 'bbb');

    const trend = manager.trends();
    expect(trend.stability.direction).toBe('stable');
  });

  it('respects { last: N } option', () => {
    for (let i = 0; i < 5; i++) {
      const results = makeResults({
        complexity: { value: i * 10, violationCount: i },
      });
      manager.capture(results, `commit-${i}`);
    }

    const trend = manager.trends({ last: 3 });
    expect(trend.snapshotCount).toBe(3);
  });

  it('respects { since } option', () => {
    // Manually save snapshots with known timestamps
    const timeline: TimelineFile = {
      version: 1,
      snapshots: [
        {
          capturedAt: '2026-01-01T00:00:00.000Z',
          commitHash: 'old',
          stabilityScore: 80,
          metrics: Object.fromEntries(
            [
              'circular-deps',
              'layer-violations',
              'complexity',
              'coupling',
              'forbidden-imports',
              'module-size',
              'dependency-depth',
            ].map((c) => [c, { value: 0, violationCount: 0 }])
          ) as any,
        },
        {
          capturedAt: '2026-03-15T00:00:00.000Z',
          commitHash: 'mid',
          stabilityScore: 85,
          metrics: Object.fromEntries(
            [
              'circular-deps',
              'layer-violations',
              'complexity',
              'coupling',
              'forbidden-imports',
              'module-size',
              'dependency-depth',
            ].map((c) => [c, { value: 0, violationCount: 0 }])
          ) as any,
        },
        {
          capturedAt: '2026-04-01T00:00:00.000Z',
          commitHash: 'new',
          stabilityScore: 90,
          metrics: Object.fromEntries(
            [
              'circular-deps',
              'layer-violations',
              'complexity',
              'coupling',
              'forbidden-imports',
              'module-size',
              'dependency-depth',
            ].map((c) => [c, { value: 0, violationCount: 0 }])
          ) as any,
        },
      ],
    };
    manager.save(timeline);

    const trend = manager.trends({ since: '2026-03-01' });
    expect(trend.snapshotCount).toBe(2);
    expect(trend.from).toBe('2026-03-15T00:00:00.000Z');
    expect(trend.to).toBe('2026-04-01T00:00:00.000Z');
  });

  it('computes per-category trends with inverted direction', () => {
    // First: high complexity
    const results1 = makeResults({ complexity: { value: 80, violationCount: 5 } });
    manager.capture(results1, 'aaa');

    // Second: lower complexity (improving for a violation category)
    const results2 = makeResults({ complexity: { value: 30, violationCount: 2 } });
    manager.capture(results2, 'bbb');

    const trend = manager.trends();
    expect(trend.categories['complexity']!.direction).toBe('improving');
    expect(trend.categories['complexity']!.delta).toBe(-50);
  });
});
```

2. Run: `npx vitest run packages/core/src/architecture/timeline-manager.test.ts`
3. Observe: all tests pass.
4. Run: `npx harness validate`
5. Commit: `test(arch): add unit tests for TimelineManager trends computation`

---

## Traceability

| Observable Truth                                        | Delivered by        |
| ------------------------------------------------------- | ------------------- | ------------- | ------ |
| OT1: timeline-types.ts exports types + schemas          | Task 1              |
| OT2: TimelineManager with all methods                   | Task 2              |
| OT3: index.ts re-exports                                | Task 3              |
| OT4: capture returns snapshot with 7 categories + score | Task 5              |
| OT5: deduplication on same commitHash                   | Task 5              |
| OT6: load returns empty when file missing               | Task 4              |
| OT7: atomic write                                       | Task 4              |
| OT8: trends with { last: N }                            | Task 6              |
| OT9: stability score 100 for zeros, proportional        | Task 4              |
| OT10:                                                   | delta               | < 2 is stable | Task 6 |
| OT11: vitest passes                                     | Task 6 (cumulative) |
| OT12: harness validate passes                           | All tasks           |
