import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { ArchBaselineSchema } from './types';
import type { ArchBaseline, MetricResult, CategoryBaseline } from './types';

/**
 * Manages architecture baselines stored on disk.
 *
 * Baselines are stored at `.harness/arch/baselines.json` relative to the project root.
 * Each category maps to an aggregate value and an allowlist of known violation IDs.
 */
export class ArchBaselineManager {
  private readonly baselinesPath: string;

  constructor(projectRoot: string, baselinePath?: string) {
    this.baselinesPath = baselinePath
      ? join(projectRoot, baselinePath)
      : join(projectRoot, '.harness', 'arch', 'baselines.json');
  }

  /**
   * Snapshot the current metric results into an ArchBaseline.
   * Aggregates multiple MetricResults for the same category by summing values
   * and concatenating violation IDs.
   */
  capture(results: MetricResult[], commitHash: string): ArchBaseline {
    const metrics: Record<string, CategoryBaseline> = {};

    for (const result of results) {
      const existing = metrics[result.category];
      if (existing) {
        existing.value += result.value;
        existing.violationIds.push(...result.violations.map((v) => v.id));
      } else {
        metrics[result.category] = {
          value: result.value,
          violationIds: result.violations.map((v) => v.id),
        };
      }
    }

    return {
      version: 1,
      updatedAt: new Date().toISOString(),
      updatedFrom: commitHash,
      metrics,
    };
  }

  /**
   * Load the baselines file from disk.
   * Returns null if the file does not exist, contains invalid JSON,
   * or fails ArchBaselineSchema validation.
   */
  load(): ArchBaseline | null {
    if (!existsSync(this.baselinesPath)) {
      return null;
    }
    try {
      const raw = readFileSync(this.baselinesPath, 'utf-8');
      const data = JSON.parse(raw);
      const parsed = ArchBaselineSchema.safeParse(data);
      if (!parsed.success) {
        return null;
      }
      return parsed.data;
    } catch {
      return null;
    }
  }

  /**
   * Save an ArchBaseline to disk.
   * Creates parent directories if they do not exist.
   */
  save(baseline: ArchBaseline): void {
    const dir = dirname(this.baselinesPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(this.baselinesPath, JSON.stringify(baseline, null, 2));
  }
}
