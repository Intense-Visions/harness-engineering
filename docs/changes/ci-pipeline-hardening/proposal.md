# CI Pipeline Hardening

**Keywords:** ci, coverage, codecov, benchmarks, vitest-bench, regression-gate, smoke-test, ratchet, baselines, post-publish

## Overview

Harness enforces coverage thresholds, performance budgets, and build quality on user projects — but doesn't fully practice these standards on itself. Only 2 of 7 packages enforce coverage thresholds, there is no benchmark infrastructure, no coverage dashboard, and no post-publish verification. This spec closes that gap with four incremental CI layers: Codecov integration, ratchet-only coverage baselines for all packages, Vitest benchmarks with regression gates for core and graph, and a post-publish smoke test.

## Goals

1. **Coverage visibility** — every PR shows coverage diff via Codecov; public dashboard tracks trends over time
2. **Never-regress coverage** — CI fails if any package's coverage drops below its recorded baseline
3. **Performance regression detection** — CI fails if core validation or graph query benchmarks regress more than 10% from baseline
4. **Publish integrity** — automated verification that published npm packages install correctly and expose expected exports

## Non-Goals

- Absolute coverage targets (ratchet up naturally, no arbitrary 80% mandate on all packages)
- CLI-level end-to-end benchmarks (too noisy for reliable CI gates)
- SBOM generation (npm provenance already handles attestation)
- Hosting a custom coverage dashboard (Codecov handles this)

## Decisions

| #   | Decision                                                                     | Rationale                                                                                                                                                                                       |
| --- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | **Codecov for coverage dashboards** (not self-hosted)                        | Free for OSS, PR-level diff coverage, branch protection integration, zero maintenance. Industry standard that users can recognize when referencing harness's own CI.                            |
| D2  | **Ratchet-only coverage** (not uniform thresholds)                           | Fastest to ship — captures current baselines, enforces "never go backwards." No test backfill required to enable. Avoids arbitrary targets that don't reflect package maturity.                 |
| D3  | **Vitest bench API for benchmarks** (not hyperfine or custom)                | Already in the project's test stack. Built-in statistical analysis. Co-located with test files. No new tooling dependency.                                                                      |
| D4  | **Benchmark core validation + graph queries** (not CLI commands)             | These two subsystems are performance-sensitive. CLI benchmarks are too noisy (process startup variance). Core and graph cover the hot paths users actually feel.                                |
| D5  | **10% regression threshold**                                                 | Tight enough to catch real regressions, loose enough to absorb statistical noise from Vitest bench. Adjustable per-benchmark if needed.                                                         |
| D6  | **Checked-in JSON baseline files** (not Turbo cache or harness perf system)  | Explicit, reviewable, diffable. No coupling to Turbo internals or bootstrap risk from self-hosting enforcement. Developers see exactly what the baseline is in the PR diff when they update it. |
| D7  | **Separate workflow jobs per concern** (not unified Turbo pipeline)          | Each concern is independently debuggable, skippable, and understandable. Standard GitHub Actions patterns that users can copy.                                                                  |
| D8  | **Post-publish smoke test: install + import + version** (not full init flow) | Catches the most common publish failures (missing dist files, broken bin links, bad exports) with minimal CI time. Init-level smoke test is a future enhancement.                               |

## Technical Design

### Codecov Integration

**Modified file:** `.github/workflows/ci.yml` — add coverage upload step

After the existing `test` step in the CI matrix, add a coverage upload step on `ubuntu-latest` only (avoid duplicate uploads from Windows/macOS):

```yaml
- name: Upload coverage to Codecov
  if: matrix.os == 'ubuntu-latest'
  uses: codecov/codecov-action@v4
  with:
    files: packages/core/coverage/coverage-final.json,packages/graph/coverage/coverage-final.json,packages/cli/coverage/coverage-final.json,packages/eslint-plugin/coverage/coverage-final.json,packages/linter-gen/coverage/coverage-final.json,packages/orchestrator/coverage/coverage-final.json,packages/types/coverage/coverage-final.json
    flags: unittests
    fail_ci_if_error: false
  env:
    CODECOV_TOKEN: ${{ secrets.CODECOV_TOKEN }}
```

**New file:** `codecov.yml` (repo root)

```yaml
coverage:
  status:
    project:
      default:
        target: auto
        threshold: 1%
    patch:
      default:
        target: 80%
  flags:
    unittests:
      paths:
        - packages/
```

**CI test script change:** Add a `test:ci` root script (`turbo run test:coverage`) used in CI only. Local `pnpm test` stays fast without coverage overhead. Packages that lack a `test:coverage` script get one added.

### Coverage Ratchet

**New file:** `scripts/coverage-ratchet.mjs`

Node script that:

1. Reads `coverage-baselines.json` from repo root
2. For each package, reads `packages/<name>/coverage/coverage-summary.json`
3. Compares actual lines/branches/functions/statements against baselines
4. Fails (exit 1) if any metric drops below baseline
5. When run with `--update` flag, writes current values as new baselines

**New file:** `coverage-baselines.json` (repo root)

```json
{
  "packages/core": { "lines": 0, "branches": 0, "functions": 0, "statements": 0 },
  "packages/graph": { "lines": 0, "branches": 0, "functions": 0, "statements": 0 },
  "packages/cli": { "lines": 0, "branches": 0, "functions": 0, "statements": 0 },
  "packages/orchestrator": { "lines": 0, "branches": 0, "functions": 0, "statements": 0 },
  "packages/eslint-plugin": { "lines": 0, "branches": 0, "functions": 0, "statements": 0 },
  "packages/linter-gen": { "lines": 0, "branches": 0, "functions": 0, "statements": 0 },
  "packages/types": { "lines": 0, "branches": 0, "functions": 0, "statements": 0 }
}
```

Values are placeholders — actual baselines captured on first `--update` run.

**CI integration:** New step after `test:ci` in the CI workflow:

```yaml
- name: Coverage ratchet check
  if: matrix.os == 'ubuntu-latest'
  run: node scripts/coverage-ratchet.mjs
```

**Developer workflow:** When coverage improves, run `node scripts/coverage-ratchet.mjs --update` and commit the updated baselines. PR diff shows the baseline change explicitly.

### Benchmark Infrastructure

**New files:**

- `packages/core/benchmarks/validation.bench.ts` — benchmarks for `validateConfig`, `validateProject`, schema validation
- `packages/graph/benchmarks/queries.bench.ts` — benchmarks for ContextQL queries, `getImpact`, ingestion pipelines

Using Vitest bench API:

```typescript
import { bench, describe } from 'vitest';

describe('schema validation', () => {
  bench('validateConfig - valid config', () => {
    validateConfig(validConfigFixture);
  });

  bench('validateProject - full project', () => {
    validateProject(projectFixture);
  });
});
```

**New file:** `benchmark-baselines.json` (repo root)

```json
{
  "core/validateConfig - valid config": { "mean": 0, "p99": 0 },
  "core/validateProject - full project": { "mean": 0, "p99": 0 },
  "graph/contextql - simple query": { "mean": 0, "p99": 0 },
  "graph/getImpact - single file": { "mean": 0, "p99": 0 }
}
```

Values are placeholders — actual baselines captured on first `--update` run.

**New file:** `scripts/benchmark-check.mjs`

Node script that:

1. Runs `vitest bench --reporter=json` for core and graph packages
2. Parses JSON output, extracts mean and p99 for each benchmark
3. Compares against `benchmark-baselines.json`
4. Fails if any benchmark's mean regresses more than 10%
5. `--update` flag writes current values as new baselines

**New file:** `.github/workflows/benchmark.yml`

```yaml
name: Benchmarks
on:
  pull_request:
    branches: [main]

jobs:
  bench:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install
      - run: pnpm build
      - run: node scripts/benchmark-check.mjs
```

**Package.json additions:**

- `packages/core/package.json`: `"bench": "vitest bench"`
- `packages/graph/package.json`: `"bench": "vitest bench"`
- Root: `"bench": "turbo run bench"`

**Turbo addition:** Add `bench` task to `turbo.json` pipeline:

```json
"bench": {
  "dependsOn": ["build"],
  "outputs": []
}
```

### Post-Publish Smoke Test

**New file:** `.github/workflows/smoke-test.yml`

Triggered by completion of the release workflow:

```yaml
name: Post-Publish Smoke Test
on:
  workflow_run:
    workflows: [Release]
    types: [completed]
    branches: [main]

jobs:
  smoke:
    if: ${{ github.event.workflow_run.conclusion == 'success' }}
    runs-on: ubuntu-latest
    steps:
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - name: Wait for npm CDN propagation
        run: sleep 30
      - name: Install published CLI
        run: npm install -g @harness-engineering/cli
      - name: Verify CLI runs
        run: harness --version
      - name: Verify core exports
        run: |
          mkdir /tmp/smoke && cd /tmp/smoke
          npm init -y
          npm install @harness-engineering/core @harness-engineering/types
          node -e "const c = require('@harness-engineering/core'); console.log('core OK:', typeof c.validateProject)"
          node -e "const t = require('@harness-engineering/types'); console.log('types OK:', Object.keys(t).length > 0)"
```

Uses `workflow_run` trigger so it runs after publish completes, not during. Installs from the live npm registry, verifying what users actually get.

### File Summary

| File                                           | Action | Purpose                                     |
| ---------------------------------------------- | ------ | ------------------------------------------- |
| `.github/workflows/ci.yml`                     | Modify | Add Codecov upload, switch to `test:ci`     |
| `codecov.yml`                                  | Create | Codecov configuration                       |
| `scripts/coverage-ratchet.mjs`                 | Create | Baseline comparison and ratchet enforcement |
| `coverage-baselines.json`                      | Create | Checked-in coverage baselines per package   |
| `packages/core/benchmarks/validation.bench.ts` | Create | Core validation benchmarks                  |
| `packages/graph/benchmarks/queries.bench.ts`   | Create | Graph query benchmarks                      |
| `scripts/benchmark-check.mjs`                  | Create | Benchmark comparison and regression gate    |
| `benchmark-baselines.json`                     | Create | Checked-in benchmark baselines              |
| `.github/workflows/benchmark.yml`              | Create | Benchmark CI workflow                       |
| `.github/workflows/smoke-test.yml`             | Create | Post-publish verification                   |
| `turbo.json`                                   | Modify | Add `bench` pipeline task                   |
| Per-package `package.json`                     | Modify | Add `test:coverage` and/or `bench` scripts  |
| Per-package `vitest.config.mts`                | Modify | Ensure coverage output for all packages     |

## Success Criteria

| #    | Criterion                                                                                                                       | Verification                                                                                            |
| ---- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| SC1  | Every PR to `main` shows a Codecov coverage report as a PR comment and GitHub check                                             | Open a test PR, confirm Codecov bot comments with coverage diff                                         |
| SC2  | CI fails if any package's line, branch, function, or statement coverage drops below its recorded baseline                       | Intentionally delete a test, push, confirm CI fails with "coverage regression" message                  |
| SC3  | `coverage-baselines.json` reflects actual current coverage for all 7 packages                                                   | Run `node scripts/coverage-ratchet.mjs --update` and verify values match `vitest --coverage` output     |
| SC4  | Vitest benchmarks exist for core validation (`validateConfig`, `validateProject`) and graph queries (ContextQL, `getImpact`)    | `pnpm bench` runs successfully and produces JSON output                                                 |
| SC5  | CI fails if any benchmark's mean regresses more than 10% from baseline                                                          | Artificially degrade a benchmarked function, push, confirm CI fails with "benchmark regression" message |
| SC6  | `benchmark-baselines.json` reflects actual current benchmark values for core and graph                                          | Run `node scripts/benchmark-check.mjs --update` and verify values match bench output                    |
| SC7  | After a successful release, a smoke test job installs `@harness-engineering/cli` from npm and verifies `harness --version` runs | Trigger a release, confirm the smoke-test workflow passes in GitHub Actions                             |
| SC8  | Smoke test verifies `@harness-engineering/core` and `@harness-engineering/types` are importable                                 | Same release trigger — confirm the Node import assertions pass                                          |
| SC9  | All new CI jobs pass on `main` after merge                                                                                      | Green CI across `ci.yml`, `benchmark.yml`, and no false-positive failures                               |
| SC10 | Existing CI behavior is not broken — 3-OS matrix, typecheck, lint, format check all still pass                                  | Verify full CI suite passes on the implementation PR                                                    |

## Implementation Order

| Phase | Deliverable                                                                                                                                                                                                      | Dependencies            | Notes                                                                                               |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- | --------------------------------------------------------------------------------------------------- |
| **1** | **Coverage output for all packages** — add `test:coverage` scripts to packages that lack them, ensure all produce `coverage-summary.json`. Add `test:ci` root script.                                            | None                    | Foundation — everything else depends on coverage output existing.                                   |
| **2** | **Coverage ratchet** — create `scripts/coverage-ratchet.mjs`, capture initial `coverage-baselines.json`, wire into CI.                                                                                           | Phase 1                 | Can merge independently. Immediate value — "never regress" is enforced from day one.                |
| **3** | **Codecov integration** — add `codecov.yml` config, add upload step to `ci.yml`, set up `CODECOV_TOKEN` secret.                                                                                                  | Phase 1                 | Independent of Phase 2. Could run in parallel but sequential is simpler to review.                  |
| **4** | **Benchmark infrastructure** — create bench files for core and graph, `scripts/benchmark-check.mjs`, capture initial `benchmark-baselines.json`, add `bench` to Turbo pipeline, create `benchmark.yml` workflow. | None (just needs build) | Independent of coverage work. Could start in parallel with Phases 2-3.                              |
| **5** | **Post-publish smoke test** — create `smoke-test.yml` workflow with install + import + version verification.                                                                                                     | None                    | Fully independent. Only testable after a real publish, but the workflow file can be merged anytime. |

Recommended execution: Phases 1, 2, 3 sequential (coverage chain). Phase 4 can parallelize with 2-3. Phase 5 anytime.
