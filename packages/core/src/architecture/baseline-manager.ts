import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { join, dirname } from 'node:path';
import { ArchBaselineSchema } from './types';
import type { ArchBaseline, MetricResult, CategoryBaseline } from './types';

/**
 * Deep-equality for two baseline metric maps, treating each category's
 * `violationIds` as a set (order-insensitive) so a reordering alone does not
 * count as a change. Used to decide whether a baseline refresh actually moved
 * any metric — if not, the volatile stamps are preserved to keep the file
 * byte-stable.
 */
function metricsEqual(
  a: Record<string, CategoryBaseline>,
  b: Record<string, CategoryBaseline>
): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    const ca = a[key];
    const cb = b[key];
    if (!ca || !cb) return false;
    if (ca.value !== cb.value) return false;
    if (ca.violationIds.length !== cb.violationIds.length) return false;
    const setA = new Set(ca.violationIds);
    for (const id of cb.violationIds) {
      if (!setA.has(id)) return false;
    }
  }
  return true;
}

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

    // Deduplicate and sort violationIds per category. Sorting makes the stored
    // order a deterministic function of the set (not of collection order), so
    // an unchanged set always serializes to identical bytes — a prerequisite
    // for the byte-stable no-op regen below.
    for (const baseline of Object.values(metrics)) {
      baseline.violationIds = [...new Set(baseline.violationIds)].sort();
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
      console.error(`Baseline file not found at: ${this.baselinesPath}`);
      return null;
    }
    try {
      const raw = readFileSync(this.baselinesPath, 'utf-8');
      const data = JSON.parse(raw);
      const parsed = ArchBaselineSchema.safeParse(data);
      if (!parsed.success) {
        console.error(
          `Baseline validation failed for ${this.baselinesPath}:`,
          parsed.error.format()
        );
        return null;
      }
      return parsed.data;
    } catch (error) {
      console.error(`Error loading baseline from ${this.baselinesPath}:`, error);
      return null;
    }
  }

  /**
   * Refresh the on-disk baseline with new results.
   *
   * Categories present in `results` overwrite their on-disk entry; categories
   * absent from `results` are preserved as-is. This prevents silent data loss
   * when a collector returns no results (e.g. transient failure or a filtered
   * run) and the regenerated file is committed (issue #268).
   *
   * Use this from the `--update-baseline` flow instead of `capture()` + `save()`.
   */
  update(results: MetricResult[], commitHash: string): ArchBaseline {
    const fresh = this.capture(results, commitHash);
    const existing = this.load();
    if (existing) {
      fresh.metrics = { ...existing.metrics, ...fresh.metrics };
      // Keep the committed file a pure function of the metrics: only bump the
      // volatile `updatedAt`/`updatedFrom` stamps when the metrics actually
      // changed. A no-op regen then produces a byte-identical file, so PRs that
      // don't move any metric never touch baselines.json — which stops the
      // spurious merge-conflict churn on this generated file (the `merge=ours`
      // attribute only resolves LOCAL merges; GitHub's server-side merge cannot
      // run it, so any diff here shows as a conflict there).
      if (metricsEqual(existing.metrics, fresh.metrics)) {
        fresh.updatedAt = existing.updatedAt;
        fresh.updatedFrom = existing.updatedFrom;
      }
    }
    this.save(fresh);
    return fresh;
  }

  /**
   * Save an ArchBaseline to disk.
   * Creates parent directories if they do not exist.
   * Uses atomic write (write to temp file, then rename) to prevent corruption.
   */
  save(baseline: ArchBaseline): void {
    const dir = dirname(this.baselinesPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    const tmp = this.baselinesPath + '.' + randomBytes(4).toString('hex') + '.tmp';
    writeFileSync(tmp, JSON.stringify(baseline, null, 2));
    renameSync(tmp, this.baselinesPath);
  }
}
