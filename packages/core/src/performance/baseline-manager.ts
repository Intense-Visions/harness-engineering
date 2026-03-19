import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import type { BaselinesFile, BenchmarkResult, Baseline } from './types';

/**
 * Manages performance baselines stored on disk.
 *
 * Baselines are stored at `.harness/perf/baselines.json` relative to the project root.
 * Each benchmark is keyed by `${file}::${name}`.
 */
export class BaselineManager {
  private readonly baselinesPath: string;

  constructor(projectRoot: string) {
    this.baselinesPath = join(projectRoot, '.harness', 'perf', 'baselines.json');
  }

  /**
   * Load the baselines file from disk.
   * Returns null if the file does not exist or contains invalid JSON.
   */
  load(): BaselinesFile | null {
    if (!existsSync(this.baselinesPath)) {
      return null;
    }
    try {
      const raw = readFileSync(this.baselinesPath, 'utf-8');
      return JSON.parse(raw) as BaselinesFile;
    } catch {
      return null;
    }
  }

  /**
   * Save benchmark results to disk, merging with any existing baselines.
   * Each result is keyed by `${file}::${name}`.
   */
  save(results: BenchmarkResult[], commitHash: string): void {
    const existing = this.load();
    const now = new Date().toISOString();

    const benchmarks: Record<string, Baseline> = existing?.benchmarks
      ? { ...existing.benchmarks }
      : {};

    for (const result of results) {
      const key = `${result.file}::${result.name}`;
      benchmarks[key] = {
        opsPerSec: result.opsPerSec,
        meanMs: result.meanMs,
        p99Ms: result.p99Ms,
        marginOfError: result.marginOfError,
      };
    }

    const file: BaselinesFile = {
      version: 1,
      updatedAt: now,
      updatedFrom: commitHash,
      benchmarks,
    };

    const dir = dirname(this.baselinesPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(this.baselinesPath, JSON.stringify(file, null, 2));
  }

  /**
   * Remove baselines whose file prefix does not match any of the given bench files.
   * This cleans up entries for deleted benchmark files.
   */
  prune(existingBenchFiles: string[]): void {
    const existing = this.load();
    if (!existing) {
      return;
    }

    const fileSet = new Set(existingBenchFiles);
    const pruned: Record<string, Baseline> = {};

    for (const [key, baseline] of Object.entries(existing.benchmarks)) {
      const filePrefix = key.split('::')[0]!;
      if (fileSet.has(filePrefix)) {
        pruned[key] = baseline;
      }
    }

    existing.benchmarks = pruned;
    writeFileSync(this.baselinesPath, JSON.stringify(existing, null, 2));
  }
}
