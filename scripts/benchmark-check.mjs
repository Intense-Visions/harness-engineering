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
const THRESHOLD = 0.1; // 10% regression threshold

const PACKAGES = [
  { name: 'core', dir: resolve(ROOT, 'packages/core') },
  { name: 'graph', dir: resolve(ROOT, 'packages/graph') },
];

const isUpdate = process.argv.includes('--update');

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
    writeFileSync(BASELINES_PATH, JSON.stringify(allResults, null, 2) + '\n');
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

main();
