# Plan: Phase 2 -- Coverage Ratchet

**Date:** 2026-03-28
**Spec:** docs/changes/ci-pipeline-hardening/proposal.md
**Estimated tasks:** 5
**Estimated time:** 20 minutes

## Goal

CI fails if any package's coverage drops below its recorded baseline, enforced by a checked-in `coverage-baselines.json` and a `scripts/coverage-ratchet.mjs` script wired into GitHub Actions.

## Observable Truths (Acceptance Criteria)

1. When `node scripts/coverage-ratchet.mjs` is run after `pnpm test:ci`, the system shall exit 0 if all packages meet or exceed their baselines.
2. When any package's lines, branches, functions, or statements coverage drops below its baseline, `node scripts/coverage-ratchet.mjs` shall exit 1 with a message naming the package, metric, baseline, and actual value.
3. When `node scripts/coverage-ratchet.mjs --update` is run after `pnpm test:ci`, the system shall write current coverage percentages to `coverage-baselines.json` and exit 0.
4. The `coverage-baselines.json` file shall contain entries for all 7 packages that produce meaningful coverage (`packages/core`, `packages/graph`, `packages/cli`, `packages/orchestrator`, `packages/eslint-plugin`, `packages/linter-gen`, `packages/types`).
5. When a package reports `"Unknown"` for a metric percentage (zero total lines, e.g., `agents/skills`), the system shall skip that package rather than fail.
6. The CI workflow shall run `pnpm test:ci` (instead of `pnpm test`) on `ubuntu-latest` so coverage files exist for the ratchet check.
7. The CI workflow shall run the ratchet check only on `ubuntu-latest` (not on Windows or macOS).
8. If the ratchet check step is removed from CI, existing behavior (3-OS matrix, typecheck, lint, format) shall not be affected.

## File Map

- CREATE `scripts/coverage-ratchet.mjs`
- CREATE `coverage-baselines.json`
- MODIFY `.github/workflows/ci.yml` (switch test step to `test:ci` on ubuntu, add ratchet check step)

## Tasks

### Task 1: Create `scripts/coverage-ratchet.mjs`

**Depends on:** none (Phase 1 must be complete -- already confirmed)
**Files:** `scripts/coverage-ratchet.mjs`

1. Create `scripts/coverage-ratchet.mjs` with the following exact content:

```javascript
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
      continue;
    }

    for (const metric of METRICS) {
      const baselineVal = baseline[metric];
      const actualVal = actual[metric];
      if (actualVal < baselineVal) {
        console.error(`  FAIL: ${pkgKey} ${metric} dropped from ${baselineVal}% to ${actualVal}%`);
        failures++;
      }
    }
  }

  if (failures > 0) {
    console.error(`\n${failures} coverage regression(s) detected.`);
    console.error(
      'If coverage intentionally decreased, run: node scripts/coverage-ratchet.mjs --update'
    );
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
    console.log(
      `  ${pkgKey}: lines=${actual.lines}% branches=${actual.branches}% functions=${actual.functions}% statements=${actual.statements}%`
    );
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
```

2. Run: `node scripts/coverage-ratchet.mjs --update`
3. Observe: script creates `coverage-baselines.json` with actual values for all 7 packages, skips `agents/skills` (not in PACKAGES list).
4. Run: `node scripts/coverage-ratchet.mjs`
5. Observe: exit 0 with "all packages meet or exceed baselines."
6. Run: `npx harness validate`
7. Commit: `ci(coverage): add coverage-ratchet.mjs script`

### Task 2: Capture initial `coverage-baselines.json`

**Depends on:** Task 1
**Files:** `coverage-baselines.json`

1. Verify `coverage-baselines.json` was created by Task 1's `--update` run. It should contain:

```json
{
  "packages/core": { "lines": 91.57, "branches": 74.94, "functions": 93.89, "statements": 89.72 },
  "packages/graph": { "lines": 96.62, "branches": 81.25, "functions": 96.33, "statements": 95.53 },
  "packages/cli": { "lines": 62.85, "branches": 49.51, "functions": 67.43, "statements": 62.24 },
  "packages/orchestrator": {
    "lines": 76.37,
    "branches": 64.59,
    "functions": 71.87,
    "statements": 74.72
  },
  "packages/eslint-plugin": {
    "lines": 94.87,
    "branches": 86.37,
    "functions": 98.7,
    "statements": 92.54
  },
  "packages/linter-gen": {
    "lines": 89.23,
    "branches": 79.54,
    "functions": 100,
    "statements": 89.92
  },
  "packages/types": { "lines": 100, "branches": 100, "functions": 100, "statements": 100 }
}
```

(Exact values may differ slightly if tests ran differently; the important thing is all 7 packages are present with numeric percentages.)

2. Verify: `node scripts/coverage-ratchet.mjs` exits 0.
3. Run: `npx harness validate`
4. Commit: `ci(coverage): capture initial coverage baselines`

### Task 3: Wire ratchet into CI workflow

**Depends on:** Task 2
**Files:** `.github/workflows/ci.yml`

1. In `.github/workflows/ci.yml`, replace the test step and add the ratchet check. Change:

```yaml
- run: pnpm test

- run: pnpm test:platform-parity
```

to:

```yaml
- name: Test (with coverage on ubuntu)
  run: ${{ matrix.os == 'ubuntu-latest' && 'pnpm test:ci' || 'pnpm test' }}

- name: Coverage ratchet check
  if: matrix.os == 'ubuntu-latest'
  run: node scripts/coverage-ratchet.mjs

- run: pnpm test:platform-parity
```

This uses a ternary expression so ubuntu runs `pnpm test:ci` (which produces coverage files) while Windows/macOS run plain `pnpm test` (faster, no coverage overhead).

2. Review the full file to confirm no other changes are needed.
3. Run: `npx harness validate`
4. Commit: `ci(coverage): wire coverage ratchet check into CI workflow`

### Task 4: Verify ratchet catches regressions (manual test)

**Depends on:** Task 3
**Files:** none (verification only)

[checkpoint:human-verify]

1. Manually edit `coverage-baselines.json` to set `packages/core` lines to `99.99` (artificially high).
2. Run: `node scripts/coverage-ratchet.mjs`
3. Observe: exit 1 with message `FAIL: packages/core lines dropped from 99.99% to 91.57%`
4. Revert `coverage-baselines.json`: `git checkout coverage-baselines.json`
5. Run: `node scripts/coverage-ratchet.mjs`
6. Observe: exit 0 with "all packages meet or exceed baselines."

### Task 5: Verify `--update` captures improvements

**Depends on:** Task 4
**Files:** none (verification only)

1. Run: `node scripts/coverage-ratchet.mjs --update`
2. Observe: baselines written, values match current coverage.
3. Run: `node scripts/coverage-ratchet.mjs`
4. Observe: exit 0.
5. Run: `npx harness validate`
6. Final state: `coverage-baselines.json` is committed with real values, `scripts/coverage-ratchet.mjs` is committed, CI workflow is updated.

## Traceability

| Observable Truth                                | Delivered by                           |
| ----------------------------------------------- | -------------------------------------- |
| OT1: ratchet exits 0 when baselines met         | Task 1 (script), Task 2 (baselines)    |
| OT2: ratchet exits 1 with details on regression | Task 1 (script), Task 4 (verification) |
| OT3: `--update` writes current values           | Task 1 (script), Task 5 (verification) |
| OT4: baselines for all 7 packages               | Task 2                                 |
| OT5: "Unknown" pct skipped gracefully           | Task 1 (null return on Unknown)        |
| OT6: CI runs test:ci on ubuntu                  | Task 3                                 |
| OT7: ratchet only on ubuntu                     | Task 3                                 |
| OT8: existing CI behavior preserved             | Task 3                                 |
