#!/usr/bin/env node

/**
 * Coverage ratchet -- ensures coverage never drops below recorded baselines.
 *
 * Usage:
 *   node scripts/coverage-ratchet.mjs          # check mode (CI)
 *   node scripts/coverage-ratchet.mjs --update  # update baselines
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const BASELINES_PATH = join(ROOT, 'coverage-baselines.json');
const METRICS = ['lines', 'branches', 'functions', 'statements'];

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

function check() {
  const baselines = loadBaselines();
  let failures = 0;

  for (const pkgKey of Object.keys(PACKAGES)) {
    const baseline = baselines[pkgKey];
    if (!baseline) {
      console.warn(`  Warning: no baseline for ${pkgKey} -- skipping`);
      continue;
    }

    const actual = readCoverage(pkgKey);
    if (!actual) {
      console.error(
        `  FAIL: ${pkgKey} has baseline but no coverage data (missing or unreadable coverage-summary.json)`
      );
      failures++;
      continue;
    }

    for (const metric of METRICS) {
      const baselineVal = baseline[metric];
      const actualVal = actual[metric];
      if (actualVal < baselineVal) {
        console.error(
          `  FAIL: ${pkgKey} ${metric} dropped from ${baselineVal}% to ${actualVal}%`
        );
        failures++;
      }
    }
  }

  if (failures > 0) {
    console.error(`\n${failures} coverage regression(s) detected.`);
    console.error('If coverage intentionally decreased, run: node scripts/coverage-ratchet.mjs --update');
    process.exit(1);
  }

  console.log('Coverage ratchet: all packages meet or exceed baselines.');
}

function update() {
  const result = {};

  for (const pkgKey of Object.keys(PACKAGES)) {
    const actual = readCoverage(pkgKey);
    if (!actual) {
      console.warn(`  Skipping ${pkgKey} (no meaningful coverage data)`);
      continue;
    }
    result[pkgKey] = actual;
    console.log(`  ${pkgKey}: lines=${actual.lines}% branches=${actual.branches}% functions=${actual.functions}% statements=${actual.statements}%`);
  }

  writeFileSync(BASELINES_PATH, JSON.stringify(result, null, 2) + '\n');
  console.log(`\nBaselines written to ${BASELINES_PATH}`);
}

// --- main ---
const args = process.argv.slice(2);
if (args.includes('--update')) {
  console.log('Updating coverage baselines...\n');
  update();
} else {
  console.log('Checking coverage against baselines...\n');
  check();
}
