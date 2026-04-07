# Release Readiness Report

**Date:** 2026-04-07
**Project:** harness-engineering
**Flags:** standard
**Run:** 2 (post-merge with origin/main)

## Summary

**Result: PASS** (after fixes)

| Category                    | Passed      | Warnings | Failures |
| --------------------------- | ----------- | -------- | -------- |
| Packaging                   | 74/74       | 0        | 0        |
| Documentation               | 6/6         | 0        | 0        |
| Repo Hygiene                | 5/5         | 0        | 0        |
| CI/CD                       | 5/6         | 0        | 1\*      |
| i18n                        | N/A         | --       | --       |
| Maintenance -- Doc Drift    | 0 remaining | --       | --       |
| Maintenance -- Dead Code    | 1 remaining | --       | --       |
| Maintenance -- Architecture | 1 remaining | --       | --       |
| Maintenance -- Diagnostics  | 3 warnings  | --       | --       |

\*CI/CD failure is `assess_project` due to stale global CLI install at `/opt/homebrew`. Fix: `npm install -g @harness-engineering/cli`.

## Packaging

All 7 publishable packages pass all checks (name, version, license, exports, files, publishConfig, repository, bugs, homepage, description).

- Build: 9/9 successful
- Typecheck: 13/13 successful
- Tests: 5700+ across 457 test files -- all passing
- Lint: 8/8 successful
- Pack dry-run: clean (dist-only, no test/src files)

Dashboard (`@harness-engineering/dashboard`) is private -- not published.

## Documentation

- [x] README.md exists
- [x] README has install/quickstart section
- [x] README has usage/API section
- [x] CHANGELOG.md exists with entries (latest: 0.14.0 -- 2026-04-05)
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
- [ ] `assess_project` -- stale global CLI install (infrastructure, not code)

## Maintenance Results

### Doc Drift -- RESOLVED

**Fixed this session (16 total):**

Run 1 (pre-merge):

1. README.md: MCP tool count 55 -> 54
2. docs/api/graph.md: VERSION "0.3.2" -> "0.4.0"
3. docs/api/graph.md: Overview `query.run()` -> `query.execute()` with correct params
4. docs/api/index.md: `checkCoverage()` return type -> `GraphCoverageReport`
5. docs/reference/index.md: `harness.config.yml` -> `harness.config.json` (all occurrences)
6. docs/reference/index.md: install command `harness-cli` -> `@harness-engineering/cli`
7. packages/graph/README.md: node types 24->28, edge types 17->24 with Design/Traceability

Run 2 (post-merge): 8. docs/api/graph.md: ContextQL example `cql.run()` -> `cql.execute()` (second instance) 9. docs/api/graph.md: Assembler constructor signature corrected 10. docs/api/index.md: Assembler constructor signature corrected 11. docs/api/cli.md: version 1.22.0 -> 1.23.1 12. docs/api/core.md: version 0.20.0 -> 0.21.0 13. docs/api/types.md: version 0.8.1 -> 0.9.0 14. docs/guides/getting-started.md: skills 79->81, tools 53->54 15. docs/inspirations.md: ESLint rules 10->11, skills 79->81 16. packages/orchestrator/README.md: LinearTrackerExtension marked as _(planned)_

**Stale version constants fixed:**

- `packages/graph/src/index.ts`: VERSION 0.2.0 -> 0.4.0
- `packages/linter-gen/src/engine/context-builder.ts`: GENERATOR_VERSION 0.1.0 -> 0.1.4

**Type documentation updated:**

- `docs/api/types.md`: CICheckName +arch +traceability, RoadmapFeature +assignee/priority/externalId, added Priority type, added AssignmentRecord interface, Roadmap +assignmentHistory

**New documentation sections written:**

- `docs/api/graph.md`: RequirementIngestor, GraphAnomalyAdapter, TaskIndependenceAnalyzer, ConflictPredictor, CascadeSimulator, CompositeProbabilityStrategy, askGraph/NLQ, queryTraceability, groupNodesByImpact
- `docs/api/core.md`: code-nav, pricing, usage, blueprint, architecture modules
- `docs/api/cli.md`: command table expanded from 28 to 50 commands across 10 categories

### Dead Code -- 1 item remaining

**Fixed this session:**

- Registered `createDashboardCommand` in CLI `_registry.ts` (was dead code)
- Wired `dispatch-session.ts` session-start dispatch into CLI startup
- Removed 3 orphaned dependencies (graph/@harness-engineering/types, orchestrator/chokidar)

**Remaining:**

- `packages/core/src/blueprint/graph-scanner.ts` -- dead file (not imported). Needs confirmation before deletion.

### Architecture -- 1 item remaining

**Fixed this session (10 CC violations resolved):**

| File                                   | Before        | After | Helpers |
| -------------------------------------- | ------------- | ----- | ------- |
| graph/query/Traceability.ts            | CC=40, 32     | <15   | 5       |
| core/usage/aggregator.ts               | CC=33, 29, 19 | <15   | 7       |
| dashboard/server/context.ts            | CC=25         | <15   | 2       |
| graph/store/GraphStore.ts              | CC=21         | <15   | 2       |
| core/roadmap/parse.ts                  | CC=21         | <15   | 3       |
| cli/commands/traceability.ts           | CC=23         | <15   | 7       |
| core/architecture/prediction-engine.ts | CC=16         | <15   | 3       |

**Remaining:**

- `core/tests/entropy/detectors/complexity.test.ts` complexRouter CC=16 -- intentionally complex test fixture

### Diagnostics (3 warnings -- pre-existing)

- 1 build warning: `import.meta` in CJS build (core/src/code-nav/parser.ts:41) -- has runtime fallback
- 2 moderate security advisories: `esbuild` and `vite` via `vitepress` transitive deps (dev-only)

## All Fixes Applied This Session

### Doc Drift (16 fixes)

1-16. See Doc Drift section above

### Code Fixes (15 fixes)

1. graph/src/index.ts: VERSION constant 0.2.0 -> 0.4.0
2. linter-gen/src/engine/context-builder.ts: GENERATOR_VERSION 0.1.0 -> 0.1.4
3. cli/commands/\_registry.ts: registered createDashboardCommand
4. cli/bin/harness.ts: wired session-start dispatch
5. Removed @harness-engineering/types from graph/package.json
6. Removed chokidar from orchestrator/package.json
   7-13. Refactored 7 files to reduce cyclomatic complexity (29 helpers extracted)
7. docs/api/types.md: updated CICheckName, RoadmapFeature, Roadmap, added Priority, AssignmentRecord
8. orchestrator/README.md: marked LinearTrackerExtension as planned

### Documentation (3 new sections)

1. docs/api/graph.md: 8 export groups documented (RequirementIngestor, NLQ, Blast Radius, etc.)
2. docs/api/core.md: 5 modules documented (code-nav, pricing, usage, blueprint, architecture)
3. docs/api/cli.md: command table expanded to 50 commands

## Remaining Items

- [ ] Reinstall global CLI: `npm install -g @harness-engineering/cli`
- [ ] `core/src/blueprint/graph-scanner.ts` -- confirm dead, then delete
- [ ] Upgrade vitepress to resolve 2 moderate security advisories
- [ ] Plan turbo v1 -> v2 migration
- [ ] Tighten dashboard tsconfig (re-enable noUnusedLocals/noUnusedParameters)
