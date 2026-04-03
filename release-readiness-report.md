# Release Readiness Report

**Date:** 2026-04-02
**Project:** harness-engineering
**Flags:** standard

## Summary

**Result: PASS**

| Category                   | Passed       | Warnings | Failures |
| -------------------------- | ------------ | -------- | -------- |
| Packaging                  | 77/77        | 0        | 0        |
| Documentation              | 6/6          | 0        | 0        |
| Repo Hygiene               | 5/5          | 0        | 0        |
| CI/CD                      | 5/5          | 0        | 0        |
| Maintenance — Doc Drift    | 19 issues    | —        | —        |
| Maintenance — Dead Code    | 0 issues     | —        | —        |
| Maintenance — Architecture | 6 violations | —        | —        |
| Maintenance — Diagnostics  | 0 issues     | —        | —        |

## Packaging

All 7 packages pass all checks:

### @harness-engineering/types (0.6.0) — PASS

### @harness-engineering/core (0.16.0) — PASS

### @harness-engineering/graph (0.3.4) — PASS

### @harness-engineering/cli (1.16.0) — PASS

### @harness-engineering/eslint-plugin (0.2.3) — PASS

### @harness-engineering/linter-gen (0.1.4) — PASS

### @harness-engineering/orchestrator (0.2.4) — PASS

All packages have: name, version, license, exports/main, files, publishConfig, repository, bugs, homepage, description.

- [x] Build succeeds (all 8 turbo tasks)
- [x] Typecheck passes (all 6 packages)
- [x] Tests pass (all 16 turbo test tasks)

## Documentation

- [x] README.md exists
- [x] README has install/quickstart section
- [x] README has usage/API section
- [x] CHANGELOG.md exists with 39+ entries
- [x] LICENSE file exists (MIT)

## Repo Hygiene

- [x] CONTRIBUTING.md exists
- [x] CODE_OF_CONDUCT.md exists
- [x] SECURITY.md exists
- [x] .gitignore covers node_modules, dist, .env
- [x] No TODO/FIXME in published source (dist/ files clean)

## CI/CD

- [x] CI workflow: .github/workflows/ci.yml
- [x] Release workflow: .github/workflows/release.yml
- [x] Benchmark workflow: .github/workflows/benchmark.yml
- [x] Smoke test workflow: .github/workflows/smoke-test.yml
- [x] test, lint, typecheck scripts in root package.json

## Maintenance Results

### Doc Drift (19 issues — 12 fail, 7 warn)

**Version drift (fail):**

- docs/api/cli.md: version 1.13.1 vs actual 1.16.0
- docs/api/core.md: version 0.15.0 vs actual 0.16.0
- docs/api/graph.md: version 0.3.3 vs actual 0.3.4, VERSION constant 0.2.0
- docs/api/eslint-plugin.md: version 0.2.2 vs actual 0.2.3
- docs/api/types.md: version 0.3.1 vs actual 0.6.0
- docs/api/linter-gen.md: version 0.1.3 vs actual 0.1.4

**Content drift (fail):**

- README.md: HarnessConfigSchema import not exported from CLI package
- docs/api/eslint-plugin.md: recommended config table incomplete, description inaccurate
- docs/guides/features-overview.md: claims 24 node/17 edge types, actual 29/22
- docs/guides/ci-cd-validation.md: missing security, perf, arch from checks

**Count drift (warn):**

- README.md: claims 50 tools (actual 49), 80 skills (actual 81), ESLint list omits 1 rule
- docs/guides/getting-started.md: claims 79 skills (actual 81), 50 tools (actual 49)
- docs/api/core.md: VERSION constant 0.15.0 stale vs package.json 0.16.0

### Dead Code (0 issues — clean)

No orphaned files, dead exports, or commented-out code blocks detected.

### Architecture (6 complexity violations)

- aggregateBySession CC=33 (packages/core/src/usage/aggregator.ts)
- for loop CC=29 (packages/core/src/usage/aggregator.ts)
- aggregateByDay CC=19 (packages/core/src/usage/aggregator.ts)
- parseFeatureFields CC=21 (packages/core/src/roadmap/parse.ts) — NEW
- getEdges CC=21 (packages/graph/src/store/GraphStore.ts) — NEW
- complexRouter CC=16 (test fixture)

### Diagnostics

Clean — 0 issues.

## Fixes Applied This Session

- Removed unused RoadmapMilestone/AssignmentRecord imports in pilot-scoring.ts (DTS build fix)
- Added assignee/priority/externalId defaults to roadmap.ts feature construction (typecheck fix)
- Created platform symlinks for harness-roadmap-pilot skill (platform parity)
- Fixed resolveReverseStatus import in github-issues.test.ts (test fix)

## Remaining Items (non-blocking maintenance warnings)

- [ ] Update stale version numbers in all docs/api/\*.md files
- [ ] Fix README HarnessConfigSchema import reference
- [ ] Update node/edge type counts in features-overview.md
- [ ] Add missing checks to ci-cd-validation.md
- [ ] Update tool and skill counts in README and getting-started
- [ ] Fix eslint-plugin.md recommended config table
- [ ] Decompose aggregateBySession/aggregateByDay complexity
- [ ] Consider decomposing parseFeatureFields and getEdges
