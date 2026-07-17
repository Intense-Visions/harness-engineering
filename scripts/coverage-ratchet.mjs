#!/usr/bin/env node

/**
 * Coverage ratchet -- ensures coverage never drops below recorded baselines.
 *
 * Usage:
 *   node scripts/coverage-ratchet.mjs                  # check mode (CI, full/authoritative)
 *   node scripts/coverage-ratchet.mjs --allow-missing  # check mode, skip packages with no fresh coverage (pre-push)
 *   node scripts/coverage-ratchet.mjs --update          # update baselines
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(import.meta.dirname, '..');
const BASELINES_PATH = join(ROOT, 'coverage-baselines.json');
const METRICS = ['lines', 'branches', 'functions', 'statements'];

/**
 * V8 code coverage is non-deterministic — identical code can produce slightly
 * different branch/line percentages across runs due to JIT optimization
 * decisions, inline caching, and GC timing. A tolerance of 0.5% absorbs
 * this noise while still catching real regressions.
 *
 * See: commit 08d52ae4 ("fix(ci): lower coverage baselines to absorb CI V8 variance")
 */
const V8_VARIANCE_TOLERANCE = 0.5;

// All workspace locations that produce coverage-summary.json.
// The key is the baselines.json key; the value is the path to coverage-summary.json.
const PACKAGES = {
  'packages/core': 'packages/core/coverage/coverage-summary.json',
  'packages/graph': 'packages/graph/coverage/coverage-summary.json',
  'packages/cli': 'packages/cli/coverage/coverage-summary.json',
  'packages/orchestrator': 'packages/orchestrator/coverage/coverage-summary.json',
  'packages/eslint-plugin': 'packages/eslint-plugin/coverage/coverage-summary.json',
  'packages/linter-gen': 'packages/linter-gen/coverage/coverage-summary.json',
  'packages/types': 'packages/types/coverage/coverage-summary.json',
};

function readCoverage(pkgKey) {
  const absPath = join(ROOT, PACKAGES[pkgKey]);
  try {
    const data = JSON.parse(readFileSync(absPath, 'utf8'));
    const total = data.total;
    const result = {};
    for (const metric of METRICS) {
      const pct = total[metric]?.pct;
      // Skip packages that report "Unknown" (zero instrumented lines)
      if (pct === 'Unknown' || typeof pct !== 'number') {
        return null;
      }
      result[metric] = pct;
    }
    return result;
  } catch {
    console.warn(`  Warning: could not read coverage for ${pkgKey} -- skipping`);
    return null;
  }
}

function loadBaselines() {
  try {
    return JSON.parse(readFileSync(BASELINES_PATH, 'utf8'));
  } catch {
    console.error(`Error: could not read ${BASELINES_PATH}`);
    console.error('Run with --update to create initial baselines.');
    process.exit(1);
  }
}

/**
 * Pure coverage evaluation. Compares a map of already-read coverage results
 * against baselines and reports failures. When `allowMissing` is set, a
 * baselined package with no coverage data (null) is SKIPPED instead of failed
 * — this is the pre-push partial mode, where `turbo --affected` deliberately
 * skips unchanged packages. CI never sets `allowMissing`, so its ratchet stays
 * whole-repo authoritative.
 *
 * @param {Record<string, object>} baselines
 * @param {Record<string, object|null>} coverageByPkg  pkgKey -> coverage result or null
 * @param {{ allowMissing?: boolean }} opts
 * @returns {{ failures: number, skipped: string[] }}
 */
export function evaluateCoverage(baselines, coverageByPkg, { allowMissing = false } = {}) {
  let failures = 0;
  const skipped = [];

  for (const pkgKey of Object.keys(coverageByPkg)) {
    const baseline = baselines[pkgKey];
    if (!baseline) {
      console.warn(`  Warning: no baseline for ${pkgKey} -- skipping`);
      continue;
    }

    const actual = coverageByPkg[pkgKey];
    if (!actual) {
      if (allowMissing) {
        console.log(`  Skipping ${pkgKey}: no fresh coverage this run (--allow-missing).`);
        skipped.push(pkgKey);
        continue;
      }
      console.error(
        `  FAIL: ${pkgKey} has baseline but no coverage data (missing or unreadable coverage-summary.json)`
      );
      failures++;
      continue;
    }

    for (const metric of METRICS) {
      const baselineVal = baseline[metric];
      const actualVal = actual[metric];
      if (actualVal < baselineVal - V8_VARIANCE_TOLERANCE) {
        console.error(
          `  FAIL: ${pkgKey} ${metric} dropped from ${baselineVal}% to ${actualVal}% (tolerance: ${V8_VARIANCE_TOLERANCE}%)`
        );
        failures++;
      }
    }
  }

  return { failures, skipped };
}

function check({ allowMissing = false } = {}) {
  const baselines = loadBaselines();
  const coverageByPkg = {};
  for (const pkgKey of Object.keys(PACKAGES)) {
    coverageByPkg[pkgKey] = readCoverage(pkgKey);
  }

  const { failures, skipped } = evaluateCoverage(baselines, coverageByPkg, { allowMissing });

  if (failures > 0) {
    console.error(`\n${failures} coverage regression(s) detected.`);
    console.error('If coverage intentionally decreased, run: node scripts/coverage-ratchet.mjs --update');
    process.exit(1);
  }

  const note = skipped.length ? ` (${skipped.length} package(s) skipped: no fresh coverage)` : '';
  console.log(`Coverage ratchet: all packages meet or exceed baselines.${note}`);
}

/**
 * Merge freshly measured coverage onto the committed baselines, keeping the
 * existing value for any metric whose change is within V8 noise tolerance.
 *
 * This is the heart of Fix A for the refresh-baselines race: `--update` used to
 * rewrite the file with raw measurements every run, so each push produced a diff
 * of pure jitter. When several pushes landed close together, their refresh PRs
 * edited the same lines from divergent bases and conflicted — auto-merge cannot
 * resolve content conflicts, so the losers sat open forever. Gating the write to
 * meaningful movement makes jitter-only runs byte-identical (no diff, no PR).
 *
 * - within tolerance  -> keep the committed value (no churn)
 * - beyond tolerance  -> adopt the measured value (real movement)
 * - new package       -> adopt
 * - package missing this run -> keep the committed value (transient gap, no churn)
 */
export function mergeCoverageBaselines(existing = {}, fresh = {}, tolerance = V8_VARIANCE_TOLERANCE) {
  const merged = {};
  const keys = [
    ...Object.keys(existing),
    ...Object.keys(fresh).filter((k) => !(k in existing)),
  ];

  for (const pkgKey of keys) {
    const prev = existing[pkgKey];
    const next = fresh[pkgKey];
    if (!next) {
      merged[pkgKey] = prev; // no coverage data this run -> preserve committed
      continue;
    }
    if (!prev) {
      merged[pkgKey] = next; // brand-new package
      continue;
    }
    const out = {};
    for (const metric of METRICS) {
      const a = next[metric];
      const b = prev[metric];
      out[metric] =
        typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) <= tolerance
          ? b
          : a;
    }
    merged[pkgKey] = out;
  }

  return merged;
}

function update() {
  const fresh = {};

  for (const pkgKey of Object.keys(PACKAGES)) {
    const actual = readCoverage(pkgKey);
    if (!actual) {
      console.warn(`  Skipping ${pkgKey} (no meaningful coverage data)`);
      continue;
    }
    fresh[pkgKey] = actual;
  }

  let existing = {};
  try {
    existing = JSON.parse(readFileSync(BASELINES_PATH, 'utf8'));
  } catch {
    /* first run -- no committed baselines yet */
  }

  const merged = mergeCoverageBaselines(existing, fresh);
  for (const pkgKey of Object.keys(merged)) {
    const m = merged[pkgKey];
    console.log(`  ${pkgKey}: lines=${m.lines}% branches=${m.branches}% functions=${m.functions}% statements=${m.statements}%`);
  }

  writeFileSync(BASELINES_PATH, JSON.stringify(merged, null, 2) + '\n');
  console.log(`\nBaselines written to ${BASELINES_PATH}`);
}

// --- main (only when invoked directly, not when imported by tests) ---
const invokedDirectly =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  const args = process.argv.slice(2);
  if (args.includes('--update')) {
    console.log('Updating coverage baselines...\n');
    update();
  } else {
    const allowMissing = args.includes('--allow-missing');
    console.log(`Checking coverage against baselines${allowMissing ? ' (partial mode)' : ''}...\n`);
    check({ allowMissing });
  }
}
