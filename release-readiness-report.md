# Release Readiness Report

**Date:** 2026-03-27
**Project:** harness-engineering
**Flags:** standard

## Summary

**Result: PASS**

| Category                   | Passed       | Warnings | Failures |
| -------------------------- | ------------ | -------- | -------- |
| Packaging                  | 94/94        | 0        | 0        |
| Documentation              | 6/6          | 0        | 0        |
| Repo Hygiene               | 5/5          | 0        | 0        |
| CI/CD                      | 6/6          | 0        | 0        |
| i18n                       | N/A          | —        | —        |
| Maintenance — Doc Drift    | unavailable  | —        | —        |
| Maintenance — Dead Code    | unavailable  | —        | —        |
| Maintenance — Architecture | 0 violations | —        | —        |
| Maintenance — Diagnostics  | 1 advisory   | —        | —        |

## Packaging

### All 7 Packages — PASS

Each package passes all 10 metadata checks:

| Package                            | Version | All Fields                                                                                     |
| ---------------------------------- | ------- | ---------------------------------------------------------------------------------------------- |
| @harness-engineering/cli           | 1.13.0  | name, version, license, exports, files, publishConfig, repository, bugs, homepage, description |
| @harness-engineering/core          | 0.13.0  | all present                                                                                    |
| @harness-engineering/types         | 0.3.1   | all present                                                                                    |
| @harness-engineering/graph         | 0.3.2   | all present                                                                                    |
| @harness-engineering/orchestrator  | 0.2.2   | all present                                                                                    |
| @harness-engineering/eslint-plugin | 0.2.1   | all present                                                                                    |
| @harness-engineering/linter-gen    | 0.1.3   | all present                                                                                    |

### Build/Test/Lint

- [x] Build succeeds (all 8 build tasks)
- [x] Typecheck passes (all 12 typecheck tasks)
- [x] Tests pass (139 files, 1153 tests)
- [x] Lint passes
- [x] `pnpm pack --dry-run` clean (dist-only, no test/src leakage)

## Documentation

- [x] README.md exists with install/quickstart and usage sections
- [x] CHANGELOG.md exists with entries (v0.1.0 through v0.6.0)
- [x] LICENSE file exists (MIT)

## Repo Hygiene

- [x] CONTRIBUTING.md exists
- [x] CODE_OF_CONDUCT.md exists (Contributor Covenant)
- [x] SECURITY.md exists
- [x] .gitignore covers node_modules, dist, .env
- [x] Zero TODO/FIXME in published source files

## CI/CD

- [x] CI workflow: `.github/workflows/ci.yml` (cross-platform: ubuntu, windows, macos)
- [x] Release workflow: `.github/workflows/release.yml` (Changesets + npm provenance)
- [x] `test` script exists in root package.json
- [x] `lint` script exists in root package.json
- [x] `typecheck` script exists in root package.json
- [x] Build pipeline: turbo-powered parallel execution

## Maintenance Results

### Architecture

0 layer violations, 0 circular dependencies, 0 forbidden imports. Clean DAG:
types → graph → core → cli/orchestrator.

63 baselined cyclomatic complexity violations (pre-existing, not new).

### Diagnostics

Advisory findings (not blocking):

- `cli/src/mcp/tools/graph.ts` at 821 lines is the largest file — candidate for splitting
- MCP tool files show signs of architectural drift (business logic in tool layer)
- `core/src/index.ts` barrel imported by 46 files

### Doc Drift

Unavailable — agent hit resource limits. Run `/harness:detect-doc-drift` separately.

### Dead Code

Unavailable — agent hit resource limits. Run `/harness:cleanup-dead-code` separately.

## Fixes Applied This Session

1. Updated MCP tool count assertion 45→46 in `server.test.ts` (new `search_skills` tool)
2. Updated MCP tool count assertion 45→46 in `server-integration.test.ts`
3. Added `search_skills` to integration test `toContain` assertions
4. Refactored `runSingleCheck` in `check-orchestrator.ts` — extracted 8 named handler functions, reducing cyclomatic complexity from 63 to ~10

## Remaining Items

- [ ] Split `cli/src/mcp/tools/graph.ts` (821 lines) into per-tool modules
- [ ] Run doc drift check separately: `/harness:detect-doc-drift`
- [ ] Run dead code check separately: `/harness:cleanup-dead-code`
- [ ] Consider subpath exports for `@harness-engineering/core` to reduce barrel coupling
