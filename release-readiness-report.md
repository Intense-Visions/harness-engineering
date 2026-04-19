# Release Readiness Report

**Date:** 2026-04-18
**Project:** harness-engineering
**Flags:** standard

## Summary

**Result: PASS**

| Category                   | Passed             | Warnings | Failures |
| -------------------------- | ------------------ | -------- | -------- |
| Packaging                  | 14/14              | 0        | 0        |
| Documentation              | 6/6                | 0        | 0        |
| Repo Hygiene               | 5/5                | 0        | 0        |
| CI/CD                      | 6/6                | 0        | 0        |
| i18n                       | N/A                | —        | —        |
| Maintenance — Doc Drift    | 6 issues (5 fixed) | —        | —        |
| Maintenance — Dead Code    | 4 issues           | —        | —        |
| Maintenance — Architecture | 1 violation        | —        | —        |
| Maintenance — Diagnostics  | 6 findings         | —        | —        |

## Packaging

### All 9 packages (@harness-engineering/\*)

- [x] name: scoped `@harness-engineering/*`
- [x] version: valid semver (0.1.0–1.24.3)
- [x] license: MIT
- [x] exports/main entry point defined
- [x] files field defined
- [x] publishConfig: access public
- [x] repository field
- [x] bugs field
- [x] homepage field
- [x] description field
- [x] Build succeeds (10/10 turbo tasks)
- [x] Typecheck passes (16/16 turbo tasks)
- [x] Tests pass (20/20 turbo tasks, gate.test.ts timeout fixed)
- [x] No TODO/FIXME in published dist files

## Documentation

- [x] README.md exists
- [x] README has install/quickstart section
- [x] README has usage/API section
- [x] CHANGELOG.md exists with 14 version entries
- [x] LICENSE file exists (MIT)

## Repo Hygiene

- [x] CONTRIBUTING.md exists
- [x] CODE_OF_CONDUCT.md exists
- [x] SECURITY.md exists
- [x] .gitignore covers node_modules, dist, .env
- [x] No TODO/FIXME in published source files

## CI/CD

- [x] CI workflow: `.github/workflows/ci.yml`
- [x] Release workflow: `.github/workflows/release.yml`
- [x] `test` script exists in root package.json
- [x] `lint` script exists in root package.json
- [x] `typecheck` script exists in root package.json
- [x] `assess_project` passes (healthy: true)

## Maintenance Results

### Doc Drift

6 issues found (5 fixed this session):

- [x] ~~README.md:248 skill count stale (485 → 736)~~ — fixed
- [x] ~~README.md:171 MCP tools count stale (55 → 58)~~ — fixed
- [x] ~~README.md packages table missing intelligence package~~ — fixed
- [x] ~~docs/api/cli.md:6 version stale (1.24.0 → 1.24.3)~~ — fixed
- [x] ~~packages/intelligence/README.md missing openai dependency~~ — fixed
- [ ] packages/dashboard/README.md does not exist — needs human-authored content

### Dead Code

4 categories found:

- 28 unused type exports across types/intelligence/linter-gen (low — may be intentional public API)
- 1 unused value export: `scoreCML` in packages/intelligence/src/cml/scorer.ts (medium)
- 1 unused dependency: `@tremor/react` in packages/dashboard (medium)
- 2 commented-out code blocks: core/src/entropy/snapshot.ts, core/src/context/doc-coverage.ts (low)

### Architecture

1 violation:

- Circular dependency: `packages/cli/src/commands/setup.ts` ↔ `telemetry-wizard.ts` (type-only import cycle). Fix: extract `StepResult` into shared types file.
- Baseline regressions: module-size +1550, dependency-depth +14 (may need `harness check-arch --update-baseline`)

### Diagnostics

2 errors, 4 warnings:

- **E1:** Circular dependency setup.ts ↔ telemetry-wizard.ts (same as architecture finding)
- **E2:** `harness check-perf` cannot resolve entry points — add entry point config to harness.config.json
- **W1:** ~~intelligence missing from root tsconfig.json references~~ — fixed
- **W2:** eslint-plugin extends `../../tsconfig.json` instead of `../../tsconfig.base.json`
- **W3:** Inconsistent `"type"` field across packages (4 ESM, 5 CJS-default)
- **W4:** Dashboard client bundle 1.3MB — consider code-splitting

## Fixes Applied

1. Updated package count in README.md (8 → 9)
2. Updated skill count in README.md (485 → 736)
3. Updated MCP tools count in README.md (55 → 58)
4. Added intelligence package row to README.md packages table
5. Updated CLI version in docs/api/cli.md (1.24.0 → 1.24.3)
6. Added openai to intelligence README dependency list
7. Added intelligence to root tsconfig.json project references

## Remaining Items

**Should fix (maintenance findings):**

- [ ] Write dashboard README.md
- [ ] Extract `StepResult` from setup.ts to break circular dep with telemetry-wizard.ts
- [ ] Add entry point config to harness.config.json for check-perf
- [ ] Change eslint-plugin tsconfig to extend `../../tsconfig.base.json`
- [ ] Verify and remove unused `@tremor/react` from dashboard
- [ ] Remove unused `scoreCML` export from intelligence
- [ ] Remove commented-out code from core/src/entropy/snapshot.ts and core/src/context/doc-coverage.ts
- [ ] Unify `"type"` field across packages
- [ ] Add code-splitting to dashboard build
- [ ] Update arch baselines: `harness check-arch --update-baseline`
