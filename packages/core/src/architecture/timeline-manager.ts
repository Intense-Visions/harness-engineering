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
