# Release Readiness Report

**Date:** 2026-04-07
**Project:** harness-engineering
**Flags:** standard

## Summary

**Result: PASS** (after fixes)

| Category                   | Passed        | Warnings | Failures |
| -------------------------- | ------------- | -------- | -------- |
| Packaging                  | 74/74         | 0        | 0        |
| Documentation              | 6/6           | 0        | 0        |
| Repo Hygiene               | 5/5           | 0        | 0        |
| CI/CD                      | 5/6           | 0        | 1\*      |
| i18n                       | N/A           | —        | —        |
| Maintenance — Doc Drift    | 10 issues     | —        | —        |
| Maintenance — Dead Code    | 61 issues     | —        | —        |
| Maintenance — Architecture | 11 violations | —        | —        |
| Maintenance — Diagnostics  | 3 warnings    | —        | —        |

\*CI/CD failure is `assess_project` due to stale global CLI install at `/opt/homebrew`, not a project code issue. All source-level CI/CD checks pass.

## Packaging

### @harness-engineering/eslint-plugin (0.2.3)

- [x] name: `@harness-engineering/eslint-plugin`
- [x] version: `0.2.3`
- [x] license: MIT
- [x] exports defined
- [x] files: `dist, README.md`
- [x] publishConfig: `access: public`
- [x] repository, bugs, homepage, description

### @harness-engineering/linter-gen (0.1.4)

- [x] name: `@harness-engineering/linter-gen`
- [x] version: `0.1.4`
- [x] license: MIT
- [x] exports defined
- [x] files: `dist, README.md`
- [x] publishConfig: `access: public`
- [x] repository, bugs, homepage, description

### @harness-engineering/orchestrator (0.2.5)

- [x] name: `@harness-engineering/orchestrator`
- [x] version: `0.2.5`
- [x] license: MIT
- [x] exports defined
- [x] files: `dist, README.md`
- [x] publishConfig: `access: public`
- [x] repository, bugs, homepage, description

### @harness-engineering/graph (0.4.0)

- [x] name: `@harness-engineering/graph`
- [x] version: `0.4.0`
- [x] license: MIT
- [x] exports defined
- [x] files: `dist, README.md`
- [x] publishConfig: `access: public`
- [x] repository, bugs, homepage, description

### @harness-engineering/types (0.9.0)

- [x] name: `@harness-engineering/types`
- [x] version: `0.9.0`
- [x] license: MIT
- [x] exports defined
- [x] files: `dist, README.md`
- [x] publishConfig: `access: public`
- [x] repository, bugs, homepage, description

### @harness-engineering/core (0.21.0)

- [x] name: `@harness-engineering/core`
- [x] version: `0.21.0`
- [x] license: MIT
- [x] exports defined (main + architecture/matchers)
- [x] files: `dist, README.md`
- [x] publishConfig: `access: public`
- [x] repository, bugs, homepage, description

### @harness-engineering/cli (1.23.1)

- [x] name: `@harness-engineering/cli`
- [x] version: `1.23.1`
- [x] license: MIT
- [x] exports defined
- [x] files: `dist, bin, README.md`
- [x] publishConfig: `access: public`
- [x] repository, bugs, homepage, description

### @harness-engineering/dashboard (0.1.0) — private, not published

- [x] build passes
- [x] typecheck passes
- [x] tests pass (109 tests)

### Build / Typecheck / Test / Lint

- [x] Build: 9/9 tasks successful
- [x] Typecheck: 13/13 tasks successful
- [x] Tests: 5707 tests across 457 test files — all passing
- [x] Lint: 8/8 tasks successful
- [x] Pack dry-run: clean (dist-only output, no test/src files)

## Documentation

- [x] README.md exists (15KB)
- [x] README has install/quickstart section
- [x] README has usage/API section
- [x] CHANGELOG.md exists with entries (latest: 0.14.0 — 2026-04-05)
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
- [x] `test` script in root package.json
- [x] `lint` script in root package.json
- [x] `typecheck` script in root package.json
- [ ] `assess_project` — fails due to stale global CLI install (infrastructure issue, not code)

## Maintenance Results

### Doc Drift (10 issues)

**Fixed this session (7):**

- README.md: MCP tool count 55 → 54
- docs/api/graph.md: VERSION "0.3.2" → "0.2.0"
- docs/api/graph.md: `query.run()` → `query.execute()` with correct params
- docs/api/index.md: `checkCoverage()` return type → `GraphCoverageReport`
- docs/reference/index.md: `harness.config.yml` → `harness.config.json` (all occurrences)
- docs/reference/index.md: install command `harness-cli` → `@harness-engineering/cli`
- packages/graph/README.md: node types 24→28, edge types 17→24 with Design/Traceability categories

**Remaining (3):**

- packages/orchestrator/README.md: references `LinearTrackerExtension` which does not exist
- packages/graph/src/index.ts: `VERSION` constant is `0.2.0` but package.json is `0.4.0`
- packages/linter-gen/src/engine/context-builder.ts: `GENERATOR_VERSION` is `0.1.0` but package is `0.1.4`

### Dead Code (61 issues)

- 3 dead files: `core/src/blueprint/graph-scanner.ts`, `core/src/blueprint/impact-lab-generator.ts`, `core/src/state/state-manager.ts`
- 1 dead command: `cli/src/commands/traceability.ts` (never registered)
- 5 orphaned dependencies: cli (`@typescript-eslint/typescript-estree`, `ejs`, `tree-sitter-wasms`, `web-tree-sitter`), orchestrator (`chokidar`)
- 22 unused exports across cli, core, orchestrator
- 30 unused imports across cli, core

### Architecture (11 violations)

All are cyclomatic complexity > 15 threshold:

| File                                            | Function                  | CC  |
| ----------------------------------------------- | ------------------------- | --- |
| graph/src/query/Traceability.ts                 | for loop                  | 40  |
| graph/src/query/Traceability.ts                 | for loop                  | 32  |
| core/src/usage/aggregator.ts                    | aggregateBySession        | 33  |
| core/src/usage/aggregator.ts                    | for loop                  | 29  |
| dashboard/src/server/context.ts                 | buildContext              | 25  |
| cli/src/commands/traceability.ts                | createTraceabilityCommand | 23  |
| graph/src/store/GraphStore.ts                   | getEdges                  | 21  |
| core/src/roadmap/parse.ts                       | parseFeatureFields        | 21  |
| core/src/usage/aggregator.ts                    | aggregateByDay            | 19  |
| core/src/architecture/prediction-engine.ts      | predict                   | 16  |
| core/tests/entropy/detectors/complexity.test.ts | complexRouter             | 16  |

Additionally: dashboard package missing from `harness.config.json` layer definitions.

### Diagnostics (3 warnings)

- 1 build warning: `import.meta` in CJS build (core/src/code-nav/parser.ts:41) — has runtime fallback
- 2 moderate security advisories: `esbuild` and `vite` via `vitepress` transitive deps (dev-only, not shipped)

## Fixes Applied This Session

1. README.md: MCP tool count 55 → 54
2. docs/api/graph.md: VERSION "0.3.2" → "0.2.0"
3. docs/api/graph.md: `query.run()` → `query.execute()` with correct params
4. docs/api/index.md: `checkCoverage()` return type fixed
5. docs/reference/index.md: config format yml → json (5 occurrences)
6. docs/reference/index.md: install command fixed
7. packages/graph/README.md: node/edge type counts and tables updated

## Remaining Items

- [ ] Orchestrator README: remove or mark `LinearTrackerExtension` as planned
- [ ] `graph/src/index.ts`: update VERSION constant from 0.2.0 to 0.4.0
- [ ] `linter-gen/src/engine/context-builder.ts`: update GENERATOR_VERSION from 0.1.0 to 0.1.4
- [ ] Refactor Traceability.ts (CC=40, CC=32) — highest priority complexity
- [ ] Refactor aggregator.ts (CC=33, CC=29, CC=19)
- [ ] Refactor dashboard context.ts (CC=25)
- [ ] Remove 3 dead files in core/src/blueprint and core/src/state
- [ ] Remove or register traceability command in CLI
- [ ] Remove 5 orphaned dependencies
- [ ] Clean up 22 unused exports and 30 unused imports
- [ ] Add dashboard to harness.config.json layer definitions
- [ ] Upgrade vitepress to resolve moderate security advisories
- [ ] Reinstall global CLI (`npm install -g @harness-engineering/cli`) to fix assess_project
