#!/usr/bin/env node

/**
 * Benchmark regression gate.
 *
 * Usage:
 *   node scripts/benchmark-check.mjs          # Compare against baselines
 *   node scripts/benchmark-check.mjs --update  # Write current values as new baselines
 */

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const BASELINES_PATH = resolve(ROOT, 'benchmark-baselines.json');
// Threshold raised from 10% to 100%: benchmarks operate at microsecond scale
// (means in the 0.0001-0.01ms range), where shared GitHub Actions runner
// variance can easily produce 50-65% swings between runs. 100% still catches
// genuine 2x regressions while accommodating environment noise.
const THRESHOLD = 1.0; // 100% regression threshold

const PACKAGES = [
  { name: 'core', dir: resolve(ROOT, 'packages/core') },
  { name: 'graph', dir: resolve(ROOT, 'packages/graph') },
];

const isUpdate = process.argv.includes('--update');

/**
 * Merge freshly measured benchmarks onto the committed baselines, keeping the
 * existing entry for any benchmark whose mean moved less than the regression
 * threshold (runner noise).
 *
 * This is Fix A for the refresh-baselines race: `--update` used to rewrite every
 * mean/p99 on every run, so each push produced a diff of pure microsecond jitter.
 * Concurrent refresh PRs then edited the same lines from divergent bases and
 * conflicted — and auto-merge cannot resolve content conflicts. Gating the write
 * to genuine movement makes jitter-only runs byte-identical (no diff, no PR).
 *
 * - mean within threshold -> keep the committed entry verbatim (no churn)
 * - mean beyond threshold -> adopt the measured entry (real movement)
 * - new benchmark / zero or missing baseline mean -> adopt
 * - benchmark removed from code -> dropped (only fresh keys are written)
 */
export function mergeBenchmarkBaselines(existing = {}, fresh = {}, threshold = THRESHOLD) {
  const merged = {};
  for (const key of Object.keys(fresh)) {
    const prev = existing[key];
    const next = fresh[key];
    if (!prev || typeof prev.mean !== 'number' || prev.mean === 0) {
      merged[key] = next;
      continue;
    }
    const delta = Math.abs(next.mean - prev.mean) / prev.mean;
    merged[key] = delta <= threshold ? prev : next;
  }
  return merged;
}

/**
 * Run vitest bench for a package and return parsed JSON results.
 * Uses --outputJson to write structured output to a temp file.
 */
function runBenchmarks(pkg) {
  const outputFile = resolve(ROOT, `.bench-output-${pkg.name}.json`);
  try {
    execSync(`npx vitest bench --run --outputJson ${outputFile}`, {
      cwd: pkg.dir,
      stdio: 'pipe',
      timeout: 120_000,
    });
  } catch (err) {
    // vitest bench may exit non-zero on first run; check if output file exists
    try {
      readFileSync(outputFile);
    } catch {
      console.error(`Failed to run benchmarks for ${pkg.name}:`);
      console.error(err.stderr?.toString() || err.message);
      process.exit(1);
    }
  }

  const raw = readFileSync(outputFile, 'utf-8');
  // Clean up temp file
  try {
    unlinkSync(outputFile);
  } catch {
    /* ignore */
  }
  return JSON.parse(raw);
}

/**
 * Extract benchmark results from Vitest bench JSON output.
 * Returns a map of "package/suiteName - benchName" => { mean, p99 }.
 *
 * Vitest bench JSON structure (v4.x):
 * {
 *   files: [{
 *     filepath: string,
 *     groups: [{
 *       fullName: "file > SuiteName",
 *       benchmarks: [{ name, mean, p99, hz, ... }]
 *     }]
 *   }]
 * }
 */
function extractResults(packageName, json) {
  const results = {};

  const files = json.files || [];
  for (const file of files) {
    const groups = file.groups || [];
    for (const group of groups) {
      // fullName is like "benchmarks/validation.bench.ts > validateConfig"
      // Extract the suite name (last segment after " > ")
      const parts = (group.fullName || '').split(' > ');
      const suiteName = parts[parts.length - 1] || 'default';

      const benchmarks = group.benchmarks || [];
      for (const b of benchmarks) {
        const key = `${packageName}/${suiteName} - ${b.name}`;
        results[key] = {
          mean: b.mean ?? 0,
          p99: b.p99 ?? 0,
        };
      }
    }
  }

  return results;
}

/**
 * Main
 */
function main() {
  console.log('Running benchmarks...\n');

  const allResults = {};

  for (const pkg of PACKAGES) {
    console.log(`  Benchmarking ${pkg.name}...`);
    const json = runBenchmarks(pkg);
    const results = extractResults(pkg.name, json);
    Object.assign(allResults, results);
  }

  console.log(`\n  Found ${Object.keys(allResults).length} benchmarks.\n`);

  if (isUpdate) {
    let existing = {};
    try {
      existing = JSON.parse(readFileSync(BASELINES_PATH, 'utf-8'));
    } catch {
      /* first run -- no committed baselines yet */
    }
    const merged = mergeBenchmarkBaselines(existing, allResults);
    writeFileSync(BASELINES_PATH, JSON.stringify(merged, null, 2) + '\n');
    console.log(`Baselines updated: ${BASELINES_PATH}`);
    return;
  }

  // Compare against baselines
  let baselines;
  try {
    baselines = JSON.parse(readFileSync(BASELINES_PATH, 'utf-8'));
  } catch {
    console.error(
      'No baselines file found. Run with --update to create initial baselines.',
    );
    process.exit(1);
  }

  let regressions = 0;

  for (const [key, baseline] of Object.entries(baselines)) {
    const current = allResults[key];
    if (!current) {
      console.warn(
        `  WARN: Baseline "${key}" not found in current results (benchmark removed?)`,
      );
      continue;
    }

    // Skip comparison if baseline mean is 0 (initial placeholder)
    if (baseline.mean === 0) continue;

    const delta = (current.mean - baseline.mean) / baseline.mean;

    if (delta > THRESHOLD) {
      console.error(
        `  REGRESSION: "${key}" — mean ${baseline.mean.toFixed(4)}ms -> ${current.mean.toFixed(4)}ms (+${(delta * 100).toFixed(1)}%, threshold ${THRESHOLD * 100}%)`,
      );
      regressions++;
    } else {
      const sign = delta >= 0 ? '+' : '';
      console.log(`  OK: "${key}" — ${sign}${(delta * 100).toFixed(1)}%`);
    }
  }

  // Check for new benchmarks not in baselines
  for (const key of Object.keys(allResults)) {
    if (!baselines[key]) {
      console.warn(
        `  NEW: "${key}" — not in baselines (run --update to add)`,
      );
    }
  }

  if (regressions > 0) {
    console.error(
      `\n${regressions} benchmark(s) regressed. Run \`node scripts/benchmark-check.mjs --update\` to accept new baselines.`,
    );
    process.exit(1);
  }

  console.log('\nAll benchmarks within threshold.');
}

// Only run benchmarks when invoked directly, not when imported by tests.
const invokedDirectly =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main();
}
